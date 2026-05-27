import { z } from "zod";
import type { ToolDef } from "../lib/types.js";
import { findMarket } from "../data/source.js";
import { NotFoundError } from "../lib/errors.js";

const Input = z.object({
  identifier: z
    .string()
    .min(1)
    .describe(
      "Market id (e.g., 'th-elec-2027') or slug (e.g., 'thailand-snap-election-before-q4-2027'). Either works.",
    ),
});

export const getMarketTool: ToolDef<typeof Input> = {
  name: "foresight_get_market",
  description:
    "Get full details for a single market: question, current YES probability, NO probability, price history, volume, open interest, deadline, resolution criteria, named primary sources, tags, creator. Use after foresight_list_markets to drill into one.",
  schema: Input,
  handler: async (args) => {
    const market = await findMarket(args.identifier);
    if (!market) {
      throw new NotFoundError("foresight", `market '${args.identifier}'`);
    }

    return {
      id: market.id,
      slug: market.slug,
      question: market.question,
      questionEn: market.questionEn,
      category: market.category,
      status: market.status,
      probabilities: {
        yes: market.yesProbability,
        no: Number((1 - market.yesProbability).toFixed(2)),
      },
      volume: {
        usd: market.volumeUsd,
        openInterestUsd: market.openInterestUsd,
      },
      timing: {
        closesAt: market.closesAt,
        daysLeft: Math.max(
          0,
          Math.round(
            (new Date(market.closesAt).getTime() - Date.now()) / 86_400_000,
          ),
        ),
      },
      resolution: {
        criteria: market.resolutionCriteria,
        sources: market.resolutionSources,
      },
      priceHistory: market.priceHistory ?? [],
      tags: market.tags,
      createdBy: market.createdBy,
      url: `https://foresight.cuvetsmo.com/markets/${market.slug}`,
    };
  },
};
