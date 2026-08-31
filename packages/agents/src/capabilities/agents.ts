/**
 * The `agents` capability module — delegation to a child agent loop.
 *
 * Four capabilities: `run_subtask` (blocking), `run_search` (read-only
 * child), `start_subtask` (background spawn) and `wait_subtasks` (collect).
 * Unlike every other ported namespace their classes stay exactly as they
 * are. `SubAgentTool` is not a schema plus a function: it owns the depth gate, the child context, the
 * streamed events, the tagging, and the settlement, and the runner constructs
 * one per turn over that turn's provider, model, toolbelt snapshot, and
 * forwarder. Reimplementing that here would be a second copy of the machinery
 * the sub-agent core exists to hold once.
 *
 * So the capability is the registry-visible face: the spec is the class's own
 * wire identity, and the implementation lazily constructs the class over
 * `run.subAgent` — which *is* `SubAgentToolRuntime` — and calls it through
 * `Tool.executeTool`. A run with no `subAgent` cannot delegate, and says so
 * naming the field rather than failing somewhere inside the child loop.
 *
 * Both are classified `read`: the call itself has no side effects, and the
 * child's own tools are gated in the child loop.
 *
 * Design: docs/tool-class-retirement-design.md § "PRs 4–9 — remaining
 * namespaces" (`/agents`).
 */

import type { JsonSchema } from "@nodetool-ai/runtime";
import { Tool } from "../tools/base-tool.js";
import { TOOL_CALL_ID_FIELD } from "../tools/subtask-fields.js";
import { READ_ONLY_SEARCH_DESCRIPTION } from "../prompts/read-only-search-prompt.js";
import type { SubAgentToolRuntime } from "../subagent.js";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
import {
  runSubtaskSpec,
  runSearchSpec,
  startSubtaskSpec,
  waitSubtasksSpec,
  createPlanSpec,
  RUN_SUBTASK_DESCRIPTION,
  RUN_SUBTASK_SCHEMA,
  RUN_SEARCH_SCHEMA
} from "./agents.specs.js";
import { isString } from "../utils/type-guards.js";

export {
  RUN_SUBTASK_DESCRIPTION,
  RUN_SUBTASK_SCHEMA,
  RUN_SEARCH_SCHEMA
} from "./agents.specs.js";

/**
 * The sub-agent runtime this run carries, or an error naming what is missing.
 * A headless run (an eval, an MCP mount, a CLI invocation with no forwarder)
 * has no runtime, and no child loop can be spawned without one.
 */
function subAgentRuntime(
  run: CapabilityRun,
  name: string
): SubAgentToolRuntime {
  const runtime = run.subAgent;
  if (!runtime) {
    throw new Error(
      `\`${name}\` needs a sub-agent runtime, but this run carries no ` +
        "`subAgent` (provider, model, parentTools, forwardMessage). The host " +
        "that builds the CapabilityRun must supply it."
    );
  }
  return runtime;
}

/**
 * Run one sub-agent tool over this run.
 *
 * The tool-call id reaches the class through `options.toolCallId` today
 * (`StepExecutor` and the CodeAct tool API pass it), and a capability
 * implementation only ever sees args — so the id travels in the args under
 * `_tool_call_id`, and is handed back to `Tool.executeTool` as the option.
 * `executeTool` re-stamps the same field on a `needsToolCallId` tool, so both
 * routes leave identical args and the child's events keep nesting under the
 * parent card.
 */
async function runSubAgentTool(
  tool: Tool,
  run: CapabilityRun,
  args: Record<string, unknown>
): Promise<unknown> {
  const toolCallId = args[TOOL_CALL_ID_FIELD];
  return Tool.executeTool(
    tool,
    run.context,
    args,
    isString(toolCallId) ? { toolCallId } : {}
  );
}

const runSubtask: CapabilityExport = {
  spec: runSubtaskSpec,
  impl: async (run, args) => {
    const { RunSubtaskTool } = await import("../tools/run-subtask-tool.js");
    const tool = new RunSubtaskTool(subAgentRuntime(run, "run_subtask"));
    return runSubAgentTool(tool, run, args);
  }
};

const runSearch: CapabilityExport = {
  spec: runSearchSpec,
  impl: async (run, args) => {
    const { RunSearchTool } = await import("../tools/run-search-tool.js");
    const tool = new RunSearchTool(subAgentRuntime(run, "run_search"));
    return runSubAgentTool(tool, run, args);
  }
};

const startSubtask: CapabilityExport = {
  spec: startSubtaskSpec,
  impl: async (run, args) => {
    const { StartSubtaskTool } = await import("../tools/start-subtask-tool.js");
    const tool = new StartSubtaskTool(subAgentRuntime(run, "start_subtask"));
    return runSubAgentTool(tool, run, args);
  }
};

const waitSubtasks: CapabilityExport = {
  spec: waitSubtasksSpec,
  impl: async (run, args) => {
    const { WaitSubtasksTool } = await import("../tools/wait-subtasks-tool.js");
    const runtime = subAgentRuntime(run, "wait_subtasks");
    return Tool.executeTool(
      new WaitSubtasksTool({ background: runtime.background }),
      run.context,
      args
    );
  }
};

/**
 * Plan an objective without running any of it.
 *
 * This is what the chat's **plan mode** reaches for: every mutating capability
 * is blocked there, so a multi-step request used to come back as prose the
 * user had to read and re-derive. `TaskPlanner` already produces the structured
 * thing — a DAG of tasks and steps, with the independent ones visible as
 * such — and the chat already renders the `planning_update` / `task_update`
 * events it streams. Nothing here executes the plan: `planMultiTask` returns
 * one, and the turn ends with it on screen.
 *
 * The planner sees the parent's toolbelt so it can route steps to real tool
 * names, minus this capability itself — a plan whose step says "call
 * create_plan" is a loop, not a plan.
 */
const createPlan: CapabilityExport = {
  spec: createPlanSpec,
  impl: async (run, args) => {
    const runtime = subAgentRuntime(run, "create_plan");
    const objective = isString(args["objective"]) ? args["objective"].trim() : "";
    if (!objective) {
      return {
        error: "invalid_objective",
        message: "`create_plan` needs a non-empty `objective`."
      };
    }

    const { TaskPlanner } = await import("../task-planner.js");
    const planner = new TaskPlanner({
      provider: runtime.provider,
      model: runtime.model,
      tools: runtime.parentTools().filter((t) => t.name !== createPlanSpec.name),
      ...(run.context.signal ? { signal: run.context.signal } : {})
    });

    const generator = planner.planMultiTask(objective, run.context);
    let next = await generator.next();
    while (!next.done) {
      // The plan is the deliverable, so it goes to the user as it is built
      // rather than being summarized back by the model afterwards.
      await runtime.forwardMessage(next.value);
      next = await generator.next();
    }
    const plan = next.value;

    if (!plan) {
      return {
        error: "plan_failed",
        message:
          "The planner did not commit a plan. The objective may be too vague to decompose — restate it with the concrete outcome and try again."
      };
    }

    return {
      title: plan.title,
      tasks: plan.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        depends_on: task.dependsOn ?? [],
        steps: task.steps.map((step) => ({
          id: step.id,
          instructions: step.instructions,
          depends_on: step.dependsOn
        }))
      })),
      // What a reader of the plan wants to know first, and what the model
      // should not have to count for itself.
      task_count: plan.tasks.length,
      step_count: plan.tasks.reduce((n, t) => n + t.steps.length, 0),
      parallelizable: plan.tasks.filter((t) => (t.dependsOn?.length ?? 0) === 0)
        .length,
      executed: false
    };
  }
};

/** Every delegation capability. */
export const AGENT_CAPABILITIES: readonly CapabilityExport[] = [
  runSubtask,
  runSearch,
  startSubtask,
  waitSubtasks,
  createPlan
];

export const module: CapabilityModule = {
  module: "agents",
  exports: AGENT_CAPABILITIES
};

export { runSubtask, runSearch, startSubtask, waitSubtasks, createPlan };
