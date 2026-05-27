import { z } from "zod";
import type { ToolDef } from "../lib/types.js";
import { MARKETS } from "../data/markets.js";

const Input = z.object({
  category: z
    .enum([
      "thai-politics",
      "thai-climate",
      "thai-vet",
      "sea-elections",
      "crypto",
      "global-tech",
      "global-sports",
      "ai-research",
    ])
    .optional()
    .describe("Filter to a single category. Omit to list all categories."),
  status: z
    .enum(["open", "closing-soon", "resolved"])
    .optional()
    .describe("Filter by market status."),
  sortBy: z
    .enum(["volume", "open-interest", "closing-soonest", "newest"])
    .default("volume")
    .describe("Sort order. Default: highest volume first."),
  limit: z.number().int().min(1).max(50).default(10),
});

export const listMarketsTool: ToolDef<typeof Input> = {
  name: "foresight_list_markets",
  description:
    "Browse the live forecasting marketplace. Filter by category (thai-politics, crypto, ai-research, etc.) and status, sort by volume or deadline. Returns market id, slug, question, YES probability, volume, open interest, and closing date. Read-only; no cost.",
  schema: Input,
  handler: async (args) => {
    let pool = [...MARKETS];

    if (args.category) pool = pool.filter((m) => m.category === args.category);
    if (args.status) pool = pool.filter((m) => m.status === args.status);

    pool.sort((a, b) => {
      switch (args.sortBy) {
        case "open-interest":
          return b.openInterestUsd - a.openInterestUsd;
        case "closing-soonest":
          return (
            new Date(a.closesAt).getTime() - new Date(b.closesAt).getTime()
          );
        case "newest":
          return b.id.localeCompare(a.id);
        case "volume":
        default:
          return b.volumeUsd - a.volumeUsd;
      }
    });

    const trimmed = pool.slice(0, args.limit).map((m) => ({
      id: m.id,
      slug: m.slug,
      question: m.questionEn ?? m.question,
      category: m.category,
      status: m.status,
      yesProbability: m.yesProbability,
      noProbability: Number((1 - m.yesProbability).toFixed(2)),
      volumeUsd: m.volumeUsd,
      openInterestUsd: m.openInterestUsd,
      closesAt: m.closesAt,
      url: `https://foresight.cuvetsmo.com/markets/${m.slug}`,
    }));

    return {
      count: trimmed.length,
      totalAvailable: pool.length,
      filters: { category: args.category, status: args.status, sortBy: args.sortBy },
      markets: trimmed,
    };
  },
};
