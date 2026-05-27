# CLAUDE.md — foresight-mcp project context

Project-level instructions for any Claude Code session in this repo.

## What this is

The standalone MCP server for the Foresight forecasting marketplace. Five tools exposed over stdio, packaged as an installable npm CLI (`foresight-mcp`). The web app at https://foresight.cuvetsmo.com is a separate repo; this one ships only the protocol surface.

Architectural inspiration: `miracle-investment-mcp` (sibling project at `Desktop\miracle-investment`). Same `Registry + MemoryCache + FSError + tools/*.ts` shape with the names adapted.

## Iron rules

1. **Tool prefix `foresight_`** for every tool. Registry rejects collisions.
2. **No external dependencies in Phase 0**. Tools read from `src/data/markets.ts` only. Phase 1 swaps the data layer for a Supabase reader behind the same Tool interface — do not break that contract.
3. **Stable response shapes**. Once a tool is published, its return JSON is part of the public API for downstream agents. Add optional fields, never rename or remove.
4. **Iron Rule 0 inside `propose_market`**. Reject distress / assassination / unverifiable rumor markets at the protocol surface. The web app moderation layer is defense in depth, not the only defense.
5. **No "Claude" leak in `description` strings**. Tools describe themselves as "for MCP-aware agents" / "any MCP client" — neutral plural.
6. **No `Co-Authored-By: Claude` trailer in commits** — public cuvetsmo-org repo, see vault memory `feedback_no-claude-coauthor-in-public-repos`.
7. **Stage by name** in git, never `-A` / `.` — vault memory `git-add-specific-files`.

## File map

```
src/
├── server.ts                Stdio MCP entry. JSON-RPC dispatch.
├── lib/
│   ├── registry.ts          Tool collector + dispatcher + Zod->JSON-Schema.
│   ├── cache.ts             In-memory TTL cache. Used by stream-events.
│   ├── errors.ts            FSError + tagged subclasses (NotFound, Validation, Resolver).
│   └── types.ts             ToolDef + Market domain type.
├── data/
│   └── markets.ts           Seed markets — KEEP in sync with web app's lib/markets.ts.
└── tools/
    ├── index.ts             registerAll(registry).
    ├── list-markets.ts      foresight_list_markets
    ├── get-market.ts        foresight_get_market
    ├── propose-market.ts    foresight_propose_market
    ├── resolve-check.ts     foresight_resolve_check
    └── stream-events.ts     foresight_stream_events
```

## Versioning + publish

- Bump `version` in `package.json` for every public-API change (any non-additive change to tool inputs or outputs).
- `npm publish` only after Palm signs in to npm (`npm login`). Do not auto-publish from CI for now.
- `.npmignore` keeps `src/`, `scripts/`, dev configs out of the published tarball — only `dist/` + `README.md` ship.

## Phase plan

| Phase | What lands here |
|---|---|
| **0 (this commit)** | 5 tools wired to static seed. Smoke-testable over stdio. Demo-ready. |
| **1** | Swap `src/data/markets.ts` for a Supabase reader (shared backend with web app). Resolver tool stops returning "pending" stubs and calls the production multi-source verifier. |
| **2** | Add write tools (`foresight_place_order`, `foresight_cancel_order`) once on-chain settlement is live. Auth via Privy short-lived JWT. |

## Don't do

- Don't add a database client to this repo. Supabase access goes through the web app's edge functions; this MCP calls those instead.
- Don't add `dotenv` — env vars come from the MCP client's config when it launches the binary.
- Don't shadow the web app's `Market` type — `src/lib/types.ts` is the source of truth and the web app should import from here (Phase 2 publish a `@foresight/types` package if useful).
- Don't ship example scripts that hit production endpoints from the public CLI.
