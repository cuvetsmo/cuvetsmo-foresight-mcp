// Deterministic test of the ArXiv Atom parser, written to a file so there
// is zero shell-escaping ambiguity. The parseAtom logic below is copied
// VERBATIM from src/tools/arxiv-search.ts — if this passes, the shipped
// regex is correct. Run: node scripts/test-arxiv-parse.mjs

function decodeXmlEntities(s) {
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

function firstTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? decodeXmlEntities(m[1]) : undefined;
}

function parseAtom(xml) {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  const papers = [];
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

const fixture = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry>
<id>http://arxiv.org/abs/2401.00123v2</id>
<published>2024-01-02T04:56:57Z</published>
<updated>2024-02-15T10:00:00Z</updated>
<title>Scaling Laws for Neural Language Models &amp; Beyond</title>
<summary>  We study empirical scaling laws for language model performance
on the cross-entropy loss. Loss scales as a power-law with model size.  </summary>
<arxiv:primary_category xmlns:arxiv="http://arxiv.org/schemas/atom" term="cs.CL"/>
<author><name>Jane Doe</name></author>
<author><name>John Smith</name></author>
</entry>
<entry>
<id>http://arxiv.org/abs/2310.04560v1</id>
<published>2023-10-06T00:00:00Z</published>
<updated>2023-10-06T00:00:00Z</updated>
<title>Mixture-of-Experts Routing</title>
<summary>A sparse MoE approach.</summary>
<arxiv:primary_category xmlns:arxiv="http://arxiv.org/schemas/atom" term="cs.LG"/>
<author><name>Alice Wang</name></author>
</entry>
</feed>`;

const papers = parseAtom(fixture);
let pass = true;
const a = (cond, msg) => {
  if (!cond) {
    console.log("✗", msg);
    pass = false;
  } else {
    console.log("✓", msg);
  }
};

a(papers.length === 2, `2 entries parsed (got ${papers.length})`);
a(papers[0].id === "2401.00123v2", `id extracted: "${papers[0].id}"`);
a(
  papers[0].title === "Scaling Laws for Neural Language Models & Beyond",
  `title + &amp; decoded: "${papers[0].title}"`,
);
a(
  papers[0].authors.length === 2 && papers[0].authors[0] === "Jane Doe",
  `2 authors: ${papers[0].authors.join(", ")}`,
);
a(papers[0].primaryCategory === "cs.CL", `primary category: ${papers[0].primaryCategory}`);
a(papers[0].published === "2024-01-02T04:56:57Z", `published: "${papers[0].published}"`);
a(papers[0].pdfUrl === "http://arxiv.org/pdf/2401.00123v2", `pdf url derived: ${papers[0].pdfUrl}`);
a(!papers[0].summary.includes("  "), "summary whitespace collapsed");
a(papers[1].authors.length === 1, `entry 2 single author: ${papers[1].authors[0]}`);

console.log(pass ? "\nPARSER VERIFIED ✓" : "\nPARSER HAS BUGS ✗");
process.exit(pass ? 0 : 1);
