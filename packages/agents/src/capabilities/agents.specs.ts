/**
 * The `agents` module's specs — data only, no implementation.
 *
 * Split out so a belt can be assembled synchronously: the registry's eager
 * spec table imports this file, never `agents.ts`, so nothing the
 * implementations pull in reaches the entry graph. `agents.ts` imports these
 * back and attaches each to its implementation, so there is one spec object
 * behind both halves.
 */

import type { CapabilitySpec } from "./types.js";
import type { JsonSchema } from "@nodetool-ai/runtime";
import { READ_ONLY_SEARCH_DESCRIPTION } from "../prompts/read-only-search-prompt.js";
import {
  START_SUBTASK_DESCRIPTION,
  START_SUBTASK_SCHEMA,
  WAIT_SUBTASKS_DESCRIPTION,
  WAIT_SUBTASKS_SCHEMA
} from "../prompts/background-subtask-prompt.js";
import { isString } from "../utils/type-guards.js";

export const RUN_SUBTASK_DESCRIPTION = [
  "Spawn a focused subtask handled by a fresh agent loop. The subtask returns",
  "the subagent's final assistant message as plain text.",
  "",
  "Call this when work warrants its own focused execution — research a",
  "question end-to-end, perform a multi-step transformation, draft a",
  "self-contained artifact. Emit multiple `run_subtask` calls in one turn",
  "to run independent subtasks concurrently. Subtasks can themselves call",
  "`run_subtask` up to the recursion depth limit.",
  "",
  "The subtask inherits the parent's full toolset. If you need a specific",
  "output shape (e.g. JSON), say so inside `instructions` — do not request a",
  "schema here. The subagent will write the result; you'll receive that",
  "text verbatim and can quote or parse it."
].join("\n");

export const RUN_SUBTASK_SCHEMA: JsonSchema = {
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

export const RUN_SEARCH_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description:
        "Precise description of what to locate. Self-contained — the search loop does not see the parent's chat history."
    },
    breadth: {
      type: "string",
      enum: ["medium", "very thorough"],
      default: "medium",
      description:
        'How wide to sweep. "medium" (default) checks a few likely locations and obvious naming variants; "very thorough" systematically searches many locations and naming conventions.'
    }
  },
  required: ["query"],
  additionalProperties: false
};

export const runSubtaskSpec: CapabilitySpec = {
  name: "run_subtask",
  description: RUN_SUBTASK_DESCRIPTION,
  inputSchema: RUN_SUBTASK_SCHEMA,
  // The child's events nest under the caller's card, which needs the caller's
  // tool-call id. `SubAgentTool` declares the same thing on the class path.
  needsToolCallId: true,
  // The child loop's own tools are gated inside it, so spawning one has no
  // side effect of its own.
  category: "read",
  userMessage: (params) => {
    const desc =
      isString(params["description"])
        ? params["description"].trim()
        : "";
    return desc ? `Running subtask: ${desc}` : "Running subtask";
  }
};

export const runSearchSpec: CapabilitySpec = {
  name: "run_search",
  // The description is the prompt module's own, so the capability and the
  // class cannot drift apart.
  description: READ_ONLY_SEARCH_DESCRIPTION,
  inputSchema: RUN_SEARCH_SCHEMA,
  // As for `run_subtask`: the search loop's events nest under the caller.
  needsToolCallId: true,
  // The child loop is filtered to a read-only allowlist and cannot recurse.
  category: "read",
  userMessage: (params) => {
    const query =
      isString(params["query"]) ? params["query"].trim() : "";
    return query ? `Searching: ${query}` : "Searching workspace";
  }
};

export const startSubtaskSpec: CapabilitySpec = {
  name: "start_subtask",
  description: START_SUBTASK_DESCRIPTION,
  inputSchema: START_SUBTASK_SCHEMA,
  // The child's events nest under the caller's card, which needs the caller's
  // tool-call id — same as `run_subtask`.
  needsToolCallId: true,
  // Spawning has no side effect of its own; the child loop's tools are gated
  // inside it. The registry bookkeeping is per-turn state, not a mutation.
  category: "read",
  userMessage: (params) => {
    const desc =
      isString(params["description"]) ? params["description"].trim() : "";
    return desc
      ? `Starting background subtask: ${desc}`
      : "Starting background subtask";
  }
};

export const waitSubtasksSpec: CapabilitySpec = {
  name: "wait_subtasks",
  description: WAIT_SUBTASKS_DESCRIPTION,
  inputSchema: WAIT_SUBTASKS_SCHEMA,
  category: "read"
};

/** Every spec this module declares, in declaration order. */
export const agentsSpecs: readonly CapabilitySpec[] = [
  runSubtaskSpec,
  runSearchSpec,
  startSubtaskSpec,
  waitSubtasksSpec
];
