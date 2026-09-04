/**
 * ParallelTaskExecutor -- orchestrates parallel execution of a multi-task plan.
 *
 * Each task in the plan runs as an independent sub-agent via TaskExecutor.
 * Tasks form a DAG via their `dependsOn` arrays, handed to {@link scheduleDag}:
 * a task starts the moment its last dependency settles, and its results reach
 * shared memory before its dependents are released. Nothing counts dispatch
 * rounds — the run budget and the permit pool bound the work.
 */

import type {
  BaseProvider,
  ProcessingContext,
  RunBudget
} from "@nodetool-ai/runtime";
import {
  budgetFromContext,
  createSemaphore,
  memoryKeys
} from "@nodetool-ai/runtime";
import { createLogger } from "@nodetool-ai/config";
import type {
  ProcessingMessage,
  LogUpdate,
  TaskUpdate
} from "@nodetool-ai/protocol";
import { TaskUpdateEvent } from "@nodetool-ai/protocol";
import { TaskExecutor } from "./task-executor.js";
import { settleResultValue } from "./subagent.js";
import {
  ABORTED,
  UNSATISFIABLE_DEPENDENCY,
  scheduleDag,
  type DagNode,
  type DagOutcome,
  type DagRunResult
} from "./utils/dag-scheduler.js";
import {
  DEFAULT_MAX_CONCURRENT_AGENTS,
  DEFAULT_MAX_STEP_ITERATIONS
} from "./constants.js";
import type { Tool } from "./tools/base-tool.js";
import type { Task, TaskPlan } from "./types.js";

const log = createLogger("nodetool.agents.parallel-task-executor");

/** One task, as the scheduler sees it. */
interface TaskNode extends DagNode {
  task: Task;
}

export interface ParallelTaskExecutorOptions {
  provider: BaseProvider;
  model: string;
  context: ProcessingContext;
  tools: Tool[];
  taskPlan: TaskPlan;
  systemPrompt?: string;
  inputs?: Record<string, unknown>;
  /** Maximum iterations per step within a task. */
  maxStepIterations?: number;
  /** Concurrent task and step executions. Defaults to the shared agent policy. */
  maxConcurrentAgents?: number;
  /** Cap on output tokens per step turn. Forwarded to each TaskExecutor. */
  maxTokens?: number;
  /**
   * The run's budget, forwarded to every task and through it to every step,
   * whose provider conversations draw on its permit pool. Omitted, the budget
   * on {@link context} is used.
   */
  budget?: RunBudget;
  /** External cancellation, forwarded to every task and step executor. */
  signal?: AbortSignal;
  /** Sandbox package specifiers the session consents to, forwarded per task. */
  sandboxPackages?: readonly string[];
}

export class ParallelTaskExecutor {
  private readonly provider: BaseProvider;
  private readonly model: string;
  private readonly tools: Tool[];
  private readonly taskPlan: TaskPlan;
  private readonly context: ProcessingContext;
  private readonly inputs: Record<string, unknown>;
  private readonly systemPrompt: string | undefined;
  private readonly maxStepIterations: number;
  private readonly maxConcurrentAgents: number;
  private readonly maxTokens?: number;
  private readonly budget?: RunBudget;
  private readonly signal?: AbortSignal;
  private readonly sandboxPackages: readonly string[];
  /**
   * IDs of tasks that did not genuinely succeed — a failed step, an
   * unsatisfiable dependency, or an `{ error }` result. Tracked apart from
   * `task.completed` so a failed task is never recorded as a success nor
   * counted as a satisfied dependency.
   */
  private readonly failedTaskIds = new Set<string>();
  /** Why a task that actually ran failed, read by {@link settleTask}. */
  private readonly failureReasons = new Map<string, string>();
  /** What a task that actually ran produced, read by {@link settleTask}. */
  private readonly taskResults = new Map<string, unknown>();

  constructor(opts: ParallelTaskExecutorOptions) {
    this.provider = opts.provider;
    this.model = opts.model;
    this.tools = opts.tools;
    this.taskPlan = opts.taskPlan;
    this.context = opts.context;
    this.inputs = opts.inputs ?? {};
    this.systemPrompt = opts.systemPrompt;
    this.maxStepIterations =
      opts.maxStepIterations ?? DEFAULT_MAX_STEP_ITERATIONS;
    this.maxConcurrentAgents =
      opts.maxConcurrentAgents ?? DEFAULT_MAX_CONCURRENT_AGENTS;
    this.maxTokens = opts.maxTokens;
    this.budget = opts.budget ?? budgetFromContext(opts.context);
    this.signal = opts.signal;
    this.sandboxPackages = opts.sandboxPackages ?? [];
  }

  /**
   * Execute all tasks in the plan, respecting inter-task dependencies.
   * Independent tasks run concurrently as separate sub-agents.
   */
  async *execute(): AsyncGenerator<ProcessingMessage> {
    // Seed inputs into shared agent memory so every task and step sees them.
    for (const [key, value] of Object.entries(this.inputs)) {
      this.context.memory.set({
        key: memoryKeys.input(key),
        kind: "input",
        value,
        title: key
      });
    }

    const totalTasks = this.taskPlan.tasks.length;
    log.info("Parallel task execution started", {
      title: this.taskPlan.title,
      tasks: totalTasks
    });

    yield {
      type: "log_update",
      node_id: "parallel_task_executor",
      node_name: "ParallelTaskExecutor",
      content: `Starting parallel execution of ${totalTasks} tasks...`,
      severity: "info"
    } satisfies LogUpdate;

    const nodes = this.taskNodes();
    yield* scheduleDag<TaskNode, ProcessingMessage>({
      nodes,
      // A task opens no provider conversation of its own — its steps do, and
      // they draw on the run's pool inside `TaskExecutor`. A task holding a
      // run permit for its whole length while its steps queued for more is
      // what deadlocked nested layers, so this bound is numeric only.
      concurrency: createSemaphore(this.maxConcurrentAgents),
      maxConcurrent: this.maxConcurrentAgents,
      signal: this.signal,
      run: (node) => this.runTask(node.task),
      settle: (node, outcome, error) =>
        this.settleTask(node.task, outcome, error),
      onBlocked: (node, by) =>
        this.blockTaskEvents(
          node.task,
          this.signal?.aborted
            ? "Task aborted"
            : `Task blocked: dependency ${by.id} failed`
        )
    });

    log.info("Parallel task execution completed", {
      title: this.taskPlan.title,
      completedTasks: this.taskPlan.tasks.filter((t) => t.completed).length,
      totalTasks
    });
  }

  /**
   * The tasks the scheduler runs, with the dependencies each waits on.
   *
   * A task already completed before the plan starts is not a node, and counts
   * as a satisfied dependency for the rest; so does an input key. A dependency
   * naming neither is left in place, so the task never becomes ready and the
   * scheduler settles it with `unsatisfiable dependency`.
   */
  private taskNodes(): TaskNode[] {
    const satisfied = new Set<string>(Object.keys(this.inputs));
    for (const task of this.taskPlan.tasks) {
      if (task.completed) satisfied.add(task.id);
    }
    return this.taskPlan.tasks
      .filter((task) => !task.completed && !this.failedTaskIds.has(task.id))
      .map((task) => ({
        id: task.id,
        dependsOn: (task.dependsOn ?? []).filter((dep) => !satisfied.has(dep)),
        task
      }));
  }

  /**
   * Execute a single task as an independent sub-agent, and report how it
   * settled. Its terminal `task_update` is {@link settleTask}'s to emit: the
   * scheduler releases this task's dependents only after that runs, so a
   * dependent's first event cannot land before its dependency's last one.
   */
  private async *runTask(
    task: Task
  ): AsyncGenerator<ProcessingMessage, DagRunResult> {
    task.completed = false;

    yield {
      type: "task_update",
      event: TaskUpdateEvent.TaskCreated,
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        steps: task.steps.map((s) => ({
          id: s.id,
          instructions: s.instructions,
          completed: s.completed
        }))
      }
    } satisfies TaskUpdate;

    // Create TaskExecutor for this task's steps. Each step discovers
    // upstream context on demand via the `list_shared` / `read_shared` tools
    // (progressive disclosure). The task's declared `dependsOn` IDs are
    // forwarded as `upstreamMemoryKeys` so every step's user message names
    // them explicitly without dumping their values.
    const upstreamMemoryKeys = (task.dependsOn ?? []).map((id) =>
      memoryKeys.task(id)
    );
    const executor = new TaskExecutor({
      provider: this.provider,
      model: this.model,
      context: this.context,
      tools: [...this.tools],
      task,
      systemPrompt: this.systemPrompt,
      inputs: this.inputs,
      maxStepIterations: this.maxStepIterations,
      maxTokens: this.maxTokens,
      maxConcurrentAgents: this.maxConcurrentAgents,
      budget: this.budget,
      upstreamMemoryKeys,
      signal: this.signal,
      sandboxPackages: this.sandboxPackages
    });

    let taskResult: unknown = null;

    for await (const item of executor.executeTasks()) {
      if (item.type === "step_result") {
        const stepResult = item;
        if (stepResult.is_task_result) {
          taskResult = stepResult.result;
        }
      }
      yield item;
    }

    // Resolve the task result. StepExecutor already wrote a `task:<id>` entry
    // for finish-task steps; if not, fall back to the last step's result.
    if (taskResult === null || taskResult === undefined) {
      const lastStep = task.steps[task.steps.length - 1];
      if (lastStep) {
        const lastResult = this.context.memory.getValue(
          memoryKeys.step(lastStep.id)
        );
        if (lastResult !== undefined) {
          taskResult = lastResult;
        }
      }
    }

    // A TaskExecutor returns without throwing even when its steps failed
    // (a step writes an `{ error }` result and emits an error step_result
    // rather than raising). Decide whether the task actually succeeded before
    // recording it as complete.
    const failureReason = this.detectTaskFailure(task, taskResult);
    if (failureReason) {
      this.failedTaskIds.add(task.id);
      this.failureReasons.set(task.id, failureReason);
      log.warn("Task failed", {
        taskId: task.id,
        title: task.title,
        reason: failureReason
      });
      return { outcome: "failed", error: failureReason };
    }

    if (taskResult !== null && taskResult !== undefined) {
      // Idempotent: only write if StepExecutor didn't already persist it.
      if (!this.context.memory.has(memoryKeys.task(task.id))) {
        this.context.memory.set({
          key: memoryKeys.task(task.id),
          kind: "task_result",
          value: taskResult,
          source: task.id,
          title: task.title,
          description: task.description
        });
      }
    }

    task.completed = true;
    this.taskResults.set(task.id, taskResult);
    return { outcome: "ok" };
  }

  /**
   * Terminal events for a settled task: the `task_update` every lifecycle
   * consumer resolves the task on, plus an error log when it failed.
   *
   * A task that never ran — blocked by a dependency that can never be
   * satisfied, or cut short by the run's signal — is recorded as failed here
   * rather than left looking like it is still running.
   */
  private settleTask(
    task: Task,
    outcome: DagOutcome,
    reason?: string
  ): ProcessingMessage[] {
    if (outcome === "ok") {
      log.info("Task completed", { taskId: task.id, title: task.title });
      return [
        {
          type: "task_update",
          event: TaskUpdateEvent.TaskCompleted,
          task: {
            id: task.id,
            title: task.title,
            result: this.taskResults.get(task.id)
          }
        } satisfies TaskUpdate
      ];
    }

    const ran = this.failureReasons.get(task.id);
    if (ran !== undefined) {
      return [
        {
          type: "log_update",
          node_id: "parallel_task_executor",
          node_name: "ParallelTaskExecutor",
          content: `Task "${task.title}" (${task.id}) failed: ${ran}`,
          severity: "error"
        } satisfies LogUpdate,
        {
          type: "task_update",
          event: TaskUpdateEvent.TaskFailed,
          task: { id: task.id, title: task.title, error: ran }
        } satisfies TaskUpdate
      ];
    }

    if (reason === ABORTED) {
      return this.blockTaskEvents(task, "Task aborted");
    }
    const blocking = (task.dependsOn ?? []).filter((dep) =>
      this.failedTaskIds.has(dep)
    );
    return this.blockTaskEvents(
      task,
      blocking.length > 0
        ? `Task blocked: dependency ${blocking.join(", ")} failed`
        : `Task blocked: ${reason ?? UNSATISFIABLE_DEPENDENCY}`
    );
  }

  /** Record a task that never ran as failed and build its terminal events. */
  private blockTaskEvents(task: Task, message: string): ProcessingMessage[] {
    this.failedTaskIds.add(task.id);
    log.error("Task blocked", { taskId: task.id, reason: message });
    return [
      {
        type: "log_update",
        node_id: "parallel_task_executor",
        node_name: "ParallelTaskExecutor",
        content: `Task "${task.title}" (${task.id}) blocked: ${message}`,
        severity: "error"
      } satisfies LogUpdate,
      {
        type: "task_update",
        event: TaskUpdateEvent.TaskFailed,
        task: { id: task.id, title: task.title, error: message }
      } satisfies TaskUpdate
    ];
  }

  /**
   * Decide whether a task that just returned actually failed. Detects:
   *  - steps that never completed (the run budget stopped them, or a
   *    dependency could never be satisfied), and
   *  - steps (or the resolved task result) whose value settles as a failure.
   * Returns a human-readable reason on failure, or `null` on success.
   */
  private detectTaskFailure(task: Task, taskResult: unknown): string | null {
    const failed = task.steps.filter((s) => s.failed);
    if (failed.length > 0) {
      const first = failed[0];
      return `${failed.length} of ${task.steps.length} step(s) failed — ${first.id}: ${first.error ?? "unknown error"}`;
    }
    const incomplete = task.steps.filter((s) => !s.completed);
    if (incomplete.length > 0) {
      return `${incomplete.length} of ${task.steps.length} step(s) did not complete (run budget exhausted or unsatisfiable dependency)`;
    }
    // A schema'd step asked for its object shape, so a string `error` field in
    // it is data the plan requested, not the failure payload a dying step
    // writes — the same distinction `runSubAgent` draws.
    for (const step of task.steps) {
      const value = this.context.memory.getValue(memoryKeys.step(step.id));
      const settled = settleResultValue(value, {
        hasOutputSchema: Boolean(step.outputSchema)
      });
      if (settled && !settled.ok) {
        return `step ${step.id}: ${settled.error}`;
      }
    }
    const finishStep = task.steps[task.steps.length - 1];
    const settledTask = settleResultValue(taskResult, {
      hasOutputSchema: Boolean(finishStep?.outputSchema)
    });
    if (settledTask && !settledTask.ok) {
      return settledTask.error;
    }
    return null;
  }

  /** IDs of tasks that did not succeed. Empty when the whole plan succeeded. */
  getFailedTaskIds(): string[] {
    return [...this.failedTaskIds];
  }

  /** Whether any task in the plan failed or was blocked. */
  hasFailures(): boolean {
    return this.failedTaskIds.size > 0;
  }

  /** Get the result of a specific task from shared memory. */
  getTaskResult(taskId: string): unknown {
    return this.context.memory.getValue(memoryKeys.task(taskId));
  }

  /** Get all task results recorded in shared memory. */
  getAllResults() {
    const results: Record<string, unknown> = {};
    for (const entry of this.context.memory.list({ kind: "task_result" })) {
      const id = entry.source ?? entry.key.replace(/^task:/, "");
      results[id] = entry.value;
    }
    return results;
  }

  /**
   * Get the result of the final task (last task in the plan, typically the aggregator).
   */
  getFinalResult() {
    if (this.taskPlan.tasks.length === 0) return null;
    const lastTask = this.taskPlan.tasks[this.taskPlan.tasks.length - 1];
    return this.context.memory.getValue(memoryKeys.task(lastTask.id)) ?? null;
  }
}
