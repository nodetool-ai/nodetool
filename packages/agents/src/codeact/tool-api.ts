/**
 * CodeAct tool API — the bridge that exposes an agent toolbelt to sandboxed
 * JavaScript actions, and the signature rendering that documents it in the
 * system prompt.
 *
 * One host bridge (`__callTool`) serves every tool; a generated guest prelude
 * builds the `tools.<name>()` wrappers on top of it. Host bridges follow the
 * js-sandbox never-reject convention: they resolve `{ok, ...}` envelopes and
 * the guest wrapper re-throws, so the QuickJS host-promise-rejection leak is
 * never hit.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { JsonSchema } from "@nodetool-ai/runtime";
import { Tool } from "../tools/base-tool.js";

/** Tool-call ceiling per code action; a runaway guest loop stops here. */
export const DEFAULT_MAX_TOOL_CALLS_PER_ACTION = 50;

/** Never-rejecting bridge envelope; the guest prelude re-throws on `ok: false`. */
type BridgeResult = { ok: true; result: unknown } | { ok: false; error: string };

export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
}

export interface ToolBridgeOptions {
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
}

/** Force a value through JSON so it marshals cleanly across the WASM boundary. */
function toTransferable(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
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
function extractErrorPayload(result: unknown): string | null {
  if (result === null || typeof result !== "object" || Array.isArray(result)) {
    return null;
  }
  const record = result as Record<string, unknown>;
  if (typeof record["error"] !== "string") return null;
  const message = record["message"];
  return typeof message === "string" && message.length > 0
    ? message
    : record["error"];
}

export function buildToolBridge(options: ToolBridgeOptions): ToolBridge {
  const byName = new Map(options.tools.map((t) => [t.name, t]));
  const maxCalls =
    options.maxToolCallsPerAction ?? DEFAULT_MAX_TOOL_CALLS_PER_ACTION;
  let calls = 0;

  const callTool = async (
    name: unknown,
    argsJson: unknown
  ): Promise<BridgeResult> => {
    try {
      if (typeof name !== "string" || !byName.has(name)) {
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
      if (typeof argsJson === "string" && argsJson.length > 0) {
        try {
          const parsed = JSON.parse(argsJson) as unknown;
          if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
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
      options.onToolCall?.({ name, args });

      const result = await Tool.executeTool(tool, options.context, args);
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
      __toolNames: options.tools.map((t) => t.name)
    },
    callCount: () => calls,
    resetActionBudget: () => {
      calls = 0;
    }
  };
}

/**
 * Guest-side prelude prepended to every code action. Builds `tools.<name>()`
 * wrappers over `__callTool` and `finish()` over `__finish`.
 */
export const CODEACT_PRELUDE = `
const tools = {};
for (const __toolName of __toolNames) {
  tools[__toolName] = async (args) => {
    const __r = await __callTool(
      __toolName,
      JSON.stringify(args === undefined ? {} : args)
    );
    if (!__r || __r.ok !== true) {
      throw new Error(__r && __r.error ? __r.error : "tool call failed: " + __toolName);
    }
    return __r.result;
  };
}
async function finish(result) {
  const __r = await __finish(JSON.stringify(result === undefined ? null : result));
  if (!__r || __r.ok !== true) {
    throw new Error(__r && __r.error ? __r.error : "finish() rejected the result");
  }
  return "step finished";
}
async function searchTools(query, maxResults) {
  const __r = await __searchTools(String(query), maxResults === undefined ? 5 : maxResults);
  if (!__r || __r.ok !== true) {
    throw new Error(__r && __r.error ? __r.error : "searchTools failed");
  }
  return __r.result;
}
`;

/** Names the prelude and bridge globals claim inside the guest. */
export const CODEACT_RESERVED_NAMES = [
  "tools",
  "finish",
  "state",
  "searchTools",
  "__callTool",
  "__finish",
  "__toolNames",
  "__searchTools"
] as const;

// ---------------------------------------------------------------------------
// Signature rendering (JSON schema → compact TS-ish signature)
// ---------------------------------------------------------------------------

function schemaTypeLabel(schema: unknown, depth = 0): string {
  if (schema === null || typeof schema !== "object") return "unknown";
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
  if (typeof type === "string") return type;
  if (Array.isArray(type)) return type.join(" | ");
  return "unknown";
}

function firstSentence(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  const period = trimmed.indexOf(". ");
  return period > 0 ? trimmed.slice(0, period + 1) : trimmed;
}

/** The bare call signature: `await tools.web_search({query: string, ...})`. */
export function toolSignature(tool: Tool): string {
  const schema = tool.inputSchema as JsonSchema;
  const params = schemaTypeLabel(schema);
  const args = params === "{}" ? "" : params;
  return `await tools.${tool.name}(${args})`;
}

/** Signature bullet + first sentence of the description. */
export function renderToolSignature(tool: Tool): string {
  return `- ${toolSignature(tool)}\n  ${firstSentence(tool.description)}`;
}

export function renderToolCatalog(tools: Tool[]): string {
  if (tools.length === 0) return "(no tools available)";
  return tools.map(renderToolSignature).join("\n");
}

/** What `searchTools()` returns to the guest, per matched tool. */
export interface ToolSearchHit {
  name: string;
  signature: string;
  description: string;
}
