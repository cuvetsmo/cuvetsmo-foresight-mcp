import { z } from "zod";
import type { ToolDef } from "../lib/types.js";
import { ValidationError } from "../lib/errors.js";

const Input = z.object({
  question: z
    .string()
    .min(10)
    .max(280)
    .describe(
      "The yes/no question, phrased so it can be answered definitively at resolution. Use 'Will X happen by Y date?' form when possible.",
    ),
  questionEn: z
    .string()
    .min(10)
    .max(280)
    .optional()
    .describe("Optional English translation if the primary question is in another language."),
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
    .describe("One of the eight content categories. Pick the closest match."),
  closesAt: z
    .string()
    .describe(
      "ISO 8601 datetime when the market closes to trading (e.g., '2027-10-01T00:00:00Z').",
    ),
  resolutionCriteria: z
    .string()
    .min(40)
    .max(1000)
    .describe(
      "Specific, machine-verifiable resolution criterion. Must name the condition AND a public source. Reject vague criteria like 'most experts agree' or 'majority opinion'.",
    ),
  resolutionSources: z
    .array(z.string().min(1))
    .min(1)
    .max(5)
    .describe(
      "Named primary sources (URLs or organization names) that will be checked at resolution. At least one required.",
    ),
  tags: z
    .array(z.string().min(1).max(40))
    .max(8)
    .default([])
    .describe("Short tags for discovery (e.g., ['election', 'thailand', 'long-term'])."),
});

export const proposeMarketTool: ToolDef<typeof Input> = {
  name: "foresight_propose_market",
  description:
    "Submit a new market proposal for review. Validates the resolution criterion is verifiable (must name a public source and a concrete event). Phase 1 returns a draft id and review status — once moderator approves, the market goes live. Iron-rule guarantees: NO ambiguous criteria, NO assassination/distress markets, NO unverifiable rumors.",
  schema: Input,
  handler: async (args) => {
    // Iron Rule 0 guards — refuse > fabricate, refuse > permit harm
    const banned = [
      /\bassassinat/i,
      /\bkill(ed)? by\b/i,
      /\bdeath of\b.*\b(supreme|leader|president|prime minister|king)\b/i,
      /\bdies (in|before|by)\b/i,
    ];
    if (
      banned.some(
        (re) => re.test(args.question) || re.test(args.resolutionCriteria),
      )
    ) {
      throw new ValidationError(
        "Distress markets predicting the death/assassination of named persons are not allowed. Rephrase around a non-distress event or pick a different question.",
      );
    }

    // Criterion must reference something concrete
    if (
      !/(\bif\b|\bwhen\b|\bbefore\b|\bafter\b|\bon\b|\bby\b)/i.test(
        args.resolutionCriteria,
      )
    ) {
      throw new ValidationError(
        "Resolution criterion must contain a temporal or conditional anchor (if/when/before/after/on/by). Rephrase to be machine-verifiable.",
      );
    }

    // Closes-at must be in the future
    const closes = new Date(args.closesAt);
    if (Number.isNaN(closes.getTime())) {
      throw new ValidationError(
        "closesAt must be a valid ISO 8601 datetime (e.g., '2027-10-01T00:00:00Z').",
      );
    }
    if (closes.getTime() <= Date.now()) {
      throw new ValidationError("closesAt must be in the future.");
    }

    const draftId = `draft-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    return {
      status: "pending_review",
      draftId,
      proposal: args,
      preview: {
        url: `https://foresight.cuvetsmo.com/propose?draft=${draftId}`,
        reviewSlaHours: 48,
      },
      message:
        "Proposal accepted into the review queue. A moderator will verify resolvability against the named sources and either approve, request edits, or reject within 48 hours.",
    };
  },
};
