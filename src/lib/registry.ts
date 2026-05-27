import type { ZodTypeAny } from "zod";
import type { ToolContext, ToolDef } from "./types.js";

/**
 * Tool registry — collects ToolDefs and exposes a single dispatch function for
 * the MCP server. Shared `ToolContext` is injected at register time so handlers
 * don't re-instantiate clients per call.
 */
export class Registry {
  private tools = new Map<string, ToolDef<ZodTypeAny>>();
  private context: ToolContext = {};

  add<S extends ZodTypeAny>(tool: ToolDef<S>, contextPatch?: ToolContext): void {
    if (this.tools.has(tool.name)) {
      throw new Error(
        `Tool name collision: ${tool.name} already registered. ` +
          `Convention: prefix with 'foresight_'.`,
      );
    }
    this.tools.set(tool.name, tool as unknown as ToolDef<ZodTypeAny>);
    if (contextPatch) Object.assign(this.context, contextPatch);
  }

  list(): Array<{ name: string; description: string; inputSchema: unknown }> {
    return [...this.tools.values()].map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.schema),
    }));
  }

  async dispatch(name: string, rawArgs: unknown): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    const parsed = tool.schema.parse(rawArgs ?? {});
    return await tool.handler(parsed, this.context);
  }

  size(): number {
    return this.tools.size;
  }

  names(): string[] {
    return [...this.tools.keys()];
  }
}

/**
 * Minimal Zod → JSON Schema converter. Handles the shapes we actually use.
 * Avoids the `zod-to-json-schema` dep so the published package stays tiny.
 */
function zodToJsonSchema(schema: unknown): unknown {
  // @ts-expect-error — _def is internal but stable
  const def = schema?._def;
  if (!def) return { type: "object" };

  switch (def.typeName) {
    case "ZodObject": {
      const shape = def.shape();
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(value);
        // @ts-expect-error — isOptional is stable
        if (!value.isOptional?.()) required.push(key);
      }
      return {
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
      };
    }
    case "ZodString": {
      const out: Record<string, unknown> = { type: "string" };
      if (def.description) out.description = def.description;
      return out;
    }
    case "ZodNumber":
      return { type: "number" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodEnum":
      return { type: "string", enum: def.values };
    case "ZodArray":
      return { type: "array", items: zodToJsonSchema(def.type) };
    case "ZodOptional":
    case "ZodDefault":
    case "ZodNullable":
      return zodToJsonSchema(def.innerType);
    default:
      return { type: "object" };
  }
}
