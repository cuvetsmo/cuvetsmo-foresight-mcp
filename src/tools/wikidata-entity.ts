import { z } from "zod";
import type { ToolDef } from "../lib/types.js";
import { UpstreamError } from "../lib/errors.js";

const Input = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      "Entity name to ground — a person, organization, place, party, or event. e.g., 'Anthropic', 'Pheu Thai Party', 'Chiang Mai', 'Prabowo Subianto'.",
    ),
  language: z
    .string()
    .min(2)
    .max(5)
    .default("en")
    .describe("Label/description language. 'en' or 'th' are most useful here. Default 'en'."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(5)
    .describe("Number of candidate entities to return. 1-10, default 5."),
});

interface WikidataEntity {
  qid: string;
  label: string;
  description?: string;
  url: string;
  conceptUri: string;
}

const WD_API = "https://www.wikidata.org/w/api.php";
const UA = "foresight-mcp/0.4 (https://foresight.cuvetsmo.com; +entity-grounding)";

interface WbSearchResult {
  id?: string;
  label?: string;
  description?: string;
  concepturi?: string;
}

/**
 * Ground a market's named entity to a stable Wikidata Q-ID. Resolution
 * criteria that reference a person/org/place/party become unambiguous:
 * instead of "Coalition A wins", the criterion can cite Q-ID + label, so
 * the verifier and any appeal panel agree on WHICH entity is meant.
 *
 * Wikidata is CC0 — fully reusable, no attribution required (though we
 * link back anyway). Public API, no auth, read-only.
 *
 * Uses the wbsearchentities action (name → ranked entity candidates),
 * which is cleaner than SPARQL for the "find entity by name" use case.
 */
export const wikidataEntityTool: ToolDef<typeof Input> = {
  name: "foresight_wikidata_entity",
  description:
    "Ground a named entity (person, org, place, party, event) to a stable Wikidata Q-ID with label + description. Use to disambiguate WHICH entity a market's resolution criterion refers to — stable IDs survive renames and translations, so the verifier and appeal panel can't disagree on the referent. Wikidata is CC0. Public, no auth, read-only.",
  schema: Input,
  handler: async (args) => {
    const url = new URL(WD_API);
    url.searchParams.set("action", "wbsearchentities");
    url.searchParams.set("search", args.query);
    url.searchParams.set("language", args.language);
    url.searchParams.set("uselang", args.language);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", String(args.limit));

    let payload: { search?: WbSearchResult[] };
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(url.toString(), {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      payload = (await res.json()) as { search?: WbSearchResult[] };
    } catch (err) {
      throw new UpstreamError(
        `Wikidata lookup failed: ${err instanceof Error ? err.message : String(err)}.`,
      );
    }

    const entities: WikidataEntity[] = (payload.search ?? [])
      .filter((s) => s.id)
      .map((s) => ({
        qid: s.id as string,
        label: s.label ?? "(no label)",
        description: s.description,
        url: `https://www.wikidata.org/wiki/${s.id}`,
        conceptUri: s.concepturi ?? `http://www.wikidata.org/entity/${s.id}`,
      }));

    return {
      query: args.query,
      language: args.language,
      count: entities.length,
      entities,
      note:
        entities.length === 0
          ? "No Wikidata entity matched. Try the entity's formal name, or a different language ('th' for Thai-only entities)."
          : "Cite the top entity's Q-ID in the resolution criterion to make the referent unambiguous. The first result is Wikidata's best-ranked match, not a guarantee — confirm the description fits.",
      license: "Wikidata content is CC0 (public domain).",
    };
  },
};
