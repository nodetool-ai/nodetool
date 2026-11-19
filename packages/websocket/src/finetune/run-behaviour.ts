/**
 * Per-run counts of the mistakes the CodeAct harness corrects, for the
 * fine-tuning eval to print next to the pass rate.
 *
 * Each counter reads text the product already returns, so a trace recorded
 * before the counters existed yields the same numbers from its `replies` and
 * `finalRequest`. The eval's `compare.py` (under `nodetool-debug/finetune/`,
 * not in the repository) mirrors these patterns for such lines, so change
 * both together.
 */
import type { ChatTrace } from "./sft-export.js";

export interface RunBehaviour {
  /** Consecutive tool calls with the same name and normalized arguments. */
  repeatedCalls: number;
  /** Tool results that report a guest `ReferenceError`. */
  referenceErrors: number;
  /** Actions refused for a missing or wrong-module capability import. */
  importErrors: number;
  /** Storyboard edits refused for an op name the board does not know. */
  unknownOps: number;
  /** Writes refused because the caller's revision was stale. */
  revisionConflicts: number;
}

/** One model-level tool call: arguments as an object or a JSON string. */
export interface BehaviourCall {
  name: string;
  arguments: unknown;
}

const REFERENCE_ERROR = /ReferenceError/;
/** The refusals in `packages/agents/src/codeact/capability-modules.ts`. */
const IMPORT_ERROR =
  /is not defined in this action\. Nothing carries over|which that module does not export|which is not a NodeTool capability module/;
/** `parseBoardOps` in `packages/agents/src/capabilities/storyboards.ts`. */
const UNKNOWN_OP = /ops\[\d+\] names .{1,200}?; expected one of/;
/** Old and new storyboard text, and the `*_revision_conflict` codes. */
const REVISION_CONFLICT = /revision[ _]conflict/i;

/**
 * `execute_code` labels that do not change what runs. A retry that only
 * renames its title is still the same action.
 */
const LABEL_ARGUMENTS: Readonly<Record<string, readonly string[]>> = {
  execute_code: ["title", "description"]
};

/**
 * Code with comments dropped and whitespace reduced: runs of whitespace become
 * one space, and a space next to punctuation goes. String and template
 * literals stay byte for byte, so `"a  b"` and `"a b"` remain different.
 */
export function normalizeCode(code: string): string {
  const parts: string[] = [];
  let plain = "";
  const flushPlain = (): void => {
    parts.push(
      plain.replace(/\s+/g, " ").replace(/ ?([^\w$ ]) ?/g, "$1")
    );
    plain = "";
  };
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];
    if (ch === "/" && next === "/") {
      const end = code.indexOf("\n", i);
      plain += " ";
      i = end === -1 ? code.length : end;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = code.indexOf("*/", i + 2);
      plain += " ";
      i = end === -1 ? code.length : end + 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < code.length && code[j] !== ch) j += code[j] === "\\" ? 2 : 1;
      flushPlain();
      parts.push(code.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    plain += ch;
    i++;
  }
  flushPlain();
  return parts.join("").trim();
}

function argumentsObject(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

/** Stable JSON with sorted keys, so key order never makes two calls differ. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** The key two calls are compared by: arguments with code normalized. */
export function normalizeCallArguments(name: string, args: unknown): string {
  const parsed = argumentsObject(args);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return stableJson(parsed);
  }
  const labels = LABEL_ARGUMENTS[name] ?? [];
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (labels.includes(key)) continue;
    out[key] = key === "code" && typeof value === "string" ? normalizeCode(value) : value;
  }
  return stableJson(out);
}

/** Count the behaviours over one run's calls (in order) and tool results. */
export function countRunBehaviour(
  calls: readonly BehaviourCall[],
  results: readonly string[]
): RunBehaviour {
  let repeatedCalls = 0;
  let previous: string | undefined;
  for (const call of calls) {
    const key = `${call.name}\n${normalizeCallArguments(call.name, call.arguments)}`;
    if (key === previous) repeatedCalls++;
    previous = key;
  }
  const count = (pattern: RegExp): number =>
    results.filter((text) => pattern.test(text)).length;
  return {
    repeatedCalls,
    referenceErrors: count(REFERENCE_ERROR),
    importErrors: count(IMPORT_ERROR),
    unknownOps: count(UNKNOWN_OP),
    revisionConflicts: count(REVISION_CONFLICT)
  };
}

/**
 * The counters for a trace line: calls from every reply, results from the
 * final request. `null` when the run made no request to read them from.
 */
export function traceRunBehaviour(
  trace: Pick<ChatTrace, "replies" | "finalRequest">
): RunBehaviour | null {
  if (trace.finalRequest === null) return null;
  const calls = trace.replies.flatMap((entry) =>
    (entry.reply.tool_calls ?? []).map((call) => ({
      name: call.function.name,
      arguments: call.function.arguments
    }))
  );
  const results = trace.finalRequest.messages
    .filter((message) => message.role === "tool")
    .map((message) => message.content ?? "");
  return countRunBehaviour(calls, results);
}
