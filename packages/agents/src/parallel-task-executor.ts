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
import { DEFAULT_TOKEN_LIMIT } from "./constants.js";

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
  maxTokenLimit?: number;
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
  private readonly maxTokenLimit: number;

  /** Results collected per task ID. */
  private readonly taskResults = new Map<string, unknown>();

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
    this.maxTokenLimit = opts.maxTokenLimit ?? DEFAULT_TOKEN_LIMIT;
  }

  /**
   * Execute all tasks in the plan, respecting inter-task dependencies.
   * Independent tasks run concurrently as separate sub-agents.
   */
  async *execute(): AsyncGenerator<ProcessingMessage> {
    // Seed inputs into context
    for (const [key, value] of Object.entries(this.inputs)) {
      this.context.set(key, value);
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

    // Build context with dependency results
    const depContext = this.buildDependencyContext(task);

    // Build enhanced system prompt with dependency information
    const enhancedPrompt = this.buildTaskSystemPrompt(task, depContext);

    // Create TaskExecutor for this task's steps
    const executor = new TaskExecutor({
      provider: this.provider,
      model: this.model,
      context: this.context,
      tools: [...this.tools],
      task,
      systemPrompt: enhancedPrompt,
      inputs: { ...this.inputs, ...depContext },
      maxSteps: task.steps.length + 5, // Allow some slack
      maxStepIterations: this.maxStepIterations,
      maxTokenLimit: this.maxTokenLimit,
      parallelExecution: true // Enable parallel step execution within each task
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

    // Store task result in shared context and mark complete
    if (taskResult !== null && taskResult !== undefined) {
      this.taskResults.set(task.id, taskResult);
      this.context.set(task.id, taskResult);
    } else {
      // Use last step result as task result
      const lastStep = task.steps[task.steps.length - 1];
      if (lastStep) {
        const lastResult = this.context.get(lastStep.id);
        if (lastResult !== undefined) {
          this.taskResults.set(task.id, lastResult);
          this.context.set(task.id, lastResult);
          taskResult = lastResult;
        }
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
   * Build a map of dependency results for a task.
   */
  private buildDependencyContext(
    task: Task
  ): Record<string, unknown> {
    const depContext: Record<string, unknown> = {};
    for (const depId of task.dependsOn ?? []) {
      const result = this.taskResults.get(depId);
      if (result !== undefined) {
        depContext[depId] = result;
      }
    }
    return depContext;
  }

  /**
   * Build system prompt enhanced with dependency results.
   */
  private buildTaskSystemPrompt(
    task: Task,
    depContext: Record<string, unknown>
  ): string | undefined {
    const parts: string[] = [];
    if (this.systemPrompt) {
      parts.push(this.systemPrompt);
    }

    if (Object.keys(depContext).length > 0) {
      parts.push("\n# Results from prerequisite tasks:");
      for (const [depId, result] of Object.entries(depContext)) {
        const depTask = this.taskPlan.tasks.find((t) => t.id === depId);
        const depTitle = depTask?.title ?? depId;
        const resultStr =
          typeof result === "string"
            ? result
            : JSON.stringify(result, null, 2);
        parts.push(`\n## ${depTitle} (${depId}):\n${resultStr}`);
      }
    }

    return parts.length > 0 ? parts.join("\n") : undefined;
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

  /**
   * Get the result of a specific task.
   */
  getTaskResult(taskId: string): unknown {
    return this.taskResults.get(taskId);
  }

  /**
   * Get all task results.
   */
  getAllResults(): Record<string, unknown> {
    const results: Record<string, unknown> = {};
    for (const [id, result] of this.taskResults) {
      results[id] = result;
    }
    return results;
  }

  /**
   * Get the result of the final task (last task in the plan, typically the aggregator).
   */
  getFinalResult(): unknown {
    if (this.taskPlan.tasks.length === 0) return null;
    const lastTask = this.taskPlan.tasks[this.taskPlan.tasks.length - 1];
    return this.taskResults.get(lastTask.id) ?? null;
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
      if (firstError === undefined) firstError = e;
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

  if (firstError !== undefined) {
    throw firstError;
  }
}
