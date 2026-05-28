import type { Registry } from "../lib/registry.js";
import { listMarketsTool } from "./list-markets.js";
import { getMarketTool } from "./get-market.js";
import { proposeMarketTool } from "./propose-market.js";
import { resolveCheckTool } from "./resolve-check.js";
import { streamEventsTool } from "./stream-events.js";
import { crossVenueTool } from "./cross-venue.js";
import { arxivSearchTool } from "./arxiv-search.js";
import { wikidataEntityTool } from "./wikidata-entity.js";

/**
 * Wire every tool into the registry. Phase 0 tools have no external
 * dependencies — they read from the static seed in src/data/markets.ts.
 * Phase 1 will swap the data layer for a Supabase reader without changing
 * the tool surfaces.
 */
export function registerAll(registry: Registry): {
  registered: string[];
  warnings: string[];
} {
  const warnings: string[] = [];

  registry.add(listMarketsTool);
  registry.add(getMarketTool);
  registry.add(proposeMarketTool);
  registry.add(resolveCheckTool);
  registry.add(streamEventsTool);
  registry.add(crossVenueTool);
  registry.add(arxivSearchTool);
  registry.add(wikidataEntityTool);

  return { registered: registry.names(), warnings };
}
