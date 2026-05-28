import { z } from "zod";
import type { ToolDef } from "../lib/types.js";
import { apiBase, findMarket } from "../data/source.js";
import { NotFoundError, UpstreamError } from "../lib/errors.js";

const Input = z.object({
  identifier: z
    .string()
    .optional()
    .describe(
      "Market id or slug to look up. The endpoint derives search terms from the market automatically. Omit to use free-text mode via `query`.",
    ),
  query: z
    .string()
    .optional()
    .describe(
      "Free-text query (used when `identifier` is omitted). e.g., 'Bank of Thailand rate cut'.",
    ),
  terms: z
    .array(z.string())
    .optional()
    .describe(
      "Optional AND-group keyword sets for free-text mode. Each string is a comma-separated group; a venue market matches if ALL terms in ANY group are present. e.g., ['bank,thailand', 'rate,cut'].",
    ),
});

interface VenueMatch {
  source: "polymarket" | "kalshi" | "manifold";
  id: string;
  question: string;
  yesProbability?: number;
  liquidityUsd?: number;
  volumeUsd?: number;
  closesAt?: string;
  url: string;
}

interface CrossVenuePayload {
  query: string;
  polymarket: VenueMatch[];
  kalshi: VenueMatch[];
  manifold: VenueMatch[];
  exclusiveToForesight: boolean;
  fetchedMs: number;
  error?: string;
}

/**
 * Query the live cross-venue endpoint — Polymarket + Kalshi + Manifold
 * matches for a Foresight market (by identifier) or any free-text query.
 *
 * This makes the MCP server a forecasting-data hub: any agent can ask
 * "what do the major venues price this at?" without holding three API
 * integrations itself. The endpoint caches 1h server-side; data is
 * public, no auth, no affiliation.
 *
 * `exclusiveToForesight: true` is the strategically interesting answer —
 * it means no major venue lists the topic, which is exactly the niche
 * (SEA politics, Thai climate, vet outbreaks, frontier research) that
 * Foresight exists to price.
 */
export const crossVenueTool: ToolDef<typeof Input> = {
  name: "foresight_cross_venue",
  description:
    "Look up how Polymarket, Kalshi, and Manifold price a question — by Foresight market id/slug, or by free-text query. Returns each venue's matching markets with YES probability, volume, and liquidity. When all three return nothing, `exclusiveToForesight` is true: the topic is priced here and nowhere else. Read-only; data is public + cached 1h.",
  schema: Input,
  handler: async (args) => {
    let url: string;

    if (args.identifier) {
      // Validate the market exists first so we return a clean NotFound
      // instead of a confusing empty cross-venue result.
      const market = await findMarket(args.identifier);
      if (!market) {
        throw new NotFoundError("foresight", `market '${args.identifier}'`);
      }
      url = `${apiBase()}/api/cross-venue?slug=${encodeURIComponent(market.slug)}`;
    } else if (args.query) {
      const params = new URLSearchParams({ q: args.query });
      for (const group of args.terms ?? []) {
        params.append("terms", group);
      }
      url = `${apiBase()}/api/cross-venue?${params.toString()}`;
    } else {
      throw new UpstreamError(
        "Provide either `identifier` (market id/slug) or `query` (free text).",
      );
    }

    let payload: CrossVenuePayload;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      payload = (await res.json()) as CrossVenuePayload;
    } catch (err) {
      throw new UpstreamError(
        `Cross-venue lookup failed: ${err instanceof Error ? err.message : String(err)}. The venues' public APIs may be rate-limiting; retry shortly.`,
      );
    }

    // Defensive: the deployed API version and this package version can
    // drift independently (e.g., the manifold[] field ships in a later
    // deploy). Default every venue array so a missing field never throws.
    const polymarket = payload.polymarket ?? [];
    const kalshi = payload.kalshi ?? [];
    const manifold = payload.manifold ?? [];
    const totalMatches = polymarket.length + kalshi.length + manifold.length;

    return {
      query: payload.query,
      exclusiveToForesight: payload.exclusiveToForesight ?? totalMatches === 0,
      totalMatches,
      venues: {
        polymarket,
        kalshi,
        manifold,
      },
      interpretation: payload.exclusiveToForesight
        ? "No major venue lists this topic — it is priced on Foresight and nowhere else. This is the niche the giants overlook (regional, vertical, frontier)."
        : `${totalMatches} matching market(s) found across the major venues. Compare their YES probabilities to spot pricing spreads.`,
      fetchedMs: payload.fetchedMs,
      attribution:
        "Public Polymarket Gamma + Kalshi + Manifold (MIT) APIs · cached 1h · no affiliation",
    };
  },
};
