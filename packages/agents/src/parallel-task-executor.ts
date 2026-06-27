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

      // Create task executors — each task runs as its own sub-agent
      const taskGenerators = executableTasks.map((task) => {
        return this.executeTask(task);
      });

      if (taskGenerators.length > 1) {
        // Execute all tasks concurrently, merging yielded messages
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
    // Mark task as started
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
   * Check if all tasks have been completed.
   */
  private allTasksComplete(): boolean {
    return this.taskPlan.tasks.every((task) => task.completed);
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

  await Promise.allSettled(tasks);

  if (hasError) {
    throw firstError instanceof Error
      ? firstError
      : new Error(String(firstError));
  }
}
