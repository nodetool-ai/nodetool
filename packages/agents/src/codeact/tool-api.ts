/**
 * CodeAct tool API — the bridge that exposes an agent toolbelt to sandboxed
 * JavaScript actions, and the signature rendering that documents it in the
 * system prompt.
 *
 * One host bridge (`__callTool`) serves every tool; a generated guest prelude
 * builds the belt caller on top of it. Host bridges follow the
 * js-sandbox never-reject convention: they resolve `{ok, ...}` envelopes and
 * the guest wrapper re-throws, so the QuickJS host-promise-rejection leak is
 * never hit.
 */

import { DIRECT_TOOL_NAMES, type ProcessingContext } from "@nodetool-ai/runtime";
import type {
  JsonSchema,
  MessageContent,
  MessageImageContent,
  ProviderTool
} from "@nodetool-ai/runtime";
import { sandboxCapabilitySpecifier } from "@nodetool-ai/protocol";

import { capabilityModuleOf } from "../capabilities/registry.js";
import { Tool } from "../tools/base-tool.js";
import {
  extractInjectableImages,
  stripImagePayload
} from "../tools/image-injection.js";
import type { JsonValue } from "../utils/json-parser.js";
import { GRAPH_MODEL_GLOBALS } from "./graph-model.js";
import { NODETOOL_API_GLOBALS } from "./nodetool-api.js";
import { TOOLS_PRELUDE } from "./tools-prelude.js";
import {
  isBoolean,
  isNonEmptyString,
  isNumber,
  isObjectLike,
  isRecord,
  isString
} from "../utils/type-guards.js";

export { TOOLS_PRELUDE } from "./tools-prelude.js";

/** Tool-call ceiling per code action; a runaway guest loop stops here. */
export const DEFAULT_MAX_TOOL_CALLS_PER_ACTION = 50;

/** Never-rejecting bridge envelope; the guest prelude re-throws on `ok: false`. */
type BridgeResult = { ok: true; result: unknown } | { ok: false; error: string };

export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  /** Synthetic id (`codeact_<n>`) this call runs under. */
  toolCallId: string;
}

interface ToolBridgeOptions {
  tools: Tool[];
  context: ProcessingContext;
  /** Observability hook — fires before each bridged tool executes. */
  onToolCall?: (record: ToolCallRecord) => void;
  maxToolCallsPerAction?: number;
}

export interface ToolBridge {
  /** Globals to merge into the sandbox run (`__callTool`, `__toolNames`). */
  globals: Record<string, unknown>;
  /** Calls consumed so far in the current action. Reset per action. */
  callCount: () => number;
  resetActionBudget: () => void;
  /**
   * Pixels a tool returned during this action, removed from the observation
   * and waiting to ride the tool result as a provider image message. Draining
   * clears them.
   */
  drainImages: () => MessageImageContent[];
}

/** Force a value through JSON so it marshals cleanly across the WASM boundary. */
export function toTransferable(value: unknown): JsonValue {
  if (value === null || value === undefined) return null;
  if (
    isString(value) ||
    isNumber(value) ||
    isBoolean(value)
  ) {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

/**
 * An `{error}` payload from a tool is a failure the guest should see as a
 * thrown exception, not as a value to compute on.
 */
export function extractErrorPayload(result: unknown): string | null {
  if (!isObjectLike(result) || Array.isArray(result)) {
    return null;
  }
  const record = result as Record<string, unknown>;
  if (!isString(record["error"])) return null;
  const message = record["message"];
  return isNonEmptyString(message)
    ? message
    : record["error"];
}

/**
 * Wire name → the capability namespace it is imported from, for the names a
 * module owns. A session tool (a client `ui_*` schema, an external MCP tool)
 * owns no module and is left out, which is how the guest's `tools` thrower
 * tells "import it from here" from "ask searchTools".
 */
export function toolModuleMap(
  tools: readonly { name: string }[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const tool of tools) {
    const module = capabilityModuleOf(tool.name);
    if (module !== undefined) map[tool.name] = module;
  }
  return map;
}

export function buildToolBridge(options: ToolBridgeOptions): ToolBridge {
  const byName = new Map(options.tools.map((t) => [t.name, t]));
  const maxCalls =
    options.maxToolCallsPerAction ?? DEFAULT_MAX_TOOL_CALLS_PER_ACTION;
  let calls = 0;
  // Lifetime count across actions — the id a tool sees must stay unique.
  let totalCalls = 0;
  let pendingImages: MessageImageContent[] = [];

  const callTool = async (
    name: unknown,
    argsJson: unknown
  ): Promise<BridgeResult> => {
    try {
      if (!isString(name) || !byName.has(name)) {
        return {
          ok: false,
          error: `Unknown tool "${String(name)}". Available: ${[...byName.keys()].join(", ")}`
        };
      }
      if (calls >= maxCalls) {
        return {
          ok: false,
          error: `Tool-call budget for this action exhausted (max ${maxCalls} calls). Return an intermediate result and continue in the next action.`
        };
      }
      calls++;

      let args: Record<string, unknown> = {};
      if (isNonEmptyString(argsJson)) {
        try {
          const parsed = JSON.parse(argsJson) as unknown;
          if (isRecord(parsed)) {
            args = parsed as Record<string, unknown>;
          } else if (parsed !== null) {
            return {
              ok: false,
              error: `tools.${name}: arguments must be an object`
            };
          }
        } catch {
          return { ok: false, error: `tools.${name}: arguments must be JSON-serializable` };
        }
      }

      const tool = byName.get(name) as Tool;
      totalCalls++;
      const toolCallId = `codeact_${totalCalls}`;
      options.onToolCall?.({ name, args, toolCallId });

      let result = await Tool.executeTool(tool, options.context, args, {
        toolCallId
      });
      // A view-image-style result carries pixels the model asked for. They
      // cannot ride the JSON observation (base64 would burn the context for
      // nothing), so strip them here and let the caller forward them as a
      // provider image message alongside the observation.
      const injected = extractInjectableImages(result);
      if (injected) {
        pendingImages.push(...injected.images);
        result = stripImagePayload(result);
      }
      const errorPayload = extractErrorPayload(result);
      if (errorPayload !== null) {
        return { ok: false, error: `tools.${name}: ${errorPayload}` };
      }
      return { ok: true, result: toTransferable(result) };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e)
      };
    }
  };

  return {
    globals: {
      __callTool: callTool,
      __toolNames: options.tools.map((t) => t.name),
      __toolModules: toolModuleMap(options.tools)
    },
    callCount: () => calls,
    resetActionBudget: () => {
      calls = 0;
    },
    drainImages: () => {
      const images = pendingImages;
      pendingImages = [];
      return images;
    }
  };
}

/**
 * Split a toolbelt into the tools also offered top level and the rest.
 *
 * Membership is {@link DIRECT_TOOL_NAMES}: the core set that mirrors a Claude
 * Agent SDK built-in, plus discovery — which providers, models and node types
 * this install has. Both are shapes a plain tool call fits, so a sandbox round
 * trip whose only job is to forward one buys nothing.
 *
 * `core` is a view, not a removal: the belt keeps every tool, because the
 * object model (`nodetool.models.pick`, `nodetool.web`, `nodetool.agents`) and
 * any hand-written fan-out call them from inside an action. What the top-level
 * offer changes is the *documented* path — the prompt catalog lists them as
 * direct tools, and the default way to reach one is a tool call.
 */
export function splitCoreTools(tools: Tool[]) {
  const core: Tool[] = [];
  const belt: Tool[] = [];
  for (const tool of tools) {
    (DIRECT_TOOL_NAMES.has(tool.name) ? core : belt).push(tool);
  }
  return { core, belt };
}

/**
 * Render core tools as provider tool definitions that execute themselves.
 *
 * The result travels as text; pixels a tool returns are handed back as image
 * content blocks instead, the way the sandbox bridge holds them out of the
 * observation.
 */
export function buildCoreProviderTools(options: {
  tools: Tool[];
  context: ProcessingContext;
  onToolCall?: (record: ToolCallRecord) => void;
}): ProviderTool[] {
  return options.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    execute: async (
      args: Record<string, unknown>,
      toolCallId?: string
    ): Promise<string | MessageContent[]> => {
      const id = toolCallId ?? `core_${tool.name}`;
      options.onToolCall?.({ name: tool.name, args, toolCallId: id });
      let result = await Tool.executeTool(tool, options.context, args, {
        toolCallId: id
      });
      const injected = extractInjectableImages(result);
      if (!injected) return JSON.stringify(toTransferable(result));
      result = stripImagePayload(result);
      return [
        { type: "text", text: JSON.stringify(toTransferable(result)) },
        ...injected.images
      ];
    }
  }));
}

/**
 * Guest-side prelude prepended to every code action. Builds the belt caller
 * over `__callTool` (via {@link TOOLS_PRELUDE}) and `finish()` over
 * `__finish`. Hosts without a `__finish` bridge — the Code node — prepend
 * `TOOLS_PRELUDE` alone. Tool discovery lives on the object model as
 * `nodetool.searchTools()`, so a session reaches every capability under one
 * name.
 */
export const CODEACT_PRELUDE = `${TOOLS_PRELUDE}
async function finish(result) {
  const __r = await __finish(JSON.stringify(result === undefined ? null : result));
  if (!__r || __r.ok !== true) {
    throw new Error(__r && __r.error ? __r.error : "finish() rejected the result");
  }
  return "step finished";
}
`;

/**
 * Every name the guest already has beyond the sandbox manifest's own surface:
 * the host bridges the executors install as `globals`, the wrappers
 * {@link CODEACT_PRELUDE} builds over them, and the two optional object-model
 * preludes. User code cannot rebind these, and prompt text may name them
 * without the sandbox-manifest drift check calling them undefined.
 */
export const CODEACT_INJECTED_GLOBALS = [
  // Host bridges (`runInSandbox` globals) plus the prelude's wrappers.
  "tools",
  "finish",
  "__callTool",
  "__finish",
  "__toolNames",
  "__toolModules",
  "__callBeltTool",
  "__searchTools",
  "__graphQueues",
  ...GRAPH_MODEL_GLOBALS,
  ...NODETOOL_API_GLOBALS
] as const;

/**
 * The injected names a model's own code can collide with: the bindings above
 * minus the `__`-prefixed host bridges, which nobody writes by accident.
 *
 * The prelude declares them with `const`, so `const tools = [...]` in an action
 * is a SyntaxError before a line runs ("lexical redefinition of 'tools'") — a
 * failure whose cause is invisible from the action's own source. They are named
 * in the `execute_code` contract, and {@link annotateFailure} names the one
 * that collided.
 */
export const RESERVED_ACTION_BINDINGS: readonly string[] =
  CODEACT_INJECTED_GLOBALS.filter((name) => !name.startsWith("__"));

/** One sentence naming the reserved bindings, for the action contract. */
export const RESERVED_BINDINGS_SENTENCE =
  `The prelude already declares ${RESERVED_ACTION_BINDINGS.map((n) => `\`${n}\``).join(", ")}. ` +
  "Declaring one of them again is a SyntaxError before your code runs, so " +
  "name your own variables something else.";

// ---------------------------------------------------------------------------
// Signature rendering (JSON schema → compact TS-ish signature)
// ---------------------------------------------------------------------------

/**
 * The structural slice of a tool the signature renderer needs. `Tool`
 * instances satisfy it, and so do bare provider-tool schemas — the chat
 * runner documents client (`ui_*`) tools that exist only as JSON schemas.
 */
export interface ToolSignatureSource {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

function schemaTypeLabel(schema: unknown, depth = 0): string {
  if (!isObjectLike(schema)) return "unknown";
  const s = schema as Record<string, unknown>;
  if (Array.isArray(s["enum"])) {
    return (s["enum"] as unknown[])
      .slice(0, 6)
      .map((v) => JSON.stringify(v))
      .join(" | ");
  }
  const type = s["type"];
  if (type === "array") {
    return `${schemaTypeLabel(s["items"], depth + 1)}[]`;
  }
  if (type === "object") {
    const props = s["properties"] as Record<string, unknown> | undefined;
    if (!props || depth >= 2) return "object";
    const required = new Set(
      Array.isArray(s["required"]) ? (s["required"] as string[]) : []
    );
    const fields = Object.entries(props)
      .map(
        ([key, value]) =>
          `${key}${required.has(key) ? "" : "?"}: ${schemaTypeLabel(value, depth + 1)}`
      )
      .join(", ");
    return `{${fields}}`;
  }
  if (type === "integer") return "number";
  if (isString(type)) return type;
  if (Array.isArray(type)) return type.join(" | ");
  return "unknown";
}

function firstSentence(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  const period = trimmed.indexOf(". ");
  return period > 0 ? trimmed.slice(0, period + 1) : trimmed;
}

/** The bare call signature: `await web_search({query: string, ...})`. */
export function toolSignature(tool: ToolSignatureSource): string {
  const schema = tool.inputSchema as JsonSchema;
  const params = schemaTypeLabel(schema);
  const args = params === "{}" ? "" : params;
  return `await ${tool.name}(${args})`;
}

/** The specifier a capability is imported from, or `undefined` for a session tool. */
export function toolSpecifier(name: string): string | undefined {
  const module = capabilityModuleOf(name);
  return module === undefined
    ? undefined
    : sandboxCapabilitySpecifier(module);
}

/**
 * The import statement that makes one capability callable, or `undefined` for
 * a name no module owns.
 */
export function toolImportLine(name: string): string | undefined {
  const specifier = toolSpecifier(name);
  return specifier === undefined
    ? undefined
    : `import { ${name} } from ${JSON.stringify(specifier)};`;
}

/** Signature bullet + first sentence of the description. */
export function renderToolSignature(tool: ToolSignatureSource): string {
  const description = firstSentence(tool.description ?? "");
  return description
    ? `- ${toolSignature(tool)}\n  ${description}`
    : `- ${toolSignature(tool)}`;
}

/**
 * The catalog, grouped by the module each capability is imported from.
 *
 * The group header IS the import statement the action has to write, with every
 * name in that group already in the braces — so a model that copies the header
 * and then calls two of the listed signatures has written a working action.
 * Listing a signature without saying where the name comes from is what made
 * the flat belt readable at a glance and unwritable in practice.
 */
export function renderToolCatalog(
  tools: ToolSignatureSource[],
  /**
   * Specifiers for names no capability module owns but the host has grafted
   * onto a namespace anyway — a chat session's `ui_*` tools, a step's own
   * belt. A name absent from it is documented as a plain tool call, which is
   * what an external MCP tool is.
   */
  grafted: ReadonlyMap<string, string> = new Map()
): string {
  if (tools.length === 0) return "(no tools available)";
  const groups = new Map<string, ToolSignatureSource[]>();
  const ungrouped: ToolSignatureSource[] = [];
  for (const tool of tools) {
    const specifier = toolSpecifier(tool.name) ?? grafted.get(tool.name);
    if (specifier === undefined) {
      ungrouped.push(tool);
      continue;
    }
    const group = groups.get(specifier);
    if (group === undefined) groups.set(specifier, [tool]);
    else group.push(tool);
  }
  const blocks = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([specifier, group]) =>
      [
        `import { ${group.map((t) => t.name).join(", ")} } from ${JSON.stringify(specifier)};`,
        ...group.map(renderToolSignature)
      ].join("\n")
    );
  if (ungrouped.length > 0) {
    blocks.push(
      ["// no import — these are called as ordinary tools:",
        ...ungrouped.map(renderToolSignature)].join("\n")
    );
  }
  return blocks.join("\n\n");
}

/** What `nodetool.searchTools()` returns to the guest, per matched tool. */
export interface ToolSearchHit {
  name: string;
  signature: string;
  description: string;
  /** The capability namespace, absent for a tool no module owns. */
  module?: string;
  /** The specifier to import it from, absent for the same reason. */
  specifier?: string;
  /** The exact import statement to write. */
  import?: string;
}

/** One search hit, with everything needed to write the call. */
export function toolSearchHit(
  tool: ToolSignatureSource,
  /** The namespace a host grafted this name onto, if any. */
  graftedModule?: string
): ToolSearchHit {
  const hit: ToolSearchHit = {
    name: tool.name,
    signature: toolSignature(tool),
    description: tool.description ?? ""
  };
  const module = capabilityModuleOf(tool.name) ?? graftedModule;
  if (module !== undefined) {
    hit.module = module;
    hit.specifier = sandboxCapabilitySpecifier(module);
    hit.import = `import { ${tool.name} } from ${JSON.stringify(sandboxCapabilitySpecifier(module))};`;
  }
  return hit;
}
