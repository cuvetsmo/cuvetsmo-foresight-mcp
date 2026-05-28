import { z } from "zod";
import type { ToolDef } from "../lib/types.js";
import { UpstreamError } from "../lib/errors.js";

const Input = z.object({
  query: z
    .string()
    .min(2)
    .describe(
      "Search query. ArXiv field-prefix syntax is supported, e.g., 'all:large language model', 'au:Bengio', 'ti:scaling laws', 'cat:cs.CL'. Plain text searches all fields.",
    ),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe("Number of papers to return. 1-20, default 5."),
  sortBy: z
    .enum(["relevance", "lastUpdatedDate", "submittedDate"])
    .default("submittedDate")
    .describe(
      "Sort order. Default submittedDate (newest first) — best for 'has this paper dropped yet' resolution checks.",
    ),
});

interface ArxivPaper {
  id: string;
  title: string;
  summary: string;
  authors: string[];
  published: string;
  updated: string;
  primaryCategory?: string;
  pdfUrl: string;
  absUrl: string;
}

const ARXIV_API = "https://export.arxiv.org/api/query";
// ArXiv rejects empty / trivial User-Agents. A descriptive UA is required.
const UA = "foresight-mcp/0.4 (https://foresight.cuvetsmo.com; +arxiv-resolver)";

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function firstTag(block: string, tag: string): string | undefined {
  // Non-greedy, dot-matches-newline via [\s\S]
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? decodeXmlEntities(m[1]) : undefined;
}

/**
 * Parse the ArXiv Atom feed. ArXiv's Atom format is stable and simple
 * enough that a careful regex extraction is reliable here — we avoid an
 * XML-parser dependency to keep the bundle lean (capital discipline).
 * Each <entry> is one paper.
 */
function parseAtom(xml: string): ArxivPaper[] {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  const papers: ArxivPaper[] = [];
  for (const block of entries) {
    const idRaw = firstTag(block, "id") ?? "";
    const absUrl = idRaw;
    const pdfUrl = idRaw.replace("/abs/", "/pdf/");
    const authors = Array.from(
      block.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g),
    ).map((m) => decodeXmlEntities(m[1]));
    const primaryCategoryMatch = block.match(
      /<arxiv:primary_category[^>]*term="([^"]+)"/,
    );
    papers.push({
      id: idRaw.split("/abs/")[1] ?? idRaw,
      title: firstTag(block, "title") ?? "(untitled)",
      summary: (firstTag(block, "summary") ?? "").slice(0, 600),
      authors,
      published: firstTag(block, "published") ?? "",
      updated: firstTag(block, "updated") ?? "",
      primaryCategory: primaryCategoryMatch?.[1],
      pdfUrl,
      absUrl,
    });
  }
  return papers;
}

/**
 * Search ArXiv preprints — the primary resolver source for the
 * `ai-research` category. "Will <lab> publish a paper on <topic> by
 * <date>?" resolves by searching here and checking submitted dates.
 *
 * Public API, no auth. Read-only. ArXiv asks for ≤ 1 request / 3s; the
 * MCP call pattern (one search per agent turn) is well within that.
 */
export const arxivSearchTool: ToolDef<typeof Input> = {
  name: "foresight_arxiv_search",
  description:
    "Search ArXiv preprints for the ai-research category. Returns recent papers matching a query with title, authors, abstract, submitted/updated dates, primary category, and PDF + abstract URLs. Use to dry-run 'has paper X been published yet' resolution, or to ground a research-milestone market in primary sources. Public, no auth, read-only.",
  schema: Input,
  handler: async (args) => {
    const url = new URL(ARXIV_API);
    url.searchParams.set("search_query", args.query);
    url.searchParams.set("max_results", String(args.maxResults));
    url.searchParams.set("sortBy", args.sortBy);
    url.searchParams.set("sortOrder", "descending");

    let xml: string;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);
      const res = await fetch(url.toString(), {
        headers: { "User-Agent": UA, Accept: "application/atom+xml" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      xml = await res.text();
    } catch (err) {
      throw new UpstreamError(
        `ArXiv search failed: ${err instanceof Error ? err.message : String(err)}. ArXiv rate-limits aggressive callers; retry in a few seconds.`,
      );
    }

    const papers = parseAtom(xml);

    return {
      query: args.query,
      sortBy: args.sortBy,
      count: papers.length,
      papers,
      note:
        papers.length === 0
          ? "No preprints matched. For 'will X publish' markets, an empty result before the deadline supports a 'pending' or 'NO-so-far' read — but always confirm against the lab's own announcements too."
          : "ArXiv preprints are not peer-reviewed. For resolution, cite the arxiv id + submitted date; cross-check the claim against the paper's abstract.",
      attribution: "Thank you to arXiv for use of its open access interoperability.",
    };
  },
};
