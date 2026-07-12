/**
 * ParallelTaskExecutor -- orchestrates parallel execution of a multi-task plan.
 *
 * Each task in the plan runs as an independent sub-agent via TaskExecutor.
 * Tasks form a DAG via their `dependsOn` arrays. Independent tasks
 * (those with no unmet dependencies) run concurrently.
 *
 * Flow:
 *   TaskPlan (multiple Tasks) → ParallelTaskExecutor
 *     → finds tasks with satisfied dependencies
 *     → runs them concurrently, each via TaskExecutor
 *     → stores results in shared context
 *     → repeats until all tasks complete
 */

import type { BaseProvider } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { memoryKeys } from "@nodetool-ai/runtime";
import { createLogger } from "@nodetool-ai/config";
import type {
  ProcessingMessage,
  Chunk,
  StepResult,
  LogUpdate,
  TaskUpdate
} from "@nodetool-ai/protocol";
import { TaskUpdateEvent } from "@nodetool-ai/protocol";
import { TaskExecutor } from "./task-executor.js";
import type { Tool } from "./tools/base-tool.js";
import type { Task, TaskPlan } from "./types.js";
import type { Checkpoint, CheckpointStore } from "./checkpoint-store.js";
import { hashPlanKey } from "./checkpoint-store.js";

const log = createLogger("nodetool.agents.parallel-task-executor");

const DEFAULT_MAX_TASK_ITERATIONS = 100;
const DEFAULT_MAX_STEP_ITERATIONS = 10;

export interface ParallelTaskExecutorOptions {
  provider: BaseProvider;
  model: string;
  context: ProcessingContext;
  tools: Tool[];
  taskPlan: TaskPlan;
  systemPrompt?: string;
  inputs?: Record<string, unknown>;
  /** Maximum total iteration count across all tasks. */
  maxIterations?: number;
  /** Maximum iterations per step within a task. */
  maxStepIterations?: number;
  /**
   * Opt-in checkpoint store. When supplied with a {@link runId}, the executor
   * loads any checkpoint whose `planHash` matches this plan, marks its
   * completed tasks as done (seeding their results into memory), and resumes
   * from the remaining tasks. After each task completes it persists an updated
   * checkpoint. Omit to keep the original behavior (no resume, no persistence).
   */
  checkpointStore?: CheckpointStore;
  /** Run identifier the checkpoint is keyed by. Required for checkpointing. */
  runId?: string;
  /**
   * Tool names used to compute this plan's hash for checkpoint matching. When
   * omitted, the hash is derived from the executor's own tool array. Pass the
   * planning tool set when it differs from the execution tool set so the hash
   * lines up with the plan cache key.
   */
  planTools?: string[];
}

export class ParallelTaskExecutor {
  private readonly provider: BaseProvider;
  private readonly model: string;
  private readonly tools: Tool[];
  private readonly taskPlan: TaskPlan;
  private readonly context: ProcessingContext;
  private readonly inputs: Record<string, unknown>;
  private readonly systemPrompt: string | undefined;
  private readonly maxIterations: number;
  private readonly maxStepIterations: number;
  private readonly checkpointStore?: CheckpointStore;
  private readonly runId?: string;
  private readonly planTools?: string[];
  /**
   * IDs of tasks that ran but did not genuinely succeed (budget exhausted,
   * unsatisfiable dependency, or an error result). Tracked separately from
   * `task.completed` so a failed task is never checkpointed as success nor
   * counted as a satisfied dependency, while still terminating the scheduler
   * loop instead of being re-dispatched forever.
   */
  private readonly failedTaskIds = new Set<string>();

  constructor(opts: ParallelTaskExecutorOptions) {
    this.provider = opts.provider;
    this.model = opts.model;
    this.tools = opts.tools;
    this.taskPlan = opts.taskPlan;
    this.context = opts.context;
    this.inputs = opts.inputs ?? {};
    this.systemPrompt = opts.systemPrompt;
    this.maxIterations = opts.maxIterations ?? DEFAULT_MAX_TASK_ITERATIONS;
    this.maxStepIterations =
      opts.maxStepIterations ?? DEFAULT_MAX_STEP_ITERATIONS;
    this.checkpointStore = opts.checkpointStore;
    this.runId = opts.runId;
    this.planTools = opts.planTools;
  }

  /**
   * Stable hash for this plan, used to match a saved checkpoint to the current
   * plan. Built from the plan title + task IDs + the tool names so a checkpoint
   * never resumes a structurally different plan. Reuses {@link hashPlanKey}.
   */
  private planHash(): string {
    const toolNames = this.planTools ?? this.tools.map((t) => t.name);
    return hashPlanKey({
      objective: `${this.taskPlan.title}\n${this.taskPlan.tasks
        .map((t) => t.id)
        .join(",")}`,
      tools: toolNames
    });
  }

  /** Persist the current execution progress under {@link runId} (idempotent). */
  private persistCheckpoint(planHash: string = this.planHash()): void {
    if (!this.checkpointStore || !this.runId) return;
    const completedTaskIds = this.taskPlan.tasks
      .filter((t) => t.completed)
      .map((t) => t.id);
    const taskResults: Record<string, unknown> = {};
    for (const id of completedTaskIds) {
      const value = this.context.memory.getValue(memoryKeys.task(id));
      if (value !== undefined) taskResults[id] = value;
    }
    const checkpoint: Checkpoint = { planHash, completedTaskIds, taskResults };
    this.checkpointStore.save(this.runId, checkpoint);
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

    // Checkpoint resume (opt-in): a matching saved checkpoint marks already-done
    // tasks as complete and seeds their results so they are skipped below and
    // their outputs remain available to dependents.
    const planHash = this.checkpointStore && this.runId ? this.planHash() : "";
    if (this.checkpointStore && this.runId) {
      const checkpoint = this.checkpointStore.load(this.runId);
      if (checkpoint && checkpoint.planHash === planHash) {
        const completed = new Set(checkpoint.completedTaskIds);
        let resumed = 0;
        for (const task of this.taskPlan.tasks) {
          if (!completed.has(task.id)) continue;
          task.completed = true;
          resumed++;
          const result = checkpoint.taskResults?.[task.id];
          if (
            result !== undefined &&
            !this.context.memory.has(memoryKeys.task(task.id))
          ) {
            this.context.memory.set({
              key: memoryKeys.task(task.id),
              kind: "task_result",
              value: result,
              source: task.id,
              title: task.title,
              description: task.description
            });
          }
        }
        if (resumed > 0) {
          log.info("Resumed from checkpoint", {
            runId: this.runId,
            resumedTasks: resumed
          });
          yield {
            type: "log_update",
            node_id: "parallel_task_executor",
            node_name: "ParallelTaskExecutor",
            content: `Resuming from checkpoint: ${resumed} task(s) already complete.`,
            severity: "info"
          } satisfies LogUpdate;
        }
      }
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

    let iterations = 0;

    while (!this.allTasksComplete() && iterations < this.maxIterations) {
      iterations++;

      const executableTasks = this.getExecutableTasks();

      if (executableTasks.length === 0) {
        if (!this.allTasksComplete()) {
          yield {
            type: "chunk",
            content:
              "\nNo executable tasks but not all complete. Possible dependency issues.\n",
            done: false
          } satisfies Chunk;
        }
        break;
      }

      const taskIds = executableTasks.map((t) => t.id);
      log.debug("Dispatching parallel tasks", { taskIds });

      yield {
        type: "log_update",
        node_id: "parallel_task_executor",
        node_name: "ParallelTaskExecutor",
        content: `Running ${executableTasks.length} task(s) in parallel: ${taskIds.join(", ")}`,
        severity: "info"
      } satisfies LogUpdate;

      const taskGenerators = executableTasks.map((task) => {
        return this.executeTask(task);
      });

      if (taskGenerators.length > 1) {
        yield* mergeAsyncGenerators(taskGenerators);
      } else {
        // Single task — no need for merge overhead
        for await (const message of taskGenerators[0]) {
          yield message;
        }
      }
    }

    if (iterations >= this.maxIterations) {
      log.warn("Max iterations reached", {
        iterations,
        completedTasks: this.taskPlan.tasks.filter((t) => t.completed).length,
        totalTasks
      });
    }

    log.info("Parallel task execution completed", {
      title: this.taskPlan.title,
      completedTasks: this.taskPlan.tasks.filter((t) => t.completed).length,
      totalTasks
    });
  }

  /**
   * Execute a single task as an independent sub-agent.
   * Injects dependency results into the task's context before execution.
   */
  private async *executeTask(task: Task): AsyncGenerator<ProcessingMessage> {
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
      } as TaskUpdate["task"]
    } satisfies TaskUpdate;

    // Create TaskExecutor for this task's steps. Each step discovers
    // upstream context on demand via the `memory_list` / `memory_read` tools
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
      maxSteps: task.steps.length + 5, // Allow some slack
      maxStepIterations: this.maxStepIterations,
      parallelExecution: true, // Enable parallel step execution within each task
      upstreamMemoryKeys
    });

    let taskResult: unknown = null;

    for await (const item of executor.executeTasks()) {
      if (item.type === "step_result") {
        const stepResult = item as StepResult;
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
    // (StepExecutor writes an `{ error }` result and emits an error
    // step_result rather than raising). Decide whether the task actually
    // succeeded before recording it as complete or checkpointing it.
    const failureReason = this.detectTaskFailure(task, taskResult);
    if (failureReason) {
      this.failedTaskIds.add(task.id);
      log.warn("Task failed", {
        taskId: task.id,
        title: task.title,
        reason: failureReason
      });
      yield {
        type: "log_update",
        node_id: "parallel_task_executor",
        node_name: "ParallelTaskExecutor",
        content: `Task "${task.title}" (${task.id}) failed: ${failureReason}`,
        severity: "error"
      } satisfies LogUpdate;
      // Emit a terminal task_update so lifecycle consumers (ExecutionTree, chat
      // UI) resolve the task instead of leaving its spinner running forever.
      // The success path yields TaskCompleted; the failure path must yield a
      // terminal event too — mirror StepExecutor's StepFailed emission.
      yield {
        type: "task_update",
        event: TaskUpdateEvent.TaskFailed,
        task: {
          id: task.id,
          title: task.title,
          error: failureReason
        } as TaskUpdate["task"]
      } satisfies TaskUpdate;
      return;
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

    // Persist progress so a re-run resumes past this task (no-op without a
    // checkpoint store + runId).
    this.persistCheckpoint();

    yield {
      type: "task_update",
      event: TaskUpdateEvent.TaskCompleted,
      task: {
        id: task.id,
        title: task.title,
        result: taskResult
      } as TaskUpdate["task"]
    } satisfies TaskUpdate;

    log.info("Task completed", {
      taskId: task.id,
      title: task.title
    });
  }

  /**
   * Decide whether a task that just returned actually failed. Detects:
   *  - steps that never completed (round/step budget exhausted, or an
   *    unsatisfiable dependency left executable steps at zero), and
   *  - steps (or the resolved task result) whose value is an `{ error }`
   *    payload written by StepExecutor's failure path.
   * Returns a human-readable reason on failure, or `null` on success.
   */
  private detectTaskFailure(task: Task, taskResult: unknown): string | null {
    const incomplete = task.steps.filter((s) => !s.completed);
    if (incomplete.length > 0) {
      return `${incomplete.length} of ${task.steps.length} step(s) did not complete (budget exhausted or unsatisfiable dependency)`;
    }
    for (const step of task.steps) {
      const value = this.context.memory.getValue(memoryKeys.step(step.id));
      if (isErrorResult(value)) {
        return `step ${step.id}: ${value.error}`;
      }
      // A process-mode (fan-out) step always stores an array of per-item
      // results and is always marked completed, even when every item failed
      // (each item is an `{ error }` object). isErrorResult returns false for
      // arrays, so an all-failed fan-out would otherwise be recorded as a
      // success and checkpointed, never retried. Treat a non-empty array whose
      // every element is an error result as a failed step.
      if (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((item) => isErrorResult(item))
      ) {
        const first = value.find((item) => isErrorResult(item)) as {
          error: string;
        };
        return `step ${step.id}: all ${value.length} fan-out item(s) failed (${first.error})`;
      }
    }
    if (isErrorResult(taskResult)) {
      return taskResult.error;
    }
    return null;
  }

  /**
   * Check if the scheduler is done: every task has either completed
   * successfully or been recorded as failed. A failed task blocks its
   * dependents (their deps are never satisfied), so those remain pending and
   * the scheduler exits via the "no executable tasks" path rather than
   * spinning until the iteration cap.
   */
  private allTasksComplete(): boolean {
    return this.taskPlan.tasks.every(
      (task) => task.completed || this.failedTaskIds.has(task.id)
    );
  }

  /**
   * Find tasks whose dependencies are all satisfied.
   */
  private getExecutableTasks(): Task[] {
    const completedIds = new Set(
      this.taskPlan.tasks
        .filter((t) => t.completed)
        .map((t) => t.id)
    );
    // Input keys also count as satisfied dependencies
    for (const key of Object.keys(this.inputs)) {
      completedIds.add(key);
    }

    return this.taskPlan.tasks.filter(
      (task) =>
        !task.completed &&
        !this.failedTaskIds.has(task.id) &&
        (task.dependsOn ?? []).every((dep) => completedIds.has(dep))
    );
  }

  /** Get the result of a specific task from shared memory. */
  getTaskResult(taskId: string): unknown {
    return this.context.memory.getValue(memoryKeys.task(taskId));
  }

  /** Get all task results recorded in shared memory. */
  getAllResults(): Record<string, unknown> {
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
  getFinalResult(): unknown {
    if (this.taskPlan.tasks.length === 0) return null;
    const lastTask = this.taskPlan.tasks[this.taskPlan.tasks.length - 1];
    return this.context.memory.getValue(memoryKeys.task(lastTask.id)) ?? null;
  }
}

/**
 * A value is treated as a failure marker when it is a plain object carrying a
 * non-empty string `error` field — the shape StepExecutor writes on its failure
 * path (`{ error: "Step failed: ..." }`).
 */
function isErrorResult(value: unknown): value is { error: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).error === "string" &&
    ((value as Record<string, unknown>).error as string).length > 0
  );
}

// ---------------------------------------------------------------------------
// Async generator merge utility
// ---------------------------------------------------------------------------

async function* mergeAsyncGenerators<T>(
  generators: AsyncGenerator<T>[]
): AsyncGenerator<T> {
  const queue: T[] = [];
  let activeCount = generators.length;
  let resolve: (() => void) | null = null;
  let firstError: unknown = undefined;
  let hasError = false;

  function notify() {
    if (resolve) {
      const r = resolve;
      resolve = null;
      r();
    }
  }

  const tasks = generators.map(async (gen) => {
    try {
      for await (const item of gen) {
        queue.push(item);
        notify();
      }
    } catch (e) {
      if (!hasError) {
        hasError = true;
        firstError = e;
      }
    } finally {
      activeCount--;
      notify();
    }
  });

  // The try/finally guarantees that if the downstream consumer stops early
  // (its `for await` breaks or throws, injecting `.return()` into this merge
  // generator), we terminate the child generators instead of leaving the
  // producer tasks driving them to completion in the background (e.g. LLM
  // calls firing after cancellation).
  try {
    while (activeCount > 0 || queue.length > 0) {
      if (queue.length > 0) {
        yield queue.shift()!;
      } else if (activeCount > 0) {
        const waitPromise = new Promise<void>((r) => {
          resolve = r;
        });
        if (queue.length > 0) {
          resolve = null;
          continue;
        }
        await waitPromise;
      }
    }
  } finally {
    // Stop every child generator so its producer `for await` loop terminates
    // (a generator may already be done — allSettled swallows those). Then wait
    // for all producer promises to settle before returning.
    await Promise.allSettled(generators.map((gen) => gen.return(undefined)));
    await Promise.allSettled(tasks);
  }

  if (hasError) {
    throw firstError instanceof Error
      ? firstError
      : new Error(String(firstError));
  }
}
