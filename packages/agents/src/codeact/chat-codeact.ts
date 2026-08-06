/**
 * CodeAct for chat turns — the adapter the websocket chat runner uses when the
 * execution-mode setting is `"codeact"`.
 *
 * A chat toolbelt is not a `Tool[]`: it mixes server tools with client (`ui_*`)
 * tools that exist here only as schemas, and every call must go through the
 * chat runner's own router (permission gate, client round-trips over the
 * ToolBridge, asset materialization). So instead of `buildToolBridge`, this
 * session bridges `tools.<name>()` to a caller-supplied `executeTool` and
 * leaves the routing where it is. Everything else matches the step executor:
 * one `execute_code` provider tool, a `state` object that persists across the
 * turn's actions, `searchTools()` for the deferred long tail, and an
 * observation envelope as the tool result.
 *
 * When the belt carries the `ui_*` workflow document tools, actions also get
 * the graph object model (`openWorkflow()` — see graph-model.ts), so graph and
 * node editing happens on a JS object model committed through the same tools.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import { runInSandbox } from "../js-sandbox.js";
import { searchTools } from "../tools/tool-search.js";
import { truncateToolResult } from "../constants.js";
import { buildCodeActSystemPrompt } from "./prompt.js";
import {
  CODEACT_PRELUDE,
  DEFAULT_MAX_TOOL_CALLS_PER_ACTION,
  extractErrorPayload,
  toTransferable,
  toolSignature,
  type ToolSearchHit,
  type ToolSignatureSource
} from "./tool-api.js";
import {
  CODEACT_DEFER_THRESHOLD,
  CODEACT_RESIDENT_TOOL_NAMES,
  EXECUTE_CODE_TOOL_NAME
} from "./codeact-executor.js";
import {
  GRAPH_MODEL_PRELUDE,
  GRAPH_MODEL_PROMPT_SECTION,
  hasGraphModelTools
} from "./graph-model.js";

export interface ChatCodeActToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ChatCodeActSessionOptions {
  /** The full chat toolbelt as schemas (server + client tools alike). */
  tools: ToolSignatureSource[];
  /**
   * The chat runner's tool router. Receives a synthetic call id
   * (`codeact_<n>`); returns whatever the router returns — a JSON string, a
   * plain value, or `MessageContent[]` blocks (flattened to their text here).
   */
  executeTool: (call: ChatCodeActToolCall) => Promise<unknown>;
  /** Context for the sandbox's workspace/secret APIs. */
  context?: ProcessingContext;
  signal?: AbortSignal;
  /** Wall-clock limit per code action. Defaults to the sandbox's 30 s. */
  actionTimeoutMs?: number;
  /** Tool calls one action may consume. Default 50. */
  maxToolCallsPerAction?: number;
  /** Tools documented in full; defaults to {@link CODEACT_RESIDENT_TOOL_NAMES}. */
  residentToolNames?: Iterable<string>;
  /** Observability hook — fires before each bridged tool executes. */
  onToolCall?: (record: { name: string; args: Record<string, unknown> }) => void;
}

export interface ChatCodeActSession {
  /** The one provider tool the chat turn exposes in codeact mode. */
  providerTool: {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  };
  /** Appended to the chat system prompt: contract, catalog, sandbox summary. */
  systemPromptSection: string;
  /** Run one code action; returns the observation envelope as JSON text. */
  executeAction(args: Record<string, unknown>): Promise<string>;
  /** Bridged tool calls consumed so far this turn (across actions). */
  toolCallCount(): number;
}

interface ActionObservation {
  ok: boolean;
  result?: unknown;
  error?: string;
  stack?: string;
  logs?: string[];
  toolCalls: number;
}

/**
 * What the router returns is transcript-shaped (JSON strings, content
 * blocks); the guest wants values. Parse JSON strings and flatten
 * `MessageContent[]` to their text.
 */
function normalizeToolResult(raw: unknown): unknown {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return JSON.parse(trimmed) as unknown;
      } catch {
        return raw;
      }
    }
    return raw;
  }
  if (
    Array.isArray(raw) &&
    raw.length > 0 &&
    raw.every(
      (block) =>
        block !== null &&
        typeof block === "object" &&
        typeof (block as { type?: unknown }).type === "string"
    )
  ) {
    const texts = raw
      .map((block) => (block as { text?: unknown }).text)
      .filter((text): text is string => typeof text === "string");
    if (texts.length > 0) return texts.join("\n");
  }
  return raw;
}

export function createChatCodeActSession(
  options: ChatCodeActSessionOptions
): ChatCodeActSession {
  const toolNames = options.tools.map((t) => t.name);
  const byName = new Map(options.tools.map((t) => [t.name, t]));
  const maxCallsPerAction =
    options.maxToolCallsPerAction ?? DEFAULT_MAX_TOOL_CALLS_PER_ACTION;
  const withGraphModel = hasGraphModelTools(toolNames);

  // Persists across the turn's actions (CaveAgent-style runtime state).
  const state: Record<string, unknown> = {};
  let totalCalls = 0;
  let actionCalls = 0;

  const callTool = async (
    name: unknown,
    argsJson: unknown
  ): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> => {
    try {
      if (typeof name !== "string" || !byName.has(name)) {
        return {
          ok: false,
          error: `Unknown tool "${String(name)}". Use searchTools() to discover tools.`
        };
      }
      if (actionCalls >= maxCallsPerAction) {
        return {
          ok: false,
          error:
            `Tool-call budget for this action exhausted (max ${maxCallsPerAction} ` +
            `calls). Return an intermediate result and continue in the next action.`
        };
      }
      actionCalls++;
      totalCalls++;

      let args: Record<string, unknown> = {};
      if (typeof argsJson === "string" && argsJson.length > 0) {
        try {
          const parsed = JSON.parse(argsJson) as unknown;
          if (
            parsed !== null &&
            typeof parsed === "object" &&
            !Array.isArray(parsed)
          ) {
            args = parsed as Record<string, unknown>;
          } else if (parsed !== null) {
            return {
              ok: false,
              error: `tools.${name}: arguments must be an object`
            };
          }
        } catch {
          return {
            ok: false,
            error: `tools.${name}: arguments must be JSON-serializable`
          };
        }
      }

      options.onToolCall?.({ name, args });
      const raw = await options.executeTool({
        id: `codeact_${totalCalls}`,
        name,
        args
      });
      const value = normalizeToolResult(raw);
      const errorPayload = extractErrorPayload(value);
      if (errorPayload !== null) {
        return { ok: false, error: `tools.${name}: ${errorPayload}` };
      }
      return { ok: true, result: toTransferable(value) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  };

  const finishBridge = async (): Promise<{ ok: false; error: string }> => ({
    ok: false,
    error:
      "finish() does not exist in chat. Reply to the user with a normal " +
      "assistant message (no tool call) when the work is done."
  });

  const searchCatalog = options.tools.map((t) => ({
    name: t.name,
    description: t.description ?? ""
  }));
  const searchToolsBridge = async (
    query: unknown,
    maxResults: unknown
  ): Promise<
    { ok: true; result: ToolSearchHit[] } | { ok: false; error: string }
  > => {
    try {
      const limit =
        typeof maxResults === "number" && Number.isFinite(maxResults)
          ? Math.max(1, Math.min(25, Math.floor(maxResults)))
          : 5;
      const hits = searchTools(searchCatalog, String(query ?? ""), limit).map(
        (entry): ToolSearchHit => {
          const tool = byName.get(entry.name) as ToolSignatureSource;
          return {
            name: entry.name,
            signature: toolSignature(tool),
            description: tool.description ?? ""
          };
        }
      );
      return { ok: true, result: hits };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  };

  // Progressive disclosure, mirroring the step executor's split.
  const residentNames = new Set(
    options.residentToolNames ?? CODEACT_RESIDENT_TOOL_NAMES
  );
  let resident: ToolSignatureSource[];
  let deferred: ToolSignatureSource[];
  if (options.tools.length <= CODEACT_DEFER_THRESHOLD) {
    resident = [...options.tools];
    deferred = [];
  } else {
    resident = options.tools.filter((t) => residentNames.has(t.name));
    deferred = options.tools.filter((t) => !residentNames.has(t.name));
  }

  const systemPromptSection = buildCodeActSystemPrompt({
    tools: resident,
    deferredTools: deferred,
    variant: "chat",
    extraSections: withGraphModel ? [GRAPH_MODEL_PROMPT_SECTION] : []
  });

  const prelude = withGraphModel
    ? `${CODEACT_PRELUDE}\n${GRAPH_MODEL_PRELUDE}`
    : CODEACT_PRELUDE;

  const executeAction = async (
    args: Record<string, unknown>
  ): Promise<string> => {
    const code = typeof args?.["code"] === "string" ? args["code"] : "";
    if (!code.trim()) {
      return JSON.stringify({
        ok: false,
        error: "execute_code: `code` must be a non-empty string",
        toolCalls: 0
      } satisfies ActionObservation);
    }
    actionCalls = 0;

    const outcome = await runInSandbox({
      code: `${prelude}\n${code}`,
      context: options.context,
      timeoutMs: options.actionTimeoutMs,
      signal: options.signal,
      globals: {
        __callTool: callTool,
        __toolNames: toolNames,
        __finish: finishBridge,
        __searchTools: searchToolsBridge,
        state
      }
    });

    const observation: ActionObservation = {
      ok: outcome.success,
      toolCalls: actionCalls
    };
    if (outcome.success) {
      if (outcome.result !== undefined) observation.result = outcome.result;
    } else {
      observation.error = outcome.error;
      if (outcome.stack) observation.stack = outcome.stack;
    }
    if (outcome.logs && outcome.logs.length > 0) {
      observation.logs = outcome.logs;
    }
    return truncateToolResult(JSON.stringify(observation));
  };

  return {
    providerTool: {
      name: EXECUTE_CODE_TOOL_NAME,
      description:
        "Execute a JavaScript action in the sandbox. The observation " +
        "(return value, logs, error) is the tool result.",
      inputSchema: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "The JavaScript program to run."
          }
        },
        required: ["code"],
        additionalProperties: false
      }
    },
    systemPromptSection,
    executeAction,
    toolCallCount: () => totalCalls
  };
}
