/**
 * Shared wire text for the background delegation pair (`start_subtask` /
 * `wait_subtasks`).
 *
 * A data-only leaf, like `read-only-search-prompt.ts`: the tool classes and
 * the capability specs both import from here so one string stands behind
 * every surface and the halves cannot drift.
 */

import type { JsonSchema } from "@nodetool-ai/runtime";

export const START_SUBTASK_DESCRIPTION = [
  "Spawn a background subtask: a fresh agent loop that starts now and keeps",
  "running while you continue. Returns a receipt (`subtask_id`) immediately",
  "instead of waiting for the result.",
  "",
  "Use this when independent work can run while you do something else —",
  "research one question while you draft another section, fan out over many",
  "sources. The child inherits your full toolset, sees none of this chat",
  "history, and can recurse with `start_subtask`/`run_subtask` up to the",
  "depth limit.",
  "",
  "Collect results with `wait_subtasks`. If you finish your answer before",
  "calling it, the results are lost to this turn — always wait for what you",
  "actually need. For work you need before anything else, use `run_subtask`,",
  "which blocks and returns the text directly."
].join("\n");

export const START_SUBTASK_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    description: {
      type: "string",
      description:
        "Short user-facing label for the subtask (3-7 words). Shown in the UI card."
    },
    prompt: {
      type: "string",
      description:
        'Full task description for the subagent. Self-contained — the subagent does not see the parent\'s chat history. If you need a structured response, say so here (e.g. "reply as JSON with fields x, y, z").'
    }
  },
  required: ["description", "prompt"],
  additionalProperties: false
};

export const WAIT_SUBTASKS_DESCRIPTION = [
  "Wait for background subtasks started with `start_subtask` and collect",
  "their results.",
  "",
  "Blocks until every requested subtask has finished, or until the timeout.",
  "Each row reports status (`completed`, `failed`, `aborted`, or still",
  "`running` past a timeout) plus the subagent's final message or error.",
  "Omit `ids` to collect everything this turn has started."
].join("\n");

export const WAIT_SUBTASKS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    ids: {
      type: "array",
      items: { type: "string" },
      description:
        "Subtask ids to collect (from `start_subtask` receipts). Omit to collect all."
    },
    timeout_ms: {
      type: "number",
      description:
        "How long to block, in milliseconds (1000–900000). Default 300000 (5 min). On timeout, running subtasks are reported as still running."
    }
  },
  additionalProperties: false
};
