/**
 * Consecutive same-tool grouping for the chat tool-call chain.
 *
 * A run of two or more calls with the same groupable name collapses into
 * one header. `execute_code` / `run_subtask` / `create_plan` stay as
 * individual cards — each one carries a distinct title the user needs to read.
 */

import type { Message, ToolCall } from "../../../stores/ApiTypes";
import { isObjectLike, isString } from "../../../utils/typePredicates";
import { toolCallCountLabel, toolCallDetail } from "./toolCallPhrase";

/** Tools that never collapse — each call is a distinct unit of work. */
const UNGROUPABLE_TOOL_NAMES = new Set([
  "execute_code",
  "run_subtask",
  "run_search",
  "ask_user",
  "request_secret",
  "create_plan"
]);

/** Minimum consecutive same-name calls before a run becomes a group. */
const TOOL_CALL_GROUP_THRESHOLD = 2;

const PREVIEW_LIMIT = 3;

export type ToolCallRun =
  | { kind: "single"; call: ToolCall }
  | { kind: "group"; name: string; calls: ToolCall[] };

function isGroupableToolName(name: string | null | undefined): boolean {
  if (!name) {
    return false;
  }
  return !UNGROUPABLE_TOOL_NAMES.has(name);
}

export function groupConsecutiveToolCalls(
  toolCalls: readonly ToolCall[]
): ToolCallRun[] {
  const runs: ToolCallRun[] = [];
  let i = 0;
  while (i < toolCalls.length) {
    const call = toolCalls[i];
    const name = call.name;
    if (!isGroupableToolName(name)) {
      runs.push({ kind: "single", call });
      i += 1;
      continue;
    }
    let end = i + 1;
    while (end < toolCalls.length && toolCalls[end].name === name) {
      end += 1;
    }
    const slice = toolCalls.slice(i, end);
    if (slice.length >= TOOL_CALL_GROUP_THRESHOLD) {
      runs.push({ kind: "group", name, calls: slice });
    } else {
      for (const single of slice) {
        runs.push({ kind: "single", call: single });
      }
    }
    i = end;
  }
  return runs;
}

export function toolCallGroupHeadline(name: string, calls: readonly ToolCall[]): string {
  const messages = calls
    .map((call) => (isString(call.message) ? call.message.trim() : ""))
    .filter((message) => message.length > 0);
  const shared =
    messages.length === calls.length &&
    messages.every((message) => message === messages[0]);
  if (shared) {
    return messages[0];
  }
  return toolCallCountLabel(name, calls.length);
}

/**
 * Short distinctive values from the run (queries, hostnames, paths), for a
 * one-line preview under the group header. Returns null when there is
 * nothing worth showing besides the headline.
 */
export function toolCallGroupPreview(
  name: string,
  calls: readonly ToolCall[]
): string | null {
  const values: string[] = [];
  const seen = new Set<string>();
  for (const call of calls) {
    const value = toolCallDetail(call, "short");
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    values.push(value);
  }
  if (values.length === 0) {
    return null;
  }
  const headline = toolCallGroupHeadline(name, calls);
  if (values.length === 1 && headline.includes(values[0])) {
    return null;
  }
  const shown = values.slice(0, PREVIEW_LIMIT);
  const extra = values.length - shown.length;
  const joined = shown.join(" · ");
  return extra > 0 ? `${joined} +${extra}` : joined;
}

function messageHasVisibleContent(message: Message): boolean {
  const content = message.content;
  if (isString(content)) {
    return content.trim().length > 0;
  }
  if (Array.isArray(content)) {
    return content.some((block) => {
      if (!block || !isObjectLike(block)) {
        return false;
      }
      if (block.type === "text") {
        return isString(block.text) && block.text.trim().length > 0;
      }
      return true;
    });
  }
  return content != null;
}

/**
 * The tool name a tool-call-only assistant message can merge on, or null
 * when the message must stay a row of its own.
 */
export function mergeableToolName(message: Message): string | null {
  if (message.role !== "assistant") {
    return null;
  }
  const calls = message.tool_calls;
  if (!Array.isArray(calls) || calls.length === 0) {
    return null;
  }
  if (messageHasVisibleContent(message)) {
    return null;
  }
  const name = calls[0]?.name;
  if (!isGroupableToolName(name)) {
    return null;
  }
  if (!calls.every((call) => call.name === name)) {
    return null;
  }
  return name;
}

/**
 * Collapse consecutive tool-call-only assistant messages that share one
 * groupable tool name into a single message whose `tool_calls` are the
 * concatenation. The first message's identity (id, created_at) is kept so
 * the virtualizer key stays stable as the run grows.
 */
export function collapseToolCallOnlyMessages(
  messages: readonly Message[]
): Message[] {
  const collapsed: Message[] = [];
  for (const message of messages) {
    const name = mergeableToolName(message);
    const previous = collapsed[collapsed.length - 1];
    if (
      name !== null &&
      previous !== undefined &&
      mergeableToolName(previous) === name
    ) {
      const previousCalls = previous.tool_calls ?? [];
      const nextCalls = message.tool_calls ?? [];
      collapsed[collapsed.length - 1] = {
        ...previous,
        tool_calls: [...previousCalls, ...nextCalls]
      };
      continue;
    }
    collapsed.push(message);
  }
  return collapsed;
}
