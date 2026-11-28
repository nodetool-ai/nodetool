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

import {
  DIRECT_TOOL_NAMES,
  type ProcessingContext
} from "@nodetool-ai/runtime";
import type {
  JsonSchema,
  MessageContent,
  MessageImageContent,
  ProviderTool
} from "@nodetool-ai/runtime";
import { missingPackDetailsOf, missingPackText, sandboxCapabilitySpecifier } from "@nodetool-ai/protocol";

import { capabilityModuleOf } from "../capabilities/registry.js";
import { MAX_ACTION_IMAGES } from "../constants.js";
import { Tool } from "../tools/base-tool.js";
import { TOOL_CALL_ID_FIELD } from "../tools/subtask-fields.js";
import {
  extractInjectableImages,
  stripImagePayload
} from "../tools/image-injection.js";
import type { JsonValue } from "../utils/json-parser.js";
import { compactResourceIds } from "./compact-ids.js";
import { rankFocusedTools } from "./focused-tool-usage.js";
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
type BridgeResult =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  /** Synthetic id (`codeact_<n>`) this call runs under. */
  toolCallId: string;
}

/** What a bridged tool handed back, as the UI reports it. */
export interface ToolResultRecord {
  name: string;
  toolCallId: string;
  /** The tool's return value, or the error text when the call failed. */
  result: unknown;
  isError: boolean;
}

export interface ToolBridgeOptions {
  /**
   * The belt. A tool that carries its schema has the full signature appended
   * to its first argument-validation failure in an action.
   */
  tools: readonly (Partial<ToolSignatureSource> & {
    name: string;
    needsToolCallId?: boolean;
  })[];
  invoke: (
    name: string,
    args: Record<string, unknown>,
    toolCallId: string
  ) => Promise<unknown>;
  /** Observability hook — fires before each bridged tool executes. */
  onToolCall?: (record: ToolCallRecord) => void;
  /** Observability hook — fires with what the call returned. */
  onToolResult?: (record: ToolResultRecord) => void;
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
   * and waiting to ride the tool result as a provider image message. At most
   * {@link MAX_ACTION_IMAGES} are kept; `dropped` counts the rest. Draining
   * clears both.
   */
  drainImages: () => { images: MessageImageContent[]; dropped: number };
  /**
   * The `generation_id` of every result a bridged call answered with, across
   * all of the step's actions. A failing step intersects the user's completed
   * generations with this set so it names its own paid work and not a
   * sibling step's.
   */
  generationIds: () => ReadonlySet<string>;
  /**
   * The action's disclosure state, shared with the capability modules the
   * action mounts. {@link ToolBridge.resetActionBudget} resets it.
   */
  signatureDisclosure: SignatureDisclosure;
}

/** The `generation_id` a generation-producing capability answers with. */
function generationIdOf(result: unknown): string | null {
  if (!isRecord(result)) return null;
  const id = result["generation_id"];
  return isNonEmptyString(id) ? id : null;
}

/** Force a value through JSON so it marshals cleanly across the WASM boundary. */
export function toTransferable(value: unknown): JsonValue {
  if (value === null || value === undefined) return null;
  if (isString(value) || isNumber(value) || isBoolean(value)) {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

/**
 * Tool errors and failed edit batches stop dependent guest code. Successful
 * operations in a partial batch may already be persisted.
 */
export function extractErrorPayload(result: unknown): string | null {
  // A missing pack is a failure like any other. Answering it as data let a
  // guest that mapped over several run_node calls keep the refusals as if they
  // were outputs and save them. The message names the pack and the install
  // step, and a guest that wants to continue catches it.
  const missing = missingPackDetailsOf(result);
  if (missing) {
    return `missing_pack: ${missingPackText(missing)}`;
  }
  if (!isObjectLike(result) || Array.isArray(result)) {
    return null;
  }
  const record = result as Record<string, unknown>;
  if (isString(record["error"])) {
    const message = record["message"];
    const summary = isNonEmptyString(message) ? message : record["error"];
    const validation = record["validation"];
    return isObjectLike(validation)
      ? summary + "\n" + JSON.stringify(validation, null, 2)
      : summary;
  }
  const { applied, failed, ops } = record;
  if (
    isNumber(applied) &&
    isNumber(failed) &&
    failed > 0 &&
    Array.isArray(ops)
  ) {
    const errors = ops.flatMap((op) => {
      if (!isObjectLike(op) || op.ok !== false || !isString(op.error)) {
        return [];
      }
      return [`${isString(op.op) ? op.op : "operation"}: ${op.error}`];
    });
    return (
      `Edit batch: ${applied} applied, ${failed} failed. ${errors.join(" ")} ` +
      (applied > 0
        ? "Successful operations may already be saved. "
        : "No operations applied. ") +
      "Read the current document state before retrying or issuing dependent edits."
    );
  }
  return null;
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
  let droppedImages = 0;
  const generationIds = new Set<string>();
  const disclosure = createSignatureDisclosure();

  const callTool = async (
    name: unknown,
    argsJson: unknown
  ): Promise<BridgeResult> => {
    const tool = isString(name) ? byName.get(name) : undefined;
    try {
      if (!isString(name) || !tool) {
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
          return {
            ok: false,
            error: `tools.${name}: arguments must be JSON-serializable`
          };
        }
      }

      totalCalls++;
      const toolCallId = `codeact_${totalCalls}`;
      options.onToolCall?.({ name, args, toolCallId });

      const input = Tool.stripMessage(args);
      if (tool.needsToolCallId) {
        input[TOOL_CALL_ID_FIELD] = toolCallId;
      }
      let result = await options.invoke(name, input, toolCallId);
      // Read before the error branch: a failed generation still answers with
      // its id, and the registry decides later whether it completed.
      const generationId = generationIdOf(result);
      if (generationId !== null) generationIds.add(generationId);
      // A view-image-style result carries pixels the model asked for. They
      // cannot ride the JSON observation (base64 would burn the context for
      // nothing), so strip them here and let the caller forward them as a
      // provider image message alongside the observation.
      const injected = extractInjectableImages(result);
      if (injected) {
        for (const image of injected.images) {
          if (pendingImages.length < MAX_ACTION_IMAGES)
            pendingImages.push(image);
          else droppedImages++;
        }
        result = stripImagePayload(result);
      }
      const errorPayload = extractErrorPayload(result);
      if (errorPayload !== null) {
        options.onToolResult?.({
          name,
          toolCallId,
          result: errorPayload,
          isError: true
        });
        const message = isArgumentValidationFailure(result)
          ? disclosure.withSignature(signatureSource(tool), errorPayload)
          : errorPayload;
        return { ok: false, error: `tools.${name}: ${message}` };
      }
      const transferable = toTransferable(compactResourceIds(result));
      options.onToolResult?.({
        name,
        toolCallId,
        result: transferable,
        isError: false
      });
      return { ok: true, result: transferable };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        error: isArgumentValidationFailure(e)
          ? disclosure.withSignature(signatureSource(tool), message)
          : message
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
      disclosure.reset();
    },
    drainImages: () => {
      const images = pendingImages;
      const dropped = droppedImages;
      pendingImages = [];
      droppedImages = 0;
      return { images, dropped };
    },
    generationIds: () => generationIds,
    signatureDisclosure: disclosure
  };
}

/** A belt entry as a signature source, when it carries a schema. */
function signatureSource(
  tool: ToolBridgeOptions["tools"][number] | undefined
): ToolSignatureSource | undefined {
  return tool?.inputSchema === undefined
    ? undefined
    : { name: tool.name, description: tool.description, inputSchema: tool.inputSchema };
}

/**
 * The tools a chat turn offers as provider tools besides `execute_code` and
 * `view_image`. The rest of {@link DIRECT_TOOL_NAMES} stays on the belt: an
 * action imports it (`toolImportLine`), and discovery, web and delegation are
 * also `nodetool.models.*`, `nodetool.nodes.*`, `nodetool.web.*` and
 * `nodetool.agents.run`. Models almost never call those top level, and their
 * schemas were the largest part of every request.
 *
 * The set depends on the permission mode alone, never on focus, so the tool
 * list stays the same across the turns of a thread. Plan mode is the one
 * change: it offers `create_plan`, since the plan is that turn's deliverable,
 * and every other mode offers `execute_plan` to run the plan the user approved.
 */
export function chatDirectToolNames(permissionMode: string): ReadonlySet<string> {
  return new Set([
    "todo_write",
    permissionMode === "plan" ? "create_plan" : "execute_plan"
  ]);
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

/** The reserved bindings as prose: "`a`, `b` and `c`". */
function reservedBindingList(): string {
  const names = RESERVED_ACTION_BINDINGS.map((n) => `\`${n}\``);
  return names.length > 1
    ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
    : names.join("");
}

/** Two short sentences naming the reserved bindings, for the action contract. */
export const RESERVED_BINDINGS_SENTENCE =
  `The prelude declares ${reservedBindingList()}. ` +
  "Redeclaring one is a SyntaxError.";

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

interface TypeLabelOptions {
  /** Object nesting spelled out before an object is written as `object`. */
  maxDepth: number;
  /**
   * Longest an optional field's type may render. A longer one is written one
   * level deep (`object`, `object[]`) instead. Required fields always render
   * in full.
   */
  optionalFieldCap?: number;
}

/** What the system catalog and search hits show: two levels of objects. */
const SIGNATURE_LABEL: TypeLabelOptions = { maxDepth: 2 };

/**
 * What a focused tool shows. The depth only stops a recursive schema. The cap
 * keeps a tool such as `ui_timeline_set_clip_params`, whose optional style
 * objects nest five levels of unions, from costing more than a whole surface.
 */
const FOCUSED_LABEL: TypeLabelOptions = { maxDepth: 8, optionalFieldCap: 400 };

/** Parenthesize a top-level union so a `[]` suffix applies to all of it. */
function arrayOf(label: string): string {
  let nesting = 0;
  let quoted = false;
  for (let i = 0; i < label.length; i++) {
    const char = label[i];
    if (quoted) {
      if (char === "\\") i++;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === "{" || char === "[" || char === "(" || char === "<") nesting++;
    else if (char === "}" || char === "]" || char === ")" || char === ">") nesting--;
    else if (char === "|" && nesting === 0) return `(${label})[]`;
  }
  return `${label}[]`;
}

function schemaTypeLabel(
  schema: unknown,
  options: TypeLabelOptions = SIGNATURE_LABEL,
  depth = 0
): string {
  if (!isObjectLike(schema)) return "unknown";
  const s = schema as Record<string, unknown>;
  const nested = (value: unknown) => schemaTypeLabel(value, options, depth + 1);
  if ("const" in s) return JSON.stringify(s["const"]);
  if (Array.isArray(s["enum"])) {
    return (s["enum"] as unknown[]).map((v) => JSON.stringify(v)).join(" | ");
  }
  const variants = s["anyOf"] ?? s["oneOf"];
  if (Array.isArray(variants)) {
    return [
      ...new Set(variants.map((v) => schemaTypeLabel(v, options, depth)))
    ].join(" | ");
  }
  const type = s["type"];
  if (type === "array") {
    if (Array.isArray(s["prefixItems"])) {
      return `[${(s["prefixItems"] as unknown[]).map(nested).join(", ")}]`;
    }
    return arrayOf(nested(s["items"]));
  }
  if (type === "object") {
    const props = s["properties"] as Record<string, unknown> | undefined;
    const extra = s["additionalProperties"];
    if (depth >= options.maxDepth) return "object";
    if (!props) {
      if (!isObjectLike(extra) || Object.keys(extra).length === 0) return "object";
      const keys = isObjectLike(s["propertyNames"])
        ? nested(s["propertyNames"])
        : "string";
      return `Record<${keys}, ${nested(extra)}>`;
    }
    const required = new Set(
      Array.isArray(s["required"]) ? (s["required"] as string[]) : []
    );
    const cap = options.optionalFieldCap;
    const fields = Object.entries(props).map(([key, value]) => {
      if (required.has(key)) return `${key}: ${nested(value)}`;
      let label = nested(value);
      if (cap !== undefined && label.length > cap) {
        label = schemaTypeLabel(value, { maxDepth: depth + 1 }, depth + 1);
      }
      return `${key}?: ${label}`;
    });
    // A catch-all (`additionalProperties: {}` or a schema) takes other keys too.
    if (isObjectLike(extra)) fields.push("...");
    return `{${fields.join(", ")}}`;
  }
  if (type === "integer") return "number";
  if (isString(type)) return type;
  if (Array.isArray(type)) return type.join(" | ");
  return "unknown";
}

/** Abbreviations whose period does not end a sentence. */
const ABBREVIATION = /(?:\be\.g|\bi\.e|\betc|\bvs|\bcf)$/i;

/**
 * The description up to its first sentence end. A period inside parentheses
 * or after an abbreviation such as "e.g." does not end the sentence.
 */
export function firstSentence(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  let parens = 0;
  for (let i = 0; i < trimmed.length - 1; i++) {
    const char = trimmed[i];
    if (char === "(") parens++;
    else if (char === ")") parens = Math.max(0, parens - 1);
    else if (
      char === "." &&
      trimmed[i + 1] === " " &&
      parens === 0 &&
      i > 0 &&
      !ABBREVIATION.test(trimmed.slice(0, i))
    ) {
      return trimmed.slice(0, i + 1);
    }
  }
  return trimmed;
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
  return module === undefined ? undefined : sandboxCapabilitySpecifier(module);
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

/**
 * The call signature with every shape spelled out: nested objects to any
 * depth, every enum value, `const` literals, array items, and the types of
 * optional fields. A `select:` lookup answers with it, and so does the first
 * call in an action that fails validating its arguments.
 */
export function focusedToolSignature(tool: ToolSignatureSource): string {
  const params = schemaTypeLabel(tool.inputSchema, FOCUSED_LABEL);
  return `await ${tool.name}(${params === "{}" ? "" : params})`;
}

/** Signature bullet + first sentence of the description. */
export function renderToolSignature(tool: ToolSignatureSource): string {
  const description = firstSentence(tool.description ?? "");
  return description
    ? `- ${toolSignature(tool)}\n  ${description}`
    : `- ${toolSignature(tool)}`;
}

/** Longest purpose line, about 14 tokens. */
const PURPOSE_MAX = 60;

/**
 * A clause break that ends a purpose line when enough precedes it. A
 * parenthesis is not one: "the pixel color at (x, y) on the canvas" would end
 * on "at".
 */
const PURPOSE_CLAUSE_BREAKS = [": ", " — ", "; "];
const PURPOSE_CLAUSE_MIN = 24;

/**
 * What a tool is for, in one short line: the description's first sentence
 * without its period, cut at its first clause break and capped at a word
 * boundary. The rest of the description is one `select:` lookup away.
 */
export function toolPurpose(description: string): string {
  let line = firstSentence(description).replace(/\.$/, "");
  for (const separator of PURPOSE_CLAUSE_BREAKS) {
    const at = line.indexOf(separator);
    if (at >= PURPOSE_CLAUSE_MIN) {
      line = line.slice(0, at);
      break;
    }
  }
  if (line.length <= PURPOSE_MAX) return line;
  const cut = line.slice(0, PURPOSE_MAX - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[,;:]$/, "")}…`;
}

/**
 * Maximum unranked tools listed by name inside a focused turn block before
 * switching to fixed tool groups backed by `nodetool.searchTools()` (D105).
 */
const FOCUSED_NAMED_LIST_LIMIT = 35;

/**
 * Fixed tool-group directory for large focused editors (D105). Listing groups
 * instead of every tool name keeps the turn block constant in size as new
 * tools are added, while telling the model what topics to query with
 * `nodetool.searchTools()`.
 */
const FOCUSED_TOOL_GROUPS: Readonly<Record<string, readonly string[]>> = {
  ui_timeline_: [
    "- tracks & mixer: track settings, volume, pan, master bus, insert effects, folders, automation",
    "- clips & sections: media, shape, group, loop, join, ripple delete, gaps, insert/delete/duplicate/paste time",
    "- visuals & motion: effects, transitions, masks, mattes, time remap, 3D clips, stagger, clear animations",
    "- reframe & tracking: retarget format, subject tracking, reframe keyframes, object tracks",
    "- midi & instruments: midi clips, notes, controllers, tempo, key, instruments, transpose, quantize, velocity",
    "- chords & harmony: chord track, progressions, chord detection, arp/comp harmony, fit notes to chords",
    "- step sequencer: pattern regions, rows, steps, pattern text, rotate, transpose, randomize, pattern library, MIDI conversion",
    "- markers, takes & setup: markers, beat snapping, transcript cuts, takes, generation, guided beats, seek, select"
  ]
};

/**
 * A focused document's tools for the turn block, with no signatures: per
 * import specifier the import pattern, then one line per tool in the usage
 * table ({@link rankFocusedTools}) with its purpose, then either the other
 * names or (when a surface exceeds {@link FOCUSED_NAMED_LIST_LIMIT}) fixed
 * tool groups pointing to `nodetool.searchTools()`. The output depends only on
 * the set of tools, never on the order they arrive in.
 */
export function renderFocusedToolCatalog(
  tools: readonly ToolSignatureSource[],
  grafted: ReadonlyMap<string, string> = new Map()
): string {
  const groups = new Map<string, ToolSignatureSource[]>();
  for (const tool of tools) {
    const specifier = toolSpecifier(tool.name) ?? grafted.get(tool.name) ?? "";
    const group = groups.get(specifier);
    if (group === undefined) groups.set(specifier, [tool]);
    else group.push(tool);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([specifier, group]) => {
      const { described, named } = rankFocusedTools(group);
      const lines = [
        specifier === ""
          ? "Called as ordinary tools, with no import:"
          : `\`import { <name>, … } from ${JSON.stringify(specifier)};\``,
        ...described.map(
          (tool) => `- ${tool.name}: ${toolPurpose(tool.description ?? "")}`
        )
      ];
      if (named.length > 0) {
        const groupedByPrefix = new Map<string, ToolSignatureSource[]>();
        const remaining: ToolSignatureSource[] = [];
        for (const t of named) {
          const match = /^(ui_[a-z0-9]+_)/.exec(t.name);
          const prefix = match?.[1];
          if (prefix && FOCUSED_TOOL_GROUPS[prefix]) {
            const bucket = groupedByPrefix.get(prefix);
            if (bucket) bucket.push(t);
            else groupedByPrefix.set(prefix, [t]);
          } else {
            remaining.push(t);
          }
        }
        for (const [prefix, bucket] of [...groupedByPrefix.entries()].sort(([a], [b]) =>
          a.localeCompare(b)
        )) {
          if (bucket.length > FOCUSED_NAMED_LIST_LIMIT) {
            lines.push(
              `More \`${prefix}*\` tools by group — call \`await nodetool.searchTools("+${prefix} <topic>")\` for the full list:`,
              ...FOCUSED_TOOL_GROUPS[prefix]!
            );
          } else {
            remaining.push(...bucket);
          }
        }
        if (remaining.length > 0) {
          remaining.sort((a, b) => a.name.localeCompare(b.name));
          lines.push(
            `${described.length > 0 ? "Also" : "Tools"}: ${remaining.map((t) => t.name).join(", ")}`
          );
        }
      }
      return lines.join("\n");
    })
    .join("\n\n");
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
      [
        "// no import — these are called as ordinary tools:",
        ...ungrouped.map(renderToolSignature)
      ].join("\n")
    );
  }
  return blocks.join("\n\n");
}

/** What `nodetool.searchTools()` returns to the guest, per matched tool. */
export interface ToolSearchHit {
  name: string;
  /** The whole description for a `select:` hit, its purpose line otherwise. */
  description: string;
  /** The full signature ({@link focusedToolSignature}), `select:` hits only. */
  signature?: string;
  /** The capability namespace, absent for a tool no module owns. */
  module?: string;
  /** The specifier to import it from, absent for the same reason. */
  specifier?: string;
  /** The exact import statement to write. */
  import?: string;
  /** Keyword hits only: the `select:` lookup that returns the rest. */
  details?: string;
}

/**
 * How much a search hit carries: `full` for a `select:` lookup, which names
 * tools the model is about to call, `compact` for a keyword search, which
 * finds candidates.
 */
export type ToolSearchDetail = "full" | "compact";

/** The detail a `nodetool.searchTools()` query asks for. */
export function toolSearchDetail(query: string): ToolSearchDetail {
  return query.trim().toLowerCase().startsWith("select:") ? "full" : "compact";
}

/** One search hit, with everything needed to write the call or look it up. */
export function toolSearchHit(
  tool: ToolSignatureSource,
  /** The namespace a host grafted this name onto, if any. */
  graftedModule?: string,
  detail: ToolSearchDetail = "full"
): ToolSearchHit {
  const description = tool.description ?? "";
  const hit: ToolSearchHit =
    detail === "full"
      ? { name: tool.name, description, signature: focusedToolSignature(tool) }
      : { name: tool.name, description: toolPurpose(description) };
  const module = capabilityModuleOf(tool.name) ?? graftedModule;
  if (module !== undefined) {
    hit.module = module;
    hit.specifier = sandboxCapabilitySpecifier(module);
    hit.import = `import { ${tool.name} } from ${JSON.stringify(sandboxCapabilitySpecifier(module))};`;
  }
  if (detail === "compact") {
    hit.details = `nodetool.searchTools("select:${tool.name}") returns the signature and the full description.`;
  }
  return hit;
}

// ---------------------------------------------------------------------------
// Disclosure on error
// ---------------------------------------------------------------------------

/** Text that is a JSON list of Zod issues, the way `ZodError.message` reads. */
function isZodIssueListText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith("[")) return false;
  try {
    return isZodIssueList(JSON.parse(trimmed) as unknown);
  } catch {
    return false;
  }
}

/** A non-empty list of `{code, path, message}` issues. */
function isZodIssueList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (issue) =>
        isRecord(issue) &&
        isString(issue["code"]) &&
        Array.isArray(issue["path"]) &&
        isString(issue["message"])
    )
  );
}

/**
 * Whether a failed call failed on its arguments: the
 * `invalid_tool_arguments` result a capability or `Tool` answers with, a
 * thrown `ZodError`, or the `{error}` a browser tool sends back, whose text is
 * that error's issue list. Unknown keys count once a strict schema rejects
 * them (`unrecognized_keys`). Anything else, such as a missing document, does
 * not.
 */
export function isArgumentValidationFailure(failure: unknown): boolean {
  if (isString(failure)) return isZodIssueListText(failure);
  if (failure instanceof Error) {
    return (
      isZodIssueList((failure as { issues?: unknown }).issues) ||
      isZodIssueListText(failure.message)
    );
  }
  if (!isRecord(failure)) return false;
  if (failure["error"] === "invalid_tool_arguments") return true;
  return [failure["error"], failure["message"]].some(
    (text) => isString(text) && isZodIssueListText(text)
  );
}

/**
 * Appends a tool's full signature to an argument-validation failure, once per
 * tool per action, so a repeated mistake does not repeat the signature.
 */
export interface SignatureDisclosure {
  /**
   * `message`, followed by the tool's full signature the first time this
   * action reports a validation failure of that tool. A tool with no schema
   * gets `message` unchanged.
   */
  withSignature(tool: ToolSignatureSource | undefined, message: string): string;
  /** Start a new action: every tool may disclose again. */
  reset(): void;
}

export function createSignatureDisclosure(): SignatureDisclosure {
  const disclosed = new Set<string>();
  return {
    withSignature(tool, message) {
      if (tool?.inputSchema === undefined || disclosed.has(tool.name)) {
        return message;
      }
      disclosed.add(tool.name);
      return `${message}\nThe full signature: ${focusedToolSignature(tool)}`;
    },
    reset() {
      disclosed.clear();
    }
  };
}
