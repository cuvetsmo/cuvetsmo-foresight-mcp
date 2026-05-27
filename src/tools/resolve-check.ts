import { z } from "zod";
import type { ToolDef } from "../lib/types.js";
import { getMarketById, getMarketBySlug } from "../data/markets.js";
import { NotFoundError, ResolverError } from "../lib/errors.js";

const Input = z.object({
  identifier: z
    .string()
    .min(1)
    .describe("Market id or slug to dry-run the resolver against."),
  asOf: z
    .string()
    .optional()
    .describe(
      "Optional ISO 8601 datetime to simulate 'resolve as of'. Defaults to now.",
    ),
});

interface ResolveResult {
  market: { id: string; slug: string; question: string };
  asOf: string;
  status: "verifiable" | "pending" | "ambiguous" | "refused";
  proposedOutcome?: "yes" | "no";
  confidence?: number;
  reasoning: string;
  citedSources: Array<{ source: string; checked: boolean; note: string }>;
  appealAvailable: boolean;
}

/**
 * Dry-run the multi-source verifier WITHOUT actually resolving the market.
 *
 * Phase 0 returns a Iron-Rule-0-flavored stub: the resolver explains what it
 * would check, names the sources, and signals "pending" since real LLM calls
 * are wired in Phase E. The shape is stable so the production resolver can
 * swap in without changing the MCP surface.
 */
export const resolveCheckTool: ToolDef<typeof Input> = {
  name: "foresight_resolve_check",
  description:
    "Dry-run the multi-source verifier for a market without writing any resolution. Returns the proposed outcome, confidence, reasoning, and which sources were checked. If the result is ambiguous, the verifier refuses to commit — the appeal path is surfaced instead. Read-only; never mutates market state.",
  schema: Input,
  handler: async (args) => {
    const market =
      getMarketById(args.identifier) ?? getMarketBySlug(args.identifier);
    if (!market) {
      throw new NotFoundError("foresight", `market '${args.identifier}'`);
    }

    const asOfDate = args.asOf ? new Date(args.asOf) : new Date();
    if (Number.isNaN(asOfDate.getTime())) {
      throw new ResolverError("asOf must be a valid ISO 8601 datetime.");
    }

    const closesAt = new Date(market.closesAt);
    const isPastClose = asOfDate.getTime() >= closesAt.getTime();

    const result: ResolveResult = {
      market: {
        id: market.id,
        slug: market.slug,
        question: market.questionEn ?? market.question,
      },
      asOf: asOfDate.toISOString(),
      status: isPastClose ? "pending" : "pending",
      reasoning: isPastClose
        ? `Market is past its close date (${market.closesAt}). Production resolver would now consult each named primary source and return a verifiable YES/NO. Phase 0 stub: real verifier wiring lands in Phase E (E.1). Until then this returns 'pending' so the API surface stays stable.`
        : `Market is still open (closes ${market.closesAt}). Dry-run resolution is meaningful only after close. Suggesting status 'pending' until the event window passes. Re-call with asOf >= closesAt to simulate.`,
      citedSources: market.resolutionSources.map((src) => ({
        source: src,
        checked: false,
        note: "Phase 0 stub — source-fetch wiring lands in Phase E (E.1).",
      })),
      appealAvailable: true,
    };

    return result;
  },
};
