import type { Market } from "../lib/types.js";
import { MARKETS as SEED } from "./markets.js";

/**
 * Data source — fetch live markets from the Foresight web app's
 * /api/markets endpoint, with a 5-minute in-process cache, and a hard
 * fallback to the bundled seed when the API is unreachable.
 *
 * This means:
 *   - `foresight_list_markets` returns current live state by default
 *   - The MCP CLI works offline / behind firewalls (degrades to seed)
 *   - Single source of truth: the same Supabase row drives both the
 *     web UI and the MCP tools
 *
 * Configure via:
 *   FORESIGHT_API_BASE  (default https://foresight.cuvetsmo.com)
 *   FORESIGHT_OFFLINE   ("1" / "true" to skip the network and always
 *                        return the bundled seed — useful for tests)
 */

const DEFAULT_BASE = "https://foresight.cuvetsmo.com";
const CACHE_TTL_MS = 5 * 60 * 1000;

interface ApiPayload {
  version?: number;
  count?: number;
  generatedAt?: string;
  markets?: Market[];
}

let cache: { ts: number; data: Market[]; live: boolean } | null = null;

function isOffline(): boolean {
  const v = process.env.FORESIGHT_OFFLINE;
  return v === "1" || v === "true";
}

export function apiBase(): string {
  return process.env.FORESIGHT_API_BASE || DEFAULT_BASE;
}

export async function getMarkets(): Promise<{ markets: Market[]; live: boolean }> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return { markets: cache.data, live: cache.live };
  }

  if (isOffline()) {
    cache = { ts: Date.now(), data: SEED, live: false };
    return { markets: SEED, live: false };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${apiBase()}/api/markets`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as ApiPayload;
    const markets = Array.isArray(json.markets) ? json.markets : [];
    if (markets.length === 0) throw new Error("empty markets payload");
    cache = { ts: Date.now(), data: markets, live: true };
    return { markets, live: true };
  } catch (err) {
    // Degrade quietly to the bundled seed. stderr-only — keeps stdio JSON-RPC clean.
    console.error(
      `[foresight-mcp] live fetch failed (${err instanceof Error ? err.message : String(err)}), using bundled seed`,
    );
    cache = { ts: Date.now(), data: SEED, live: false };
    return { markets: SEED, live: false };
  }
}

export async function findMarket(
  identifier: string,
): Promise<Market | undefined> {
  const { markets } = await getMarkets();
  return markets.find((m) => m.id === identifier || m.slug === identifier);
}
