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

export const CREATE_PLAN_DESCRIPTION = [
  "Decompose an objective into an executable plan and show it to the user.",
  "It PLANS ONLY — nothing in the plan runs, and no tool in it is called.",
  "",
  "Call this when the user asks for work that takes several steps and they",
  "want to see the shape of it first: the planner returns a DAG of tasks,",
  "each with its own steps and dependencies, and independent tasks are marked",
  "as such so the user can see what would run concurrently.",
  "",
  "The plan streams into the conversation as it is built. Return your own",
  "short summary afterwards — do not re-list every step the user can already",
  "see."
].join("\n");

export const CREATE_PLAN_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    objective: {
      type: "string",
      description:
        "What the plan must achieve, self-contained. The planner does not see the chat history, so restate any constraint that matters (inputs, formats, limits)."
    }
  },
  required: ["objective"],
  additionalProperties: false
};

export const createPlanSpec: CapabilitySpec = {
  name: "create_plan",
  description: CREATE_PLAN_DESCRIPTION,
  inputSchema: CREATE_PLAN_SCHEMA,
  // Planning reads the toolbelt's names to route steps and calls none of them,
  // so it is read-only — which is also what keeps it callable in plan mode,
  // where every other category is blocked.
  category: "read",
  userMessage: (params) => {
    const objective =
      isString(params["objective"]) ? params["objective"].trim() : "";
    return objective ? `Planning: ${objective.slice(0, 60)}` : "Planning";
  }
};

export const EXECUTE_PLAN_DESCRIPTION = [
  "Run a plan that already exists — the one `create_plan` produced and the",
  "user has seen. It EXECUTES: every step runs with the tools it needs, and",
  "independent tasks run concurrently.",
  "",
  "Pass the plan itself, not a reference to it: `title` plus the `tasks`",
  "array exactly as `create_plan` returned it. Copy it verbatim unless the",
  "user asked for a change (dropping a task, reordering, editing a step) — in",
  "that case pass the amended plan, and it is the amended plan that runs.",
  "",
  "Tasks stream into the conversation as they finish. Each task's result is",
  "also written to shared memory under `task:<task id>`, so read it back with",
  "`read_shared` instead of re-running the work. The call returns how every",
  "task settled; write the answer yourself from those results."
].join("\n");

const EXECUTE_PLAN_STEP_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    id: {
      type: "string",
      description: "Step id, unique across the whole plan."
    },
    instructions: {
      type: "string",
      description: "What this step does, self-contained."
    },
    depends_on: {
      type: "array",
      items: { type: "string" },
      description:
        "Ids of steps in the same task that must finish first ([] for none)."
    }
  },
  required: ["id", "instructions"]
};

export const EXECUTE_PLAN_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "The plan's title." },
    tasks: {
      type: "array",
      description:
        "The plan's tasks, as `create_plan` returned them. Dependencies form a DAG; independent tasks run concurrently.",
      items: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Task id, unique across the plan."
          },
          title: { type: "string", description: "Task title." },
          depends_on: {
            type: "array",
            items: { type: "string" },
            description:
              "Ids of tasks that must finish first ([] for an independent task)."
          },
          steps: {
            type: "array",
            items: EXECUTE_PLAN_STEP_SCHEMA,
            description: "The task's steps, forming their own DAG."
          }
        },
        required: ["id", "title", "steps"]
      }
    }
  },
  required: ["title", "tasks"]
};

export const executePlanSpec: CapabilitySpec = {
  name: "execute_plan",
  description: EXECUTE_PLAN_DESCRIPTION,
  inputSchema: EXECUTE_PLAN_SCHEMA,
  // Running a plan is the opposite of planning: every step acts, with whatever
  // the belt offers. `external` is what blocks it in plan mode and asks once
  // everywhere else — the confirmation for the whole plan. Each step's own
  // tool calls stay gated inside the child loops.
  category: "external",
  userMessage: (params) => {
    const title = isString(params["title"]) ? params["title"].trim() : "";
    const tasks = Array.isArray(params["tasks"]) ? params["tasks"].length : 0;
    const scope = tasks === 1 ? "1 task" : `${tasks} tasks`;
    return title ? `Running plan: ${title} (${scope})` : `Running plan (${scope})`;
  }
};

/** Every spec this module declares, in declaration order. */
export const agentsSpecs: readonly CapabilitySpec[] = [
  runSubtaskSpec,
  runSearchSpec,
  startSubtaskSpec,
  waitSubtasksSpec,
  createPlanSpec,
  executePlanSpec
];
