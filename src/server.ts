import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Registry } from "./lib/registry.js";
import { FSError } from "./lib/errors.js";
import { registerAll } from "./tools/index.js";

// ─────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────
const registry = new Registry();
const { registered, warnings } = registerAll(registry);

// stderr only — keeps stdio JSON-RPC clean
console.error(
  `[foresight-mcp] ${registered.length} tool(s) registered: ${registered.join(", ")}`,
);
for (const w of warnings) console.error(`[foresight-mcp] WARN ${w}`);

// ─────────────────────────────────────────────
// MCP wire-up
// ─────────────────────────────────────────────
const server = new Server(
  { name: "foresight", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: registry.list(),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    const result = await registry.dispatch(name, args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    if (err instanceof FSError) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: err.message,
              code: err.code,
              source: err.source,
            }),
          },
        ],
      };
    }
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
            code: "UNKNOWN",
          }),
        },
      ],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[foresight-mcp] stdio transport connected");
