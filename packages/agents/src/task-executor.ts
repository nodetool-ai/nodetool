/**
 * TaskExecutor -- orchestrates execution of a complete Task plan.
 *
 * Port of src/nodetool/agents/task_executor.py
 *
 * Iteratively finds steps whose dependencies are satisfied, runs
 * StepExecutor for each, and collects results until all steps complete
 * or the safety limit is reached.
 *
 * Process-mode steps automatically fan out over list inputs produced by
 * a preceding discover step. Each item is rendered into the step's
 * `perItemInstructions` template and executed as an ephemeral step.
 * Results are aggregated into a list that downstream aggregate steps consume.
 */

import { createHash } from "node:crypto";
import type { BaseProvider } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { memoryKeys } from "@nodetool-ai/runtime";
import { createLogger } from "@nodetool-ai/config";
import type { ProcessingMessage, Chunk, StepResult } from "@nodetool-ai/protocol";

const log = createLogger("nodetool.agents.task-executor");
import { StepExecutor } from "./step-executor.js";
import type { Tool } from "./tools/base-tool.js";
import type { Step, Task } from "./types.js";

const DEFAULT_MAX_STEPS = 50;
const DEFAULT_MAX_STEP_ITERATIONS = 10;

export interface TaskExecutorOptions {
  provider: BaseProvider;
  model: string;
  context: ProcessingContext;
  tools: Tool[];
  task: Task;
  systemPrompt?: string;
  inputs?: Record<string, unknown>;
  maxSteps?: number;
  maxStepIterations?: number;
  /** ID of the final aggregation step (will use useFinishTask=true). */
  finalStepId?: string;
  /** Execute independent steps in parallel (default: false). */
  parallelExecution?: boolean;
  /**
   * Memory keys (typically `task:<id>` from the parent plan's task-level
   * dependencies) to surface in every step's user message as required
   * upstream context. Forwarded to {@link StepExecutor.upstreamMemoryKeys}.
   */
  upstreamMemoryKeys?: string[];
}

export class TaskExecutor {
  private provider: BaseProvider;
  private model: string;
  private tools: Tool[];
  private task: Task;
  private context: ProcessingContext;
  private inputs: Record<string, unknown>;
  private systemPrompt: string | undefined;
  private maxSteps: number;
  private maxStepIterations: number;
  private finalStepId: string | undefined;
  private parallelExecution: boolean;
  private upstreamMemoryKeys: string[];
  private _finishStepId: string | undefined;

  constructor(opts: TaskExecutorOptions) {
    this.provider = opts.provider;
    this.model = opts.model;
    this.tools = opts.tools;
    this.task = opts.task;
    this.context = opts.context;
    this.inputs = opts.inputs ?? {};
    this.systemPrompt = opts.systemPrompt;
    this.maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;
    this.maxStepIterations =
      opts.maxStepIterations ?? DEFAULT_MAX_STEP_ITERATIONS;
    this.finalStepId = opts.finalStepId;
    this.parallelExecution = opts.parallelExecution ?? false;
    this.upstreamMemoryKeys = opts.upstreamMemoryKeys ?? [];
  }

  /**
   * Execute all steps in the task plan, respecting dependency order.
   * Supports both sequential and parallel execution modes.
   */
  async *executeTasks(): AsyncGenerator<ProcessingMessage> {
    // Seed inputs into shared memory so every step sees them. Skip keys that
    // were already seeded by an upstream caller (e.g. ParallelTaskExecutor) to
    // avoid redundant writes and extra subscriber notifications.
    for (const [key, value] of Object.entries(this.inputs)) {
      const fullKey = memoryKeys.input(key);
      if (this.context.memory.has(fullKey)) continue;
      this.context.memory.set({
        key: fullKey,
        kind: "input",
        value,
        title: key
      });
    }

    // Auto-detect finish step (last step) like Python does
    this._finishStepId =
      this.finalStepId ??
      (this.task.steps.length > 0
        ? this.task.steps[this.task.steps.length - 1].id
        : undefined);

    log.info("Task execution started", {
      title: this.task.title,
      steps: this.task.steps.length
    });

    let stepsTaken = 0;

    while (!this.allTasksComplete() && stepsTaken < this.maxSteps) {
      stepsTaken++;

      let executableSteps = this.getExecutableSteps();
      executableSteps = this.maybeDeferFinishStep(executableSteps);

      if (executableSteps.length === 0) {
        if (!this.allTasksComplete()) {
          yield {
            type: "chunk",
            content:
              "\nNo executable steps but not all complete. Possible dependency issues.\n",
            done: false
          } satisfies Chunk;
        }
        break;
      }

      log.debug("Dispatching steps", {
        stepIds: executableSteps.map((s) => s.id)
      });

      // Separate process-mode steps from normal steps
      const processSteps = executableSteps.filter((s) => s.mode === "process");
      const normalSteps = executableSteps.filter((s) => s.mode !== "process");

      // Handle process-mode steps with fan-out
      for (const pStep of processSteps) {
        yield* this.handleProcessStep(pStep);
      }

      // Create step executors for normal steps
      const stepGenerators = normalSteps.map((step) => {
        const executor = new StepExecutor({
          task: this.task,
          step,
          context: this.context,
          provider: this.provider,
          model: this.model,
          tools: [...this.tools],
          systemPrompt: this.systemPrompt,
          maxIterations: this.maxStepIterations,
          useFinishTask: this.isFinishStep(step),
          upstreamMemoryKeys: this.upstreamMemoryKeys
        });
        return executor.execute();
      });

      if (this.parallelExecution && stepGenerators.length > 1) {
        // Execute all steps concurrently, merging yielded messages
        yield* mergeAsyncGenerators(stepGenerators);
      } else {
        // Execute steps sequentially
        for (const generator of stepGenerators) {
          for await (const message of generator) {
            yield message;
          }
        }
      }
    }
  }

  /**
   * Produce a short deterministic hash for a value (used in ephemeral step IDs).
   */
  private shortHash(value: unknown): string {
    const data = JSON.stringify(value, (_key, val) => {
      if (val != null && typeof val === "object" && !Array.isArray(val)) {
        const sorted: Record<string, unknown> = {};
        for (const k of Object.keys(val).sort()) {
          sorted[k] = val[k];
        }
        return sorted;
      }
      return val;
    });
    return createHash("sha1").update(data).digest("hex").slice(0, 12);
  }

  /**
   * Handle a process-mode step by fanning out over list inputs.
   * Creates ephemeral steps for each item in the discover step's result
   * and aggregates the outputs into a list stored in context.
   */
  private async *handleProcessStep(
    step: Step
  ): AsyncGenerator<ProcessingMessage> {
    const discoverStepId = step.dependsOn[0];
    if (!discoverStepId) {
      log.warn("Process step has no dependencies, skipping fan-out", {
        stepId: step.id
      });
      step.completed = true;
      return;
    }

    let discoverResult = this.context.memory.getValue(
      memoryKeys.step(discoverStepId)
    );
    if (discoverResult === undefined || discoverResult === null) {
      log.warn("Discover step result is null/undefined, skipping fan-out", {
        stepId: step.id
      });
      step.completed = true;
      this.context.memory.set({
        key: memoryKeys.step(step.id),
        kind: "step_result",
        value: [],
        source: step.id,
        title: step.instructions.slice(0, 60)
      });
      step.endTime = Date.now();
      return;
    }
    if (!Array.isArray(discoverResult)) {
      log.warn(
        "Discover step result is not an array, wrapping as single-item list",
        {
          stepId: step.id,
          resultType: typeof discoverResult
        }
      );
      discoverResult = [discoverResult];
    }

    const items = discoverResult as unknown[];
    const template = step.perItemInstructions ?? step.instructions;
    const perItemSchema = step.perItemSchema;

    log.info("Fan-out processing", {
      stepId: step.id,
      itemCount: items.length
    });

    // Create ephemeral steps for each item
    const ephemeralSteps: Step[] = items.map((item, index) => {
      let instructions = template;
      if (typeof item === "object" && item !== null) {
        for (const [key, value] of Object.entries(
          item as Record<string, unknown>
        )) {
          const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const strValue = String(value);
          instructions = instructions.replace(
            new RegExp(`\\{${escapedKey}\\}`, "g"),
            () => strValue
          );
        }
      } else {
        const strItem = String(item);
        instructions = instructions.replace(/\{item\}/g, () => strItem);
      }

      // Include the item index so duplicate/deep-equal items get DISTINCT
      // ephemeral IDs. A content-hash-only id collides for repeated items
      // (common in LLM discover lists), collapsing the id->index map and
      // clobbering their shared step:<id> memory key — dropping results and
      // leaving holes in the aggregated array.
      const hash = this.shortHash(item);
      return {
        id: `${step.id}_item_${index}_${hash}`,
        instructions,
        completed: false,
        dependsOn: [],
        logs: [],
        outputSchema: perItemSchema ?? step.outputSchema
      } as Step;
    });

    // Create step executors for each ephemeral step
    const generators = ephemeralSteps.map((ephStep) => {
      const executor = new StepExecutor({
        task: this.task,
        step: ephStep,
        context: this.context,
        provider: this.provider,
        model: this.model,
        tools: [...this.tools],
        systemPrompt: this.systemPrompt,
        maxIterations: this.maxStepIterations,
        useFinishTask: false,
        upstreamMemoryKeys: this.upstreamMemoryKeys
      });
      return executor.execute();
    });

    // Execute and collect results. Results must be stored in item order (the
    // order of `ephemeralSteps`), NOT in completion order — otherwise a parallel
    // fan-out, whose items finish nondeterministically, would scramble the
    // aggregated list relative to the discover step's items and produce a
    // different order on every run. Place each step_result at its item index.
    const indexByStepId = new Map(
      ephemeralSteps.map((ephStep, index) => [ephStep.id, index])
    );
    const results: unknown[] = new Array(ephemeralSteps.length);

    const collect = (msg: unknown): void => {
      const stepResult = msg as StepResult;
      if (stepResult.type !== "step_result") return;
      const stepId = stepResult.step?.id;
      if (stepId === undefined) return;
      const index = indexByStepId.get(stepId);
      if (index !== undefined) {
        results[index] = stepResult.result;
      }
    };

    if (this.parallelExecution && generators.length > 1) {
      for await (const msg of mergeAsyncGenerators(generators)) {
        collect(msg);
        yield msg;
      }
    } else {
      for (const gen of generators) {
        for await (const msg of gen) {
          collect(msg);
          yield msg;
        }
      }
    }

    // Store aggregated results and mark complete.
    this.context.memory.set({
      key: memoryKeys.step(step.id),
      kind: "step_result",
      value: results,
      source: step.id,
      title: step.instructions.slice(0, 60)
    });
    step.completed = true;
    step.endTime = Date.now();

    log.info("Fan-out complete", {
      stepId: step.id,
      resultCount: results.length
    });
  }

  /**
   * Check if all steps in the task are completed.
   */
  private allTasksComplete(): boolean {
    return this.task.steps.every((step) => step.completed);
  }

  /**
   * Find steps whose dependencies are all satisfied (completed).
   */
  private getExecutableSteps(): Step[] {
    const completedIds = new Set(
      this.task.steps.filter((s) => s.completed).map((s) => s.id)
    );
    // Also count inputs as satisfied dependencies
    for (const key of Object.keys(this.inputs)) {
      completedIds.add(key);
    }

    return this.task.steps.filter(
      (step) =>
        !step.completed &&
        !this.isStepRunning(step) &&
        step.dependsOn.every((dep) => completedIds.has(dep))
    );
  }

  /**
   * Check if a step is currently running (started but not finished).
   * Mirrors Python's Step.is_running().
   */
  private isStepRunning(step: Step): boolean {
    return step.startTime != null && step.endTime == null;
  }

  /**
   * Check if a step is the designated finish/aggregation step.
   */
  private isFinishStep(step: Step): boolean {
    if (this._finishStepId) {
      return step.id === this._finishStepId;
    }
    return (
      this.task.steps.length > 0 &&
      step === this.task.steps[this.task.steps.length - 1]
    );
  }

  /**
   * Defer the finish step until all other steps are complete.
   * This ensures the final aggregation step runs last.
   */
  private maybeDeferFinishStep(executableSteps: Step[]): Step[] {
    if (!this._finishStepId) return executableSteps;

    const finishReady = executableSteps.some(
      (s) => s.id === this._finishStepId
    );
    if (!finishReady) return executableSteps;

    const otherPending = this.task.steps.some(
      (s) => !s.completed && s.id !== this._finishStepId
    );
    if (!otherPending) return executableSteps;

    return executableSteps.filter((s) => s.id !== this._finishStepId);
  }
}

// ---------------------------------------------------------------------------
// Async generator merge utility (TS equivalent of wrap_generators_parallel)
// ---------------------------------------------------------------------------

async function* mergeAsyncGenerators<T>(
  generators: AsyncGenerator<T>[]
): AsyncGenerator<T> {
  // Channel: a queue of resolved values with a promise-based pull mechanism
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

  // Start a consumer task for each generator
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

  // Yield items as they arrive. The try/finally guarantees that if the
  // downstream consumer stops early (its `for await` breaks or throws, which
  // injects `.return()` into this merge generator), we terminate the child
  // generators instead of leaving the producer tasks driving them to
  // completion in the background (e.g. LLM calls firing after cancellation).
  try {
    while (activeCount > 0 || queue.length > 0) {
      if (queue.length > 0) {
        yield queue.shift()!;
      } else if (activeCount > 0) {
        // Set resolve BEFORE checking queue again to avoid race condition
        // where an item is pushed between the check and the await.
        const waitPromise = new Promise<void>((r) => {
          resolve = r;
        });
        // Re-check after setting resolve — item may have arrived between
        // the outer check and setting resolve.
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
