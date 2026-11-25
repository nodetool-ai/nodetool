import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import {
  externalMcpAccessFor,
  type ProcessingContext
} from "@nodetool-ai/runtime";

type SlotType = { type: string; type_args: SlotType[]; optional: boolean };
type InputSlot = {
  type: SlotType;
  description?: string;
  default?: unknown;
  required?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** The slot type of one JSON Schema property. Anything it cannot say is `any`. */
function slotTypeOf(schema: unknown): SlotType {
  const kind = isRecord(schema) ? schema.type : undefined;
  const name =
    kind === "string"
      ? "str"
      : kind === "integer"
        ? "int"
        : kind === "number"
          ? "float"
          : kind === "boolean"
            ? "bool"
            : kind === "array"
              ? "list"
              : kind === "object"
                ? "dict"
                : "any";
  return {
    type: name,
    type_args: name === "list" ? [{ type: "any", type_args: [], optional: false }] : [],
    optional: false
  };
}

/**
 * One input handle per property of the picked tool's JSON Schema, read from the
 * `input_schema` property the editor stores when the tool is picked. A graph
 * built over the API can set the same property and wire the same handles.
 */
export function mcpToolDynamicSlots(node: {
  properties?: Record<string, unknown>;
}): { dynamic_inputs: Record<string, InputSlot> } | undefined {
  const schema = node.properties?.input_schema;
  const properties = isRecord(schema) ? schema.properties : undefined;
  if (!isRecord(properties)) return undefined;
  const required = new Set(
    isRecord(schema) && Array.isArray(schema.required)
      ? schema.required.filter((r): r is string => typeof r === "string")
      : []
  );
  const dynamic_inputs: Record<string, InputSlot> = {};
  for (const [name, property] of Object.entries(properties)) {
    const slot: InputSlot = {
      type: slotTypeOf(property),
      required: required.has(name)
    };
    if (isRecord(property)) {
      if (typeof property.description === "string") {
        slot.description = property.description;
      }
      if ("default" in property) slot.default = property.default;
    }
    dynamic_inputs[name] = slot;
  }
  return { dynamic_inputs };
}

/**
 * Call one tool on one of the user's external MCP servers (n8n, Home
 * Assistant, Obsidian, a local script).
 *
 * The server and the tool are named on the node, which is the workflow
 * author's explicit choice, so a background run (a trigger fired it, nobody is
 * there to approve) may call exactly that tool. What the node can reach is
 * still bounded by the host: only the run owner's enabled servers, and no stdio
 * server on a cloud or multi-user deployment. A tool that answers with an
 * error fails the node. Tool output is untrusted data, and secrets the server
 * was given are blanked out of it.
 */
export class CallMcpToolNode extends BaseNode {
  static readonly nodeType = "lib.mcp.CallMcpTool";
  static readonly title = "Call MCP Tool";
  static readonly description =
    "Call a tool on an external MCP server you configured in Settings.\n    mcp, tool, n8n, home assistant, obsidian, integration, server\n\n    Use cases:\n    - Trigger an n8n or Home Assistant action from a workflow\n    - Read or write notes through an Obsidian MCP server\n    - Run a local script that speaks MCP\n\n    The node runs exactly the server and tool named here, also in a background run. Image content in a tool result is not passed on.";
  static readonly supportsDynamicInputs = true;
  static readonly resolveDynamicSlots = mcpToolDynamicSlots;
  static readonly metadataOutputTypes = {
    text: "str",
    result: "any",
    resource_links: "list[dict[str, any]]"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = [];

  @prop({
    type: "str",
    default: "",
    title: "Server",
    description: "Id of an external MCP server from Settings, for example n8n.",
    required: true,
    json_schema_extra: { type: "mcp_server" }
  })
  declare server: string;

  @prop({
    type: "str",
    default: "",
    title: "Tool",
    description: "Name of the tool on that server, as the server lists it.",
    required: true,
    json_schema_extra: { type: "mcp_tool" }
  })
  declare tool: string;

  @prop({
    type: "dict",
    default: {},
    title: "Input Schema",
    description:
      "JSON Schema of the tool's arguments. The editor fills it when you pick a tool. Each property becomes an input."
  })
  declare input_schema: Record<string, unknown>;

  async process(context?: ProcessingContext): Promise<{
    text: string;
    result: unknown;
    resource_links: Array<{ uri: string; name?: string; mimeType?: string }>;
  }> {
    const server = String(this.server ?? "").trim();
    const tool = String(this.tool ?? "").trim();
    if (!server || !tool) {
      throw new Error("Call MCP Tool needs a server and a tool.");
    }
    const access = externalMcpAccessFor(context);
    if (access === null) {
      throw new Error(
        "External MCP servers are not available on this host. " +
          "Run the workflow on a NodeTool server that has the server configured."
      );
    }
    // Lists only this server's tools, and throws when it is unknown, disabled,
    // not allowed here (stdio on a cloud host) or not answering.
    const tools = await access.tools(server);
    const remote = tools.find((t) => t.name === tool);
    if (remote === undefined) {
      throw new Error(
        `MCP server "${server}" has no tool "${tool}". It offers: ${
          tools.map((t) => t.name).join(", ") || "no tools"
        }.`
      );
    }
    const args: Record<string, unknown> = {};
    for (const [name, value] of this.dynamicProps) {
      if (value !== undefined && value !== null) args[name] = value;
    }
    const required = isRecord(remote.inputSchema)
      ? remote.inputSchema.required
      : undefined;
    const missing = (Array.isArray(required) ? required : []).filter(
      (name): name is string => typeof name === "string" && !(name in args)
    );
    if (missing.length > 0) {
      throw new Error(
        `MCP tool "${tool}" needs ${missing.join(", ")}. Connect an input or set it.`
      );
    }
    const answer = await access.call(server, tool, args, context?.signal);
    if (answer.isError) {
      throw new Error(
        `MCP tool "${tool}" on "${server}" failed: ${answer.text || "no message"}`
      );
    }
    return {
      text: answer.text,
      result: answer.structured ?? null,
      resource_links: answer.links
    };
  }
}

export const MCP_TOOL_NODES = [CallMcpToolNode] as const;
