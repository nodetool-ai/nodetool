/**
 * The `agents` capability module — delegation to a child agent loop, and the
 * chat's plan mode.
 *
 * Four delegation capabilities: `run_subtask` (blocking), `run_search`
 * (read-only child), `start_subtask` (background spawn) and `wait_subtasks`
 * (collect). Two plan capabilities: `create_plan` builds a task DAG and runs
 * none of it, `execute_plan` takes that DAG back and runs it.
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
 * The delegation capabilities are classified `read`: the call itself has no
 * side effects, and the child's own tools are gated in the child loop. So is
 * `create_plan`, which is what keeps it callable in plan mode. `execute_plan`
 * is `external` — it is the one call here that acts.
 *
 * Design: docs/tool-class-retirement-design.md § "PRs 4–9 — remaining
 * namespaces" (`/agents`).
 */

import type { JsonSchema } from "@nodetool-ai/runtime";
import { budgetFromContext } from "@nodetool-ai/runtime";
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
  executePlanSpec,
  RUN_SUBTASK_DESCRIPTION,
  RUN_SUBTASK_SCHEMA,
  RUN_SEARCH_SCHEMA
} from "./agents.specs.js";
import {
  isNonEmptyString,
  isObjectLike,
  isString
} from "../utils/type-guards.js";

export {
  RUN_SUBTASK_DESCRIPTION,
  RUN_SUBTASK_SCHEMA,
  RUN_SEARCH_SCHEMA
} from "./agents.specs.js";

/**
 * The sub-agent runtime this run carries, or an error naming what is missing.
 * A headless run (an eval, an MCP mount, a CLI invocation with no forwarder)
 * has no runtime, and no child loop can be spawned without one.
 *
 * Every delegation capability goes through here, so this is also where the
 * run's budget joins the runtime: a host that put one on the `CapabilityRun`
 * (or on the context) has it reach `run_subtask`, `run_search`,
 * `start_subtask` and `execute_plan` without naming it six times.
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
  if (runtime.budget) return runtime;
  const budget = run.budget ?? budgetFromContext(run.context);
  return budget ? { ...runtime, budget } : runtime;
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
      signal: run.context.signal
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

/** What one task of an executed plan ended up as. */
interface ExecutedTask {
  id: string;
  title: string;
  status: "completed" | "failed";
  error?: string;
}

/** A rejected plan, shaped so the model can fix the offending task. */
function invalidPlan(issues: string[]): Record<string, unknown> {
  return {
    error: "invalid_plan",
    issues,
    message: `The plan cannot run as given. ${issues.join(" ")}`,
    executed: false
  };
}

/**
 * Run a plan the user has already seen.
 *
 * The other half of plan mode. `create_plan` produces a DAG and stops; this
 * takes that DAG back — inline, as the object the user watched arrive — and
 * hands it to `ParallelTaskExecutor`, the same machinery `Agent` runs a plan
 * on. Passing the plan itself rather than an id is what makes it survive the
 * mode switch with no store behind it, keeps what runs identical to what is
 * on screen, and lets "drop task 3" be expressible.
 *
 * The plan is checked before anything runs, by `PlanBuilder` — the same rules
 * that governed the plan when the planner built it, so a plan that came out of
 * `create_plan` unedited cannot be rejected here.
 *
 * The executor's own messages are forwarded verbatim: the `task_update` events
 * are what the thread and the sidebar render, and re-summarizing them into a
 * final blob would leave the user watching nothing until the end. The call
 * returns how each task settled plus its result; the step results also stay in
 * shared memory under `task:<id>`, which the description points at.
 */
const executePlan: CapabilityExport = {
  spec: executePlanSpec,
  impl: async (run, args) => {
    const runtime = subAgentRuntime(run, "execute_plan");

    const rawTasks = args["tasks"];
    if (!Array.isArray(rawTasks)) {
      return invalidPlan([
        "`execute_plan` needs a `tasks` array — pass the plan `create_plan` returned, verbatim."
      ]);
    }
    const shapeIssues: string[] = [];
    const taskObjects: Record<string, unknown>[] = [];
    rawTasks.forEach((raw, index) => {
      if (!isObjectLike(raw)) {
        shapeIssues.push(`Task #${index + 1} is not an object.`);
        return;
      }
      const task = raw as Record<string, unknown>;
      if (!isNonEmptyString(task["id"])) {
        shapeIssues.push(`Task #${index + 1} has no \`id\`.`);
      }
      taskObjects.push(task);
    });
    if (shapeIssues.length > 0) return invalidPlan(shapeIssues);

    const title = isString(args["title"]) ? args["title"].trim() : "";
    const { buildPlanFromTasks } = await import(
      "../tools/plan-builder-tools.js"
    );
    const built = buildPlanFromTasks(title || "Plan", taskObjects);
    if (!built.ok) return invalidPlan(built.errors);
    const plan = built.plan;

    const { ParallelTaskExecutor } = await import(
      "../parallel-task-executor.js"
    );
    const { TaskUpdateEvent } = await import("@nodetool-ai/protocol");
    const { memoryKeys } = await import("@nodetool-ai/runtime");

    const executor = new ParallelTaskExecutor({
      provider: runtime.provider,
      model: runtime.model,
      context: run.context,
      // Every step gets the parent belt, minus the two plan capabilities: a
      // step that re-plans or re-runs the plan it is part of is a loop.
      tools: runtime
        .parentTools()
        .filter(
          (t) =>
            t.name !== executePlanSpec.name && t.name !== createPlanSpec.name
        ),
      taskPlan: plan,
      // The run's budget and the parent's per-step iteration cap: every step
      // this plan runs is a loop of the same run, so it reserves against the
      // same cap and gets the same bound as a `run_subtask` child would.
      budget: runtime.budget,
      maxStepIterations: runtime.maxIterations,
      // The thread's own signal: cancelling the turn cancels every task.
      signal: run.context.signal
    });

    // The executor reports a task's failure reason only through the terminal
    // `task_update` it emits, so read it off the stream on the way past.
    const failureReasons = new Map<string, string>();
    for await (const message of executor.execute()) {
      if (
        message.type === "task_update" &&
        message.event === TaskUpdateEvent.TaskFailed &&
        isNonEmptyString(message.task.id)
      ) {
        failureReasons.set(
          message.task.id,
          isNonEmptyString(message.task.error)
            ? message.task.error
            : "unknown error"
        );
      }
      await runtime.forwardMessage(message);
    }

    const failed = new Set(executor.getFailedTaskIds());
    const results: Record<string, unknown> = {};
    const tasks: ExecutedTask[] = plan.tasks.map((task) => {
      if (failed.has(task.id)) {
        return {
          id: task.id,
          title: task.title,
          status: "failed",
          error: failureReasons.get(task.id) ?? "unknown error"
        };
      }
      const value = run.context.memory.getValue(memoryKeys.task(task.id));
      if (value !== undefined) results[task.id] = value;
      return { id: task.id, title: task.title, status: "completed" };
    });

    return {
      title: plan.title,
      executed: true,
      task_count: tasks.length,
      completed_count: tasks.filter((t) => t.status === "completed").length,
      failed_count: tasks.filter((t) => t.status === "failed").length,
      tasks,
      results
    };
  }
};

/** Every capability this module declares. */
export const AGENT_CAPABILITIES: readonly CapabilityExport[] = [
  runSubtask,
  runSearch,
  startSubtask,
  waitSubtasks,
  createPlan,
  executePlan
];

export const module: CapabilityModule = {
  module: "agents",
  exports: AGENT_CAPABILITIES
};

export {
  runSubtask,
  runSearch,
  startSubtask,
  waitSubtasks,
  createPlan,
  executePlan
};
