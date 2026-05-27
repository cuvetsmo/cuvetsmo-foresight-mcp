import type { z, ZodTypeAny } from "zod";

/**
 * Context passed to tool handlers — populated at server startup.
 * Tools that need shared resources (data store, cache, etc.) pull from here.
 */
export interface ToolContext {
  [key: string]: unknown;
}

/**
 * Tool definition — a self-contained unit the registry can publish to MCP.
 * Generic over the Zod schema for type-safe arg parsing.
 */
export interface ToolDef<S extends ZodTypeAny = ZodTypeAny> {
  /** Unique tool name. Convention: `foresight_<verb_noun>`. */
  name: string;
  /** Human-readable description shown to the LLM. Include cost/rate hints. */
  description: string;
  /** Zod schema for input validation. */
  schema: S;
  /** Handler — receives parsed args + context, returns JSON-serialisable result. */
  handler: (args: z.infer<S>, ctx: ToolContext) => Promise<unknown>;
}

// ─── Domain types (mirror the web app's lib/types.ts) ─────────────────────

export type MarketCategory =
  | "thai-politics"
  | "thai-climate"
  | "thai-vet"
  | "sea-elections"
  | "crypto"
  | "global-tech"
  | "global-sports"
  | "ai-research";

export type MarketStatus = "open" | "closing-soon" | "resolved";

export type Outcome = "yes" | "no";

export interface Market {
  id: string;
  slug: string;
  question: string;
  questionEn?: string;
  category: MarketCategory;
  status: MarketStatus;
  yesProbability: number;
  volumeUsd: number;
  openInterestUsd: number;
  closesAt: string;
  resolutionCriteria: string;
  resolutionSources: string[];
  priceHistory?: number[];
  createdBy: string;
  tags: string[];
}
