# foresight-mcp

The Model Context Protocol server for [Foresight](https://foresight.cuvetsmo.com) — the forecasting marketplace for the events the world's biggest exchanges overlook.

Lets any MCP-aware agent (Claude, GPT-via-MCP, any custom client) browse markets, propose new ones, dry-run resolutions, and stream events — without any SDK, account, or proprietary auth.

## Install

```bash
npm install -g foresight-mcp
```

Then add it to your MCP-aware client:

```bash
claude mcp add foresight foresight-mcp
```

Or for one-off usage:

```bash
npx foresight-mcp
```

## Tools

| Tool | What it does |
|------|--------------|
| `foresight_list_markets` | Browse and filter live markets by category, status, and sort order. |
| `foresight_get_market` | Full details for a single market: probabilities, history, criteria, sources. |
| `foresight_propose_market` | Submit a new market proposal. Iron-rule validation against ambiguous or distress criteria. |
| `foresight_resolve_check` | Dry-run the multi-source verifier on a market. Read-only — never mutates state. |
| `foresight_stream_events` | Poll-based event stream: price ticks, trades, opens, closes, resolutions. |

## Example

```
You:    What's moving in the regional politics category?
Agent:  *calls foresight_list_markets({ category: 'thai-politics' })*
        Top by 24h volume:
        • Thailand snap election before Q4 2027
          YES 42% · $184k volume · 16mo left
        Want a deeper look or shall I propose a new market in this category?
```

## Local development

```bash
git clone https://github.com/cuvetsmo/cuvetsmo-foresight-mcp
cd cuvetsmo-foresight-mcp
npm install
npm run build
npm start
```

Or wire the dev build straight into your client:

```bash
claude mcp add foresight-dev "node $(pwd)/dist/server.js"
```

## Design

- **Standalone Node CLI** so MCP-aware clients can install via one `npm i -g` or one `claude mcp add` line. No web server, no auth proxy.
- **Stable response shapes**. Phase 0 reads from a static seed; Phase 1 will swap in a live data reader. Tool surfaces stay identical so agents written today keep working.
- **Iron Rule 0 baked into `foresight_propose_market`**. Ambiguous criteria, distress markets, and unverifiable rumors are refused at the protocol surface, not at moderation time.
- **Read-only by default**. `propose` returns a draft for review; `resolve_check` never writes; `stream_events` polls. The only state mutation route is the moderated proposal queue.

## License

MIT
