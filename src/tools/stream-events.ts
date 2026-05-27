import { z } from "zod";
import type { ToolDef } from "../lib/types.js";

const Input = z.object({
  market: z
    .string()
    .optional()
    .describe(
      "Optional market id/slug to filter the stream. Omit to receive events for all markets.",
    ),
  since: z
    .string()
    .optional()
    .describe(
      "ISO 8601 cursor — only return events newer than this timestamp. First call omits; subsequent calls use the last returned 'cursor'.",
    ),
});

interface StreamEvent {
  cursor: string;
  type: "price-tick" | "trade" | "market-open" | "market-close" | "resolution";
  marketId: string;
  marketSlug: string;
  marketUrl: string;
  data: Record<string, unknown>;
  ts: string;
}

/**
 * Poll-style event stream. Returns a batch of events since the cursor.
 *
 * Phase 0 returns a small synthetic batch so agents can validate the protocol
 * shape end-to-end. Phase 1 will wire to Supabase realtime + a server-side
 * websocket bridge; the MCP tool stays poll-based because MCP itself is
 * request/response.
 */
export const streamEventsTool: ToolDef<typeof Input> = {
  name: "foresight_stream_events",
  description:
    "Poll for recent market events: price ticks, trades, market open/close, resolutions. Filter by market or fetch globally. Returns a cursor; call again with `since` set to the cursor to fetch the next batch. Designed for agent loops that watch markets without consuming a websocket connection.",
  schema: Input,
  handler: async (args) => {
    const now = Date.now();
    const recent: StreamEvent[] = [];

    // Synthetic events spanning the last ~10 minutes so callers see plausible shape
    const synthetics: Array<{
      offsetSec: number;
      type: StreamEvent["type"];
      marketId: string;
      marketSlug: string;
      data: Record<string, unknown>;
    }> = [
      {
        offsetSec: -540,
        type: "price-tick",
        marketId: "th-elec-2027",
        marketSlug: "thailand-snap-election-before-q4-2027",
        data: { yes: 0.41, no: 0.59, source: "synthetic" },
      },
      {
        offsetSec: -420,
        type: "price-tick",
        marketId: "btc-200k-2026",
        marketSlug: "btc-touch-200k-by-eoy-2026",
        data: { yes: 0.28, no: 0.72, source: "synthetic" },
      },
      {
        offsetSec: -180,
        type: "trade",
        marketId: "th-elec-2027",
        marketSlug: "thailand-snap-election-before-q4-2027",
        data: { side: "yes", shares: 120, priceCents: 42, source: "synthetic" },
      },
      {
        offsetSec: -60,
        type: "price-tick",
        marketId: "th-elec-2027",
        marketSlug: "thailand-snap-election-before-q4-2027",
        data: { yes: 0.42, no: 0.58, source: "synthetic" },
      },
    ];

    for (const s of synthetics) {
      const ts = new Date(now + s.offsetSec * 1000).toISOString();
      if (args.since && ts <= args.since) continue;
      if (
        args.market &&
        args.market !== s.marketId &&
        args.market !== s.marketSlug
      ) {
        continue;
      }
      recent.push({
        cursor: ts,
        type: s.type,
        marketId: s.marketId,
        marketSlug: s.marketSlug,
        marketUrl: `https://foresight.cuvetsmo.com/markets/${s.marketSlug}`,
        data: s.data,
        ts,
      });
    }

    const nextCursor =
      recent.length > 0 ? recent[recent.length - 1].cursor : (args.since ?? new Date(now).toISOString());

    return {
      events: recent,
      count: recent.length,
      cursor: nextCursor,
      pollIntervalSec: 30,
      note:
        "Phase 0 returns synthetic events for protocol validation. Phase 1 wires Supabase realtime + websocket bridge — same response shape.",
    };
  },
};
