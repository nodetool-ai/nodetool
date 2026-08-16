/**
 * TaskExecutor -- orchestrates execution of a complete Task plan.
 *
 * Port of src/nodetool/agents/task_executor.py
 *
 * Iteratively finds steps whose dependencies are satisfied, runs
 * CodeActExecutor for each, and collects results until all steps complete
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
import {
  TaskUpdateEvent,
  type ProcessingMessage,
  type StepResult,
  type TaskUpdate
} from "@nodetool-ai/protocol";

const log = createLogger("nodetool.agents.task-executor");
import { CodeActExecutor } from "./codeact/codeact-executor.js";
import { mergeAsyncGenerators } from "./utils/merge-generators.js";
import type { Tool } from "./tools/base-tool.js";
import type { Step, Task } from "./types.js";
import { DEFAULT_AGENT_POLICY } from "./agent-policy.js";

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
  /** Cap on output tokens per step turn. Forwarded to each step executor. */
  maxTokens?: number;
  /** ID of the final aggregation step (will use useFinishTask=true). */
  finalStepId?: string;
  /** Execute independent steps in parallel (default: false). */
  parallelExecution?: boolean;
  /**
   * Concurrent step / fan-out executions. Defaults to the shared agent policy
   * so a 200-item process-mode fan-out does not open 200 provider
   * conversations at once.
   */
  maxConcurrentAgents?: number;
  /**
   * Memory keys (typically `task:<id>` from the parent plan's task-level
   * dependencies) to surface in every step's user message as required
   * upstream context. Forwarded to {@link CodeActExecutor.upstreamMemoryKeys}.
   */
  upstreamMemoryKeys?: string[];
  /** External cancellation, forwarded to every step executor. */
  signal?: AbortSignal;
  /**
   * Sandbox package specifiers the session consents to, forwarded to every step
   * executor. Empty by default — installed is not chosen.
   */
  sandboxPackages?: readonly string[];
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
  private maxTokens?: number;
  private finalStepId: string | undefined;
  private parallelExecution: boolean;
  private maxConcurrentAgents: number;
  private upstreamMemoryKeys: string[];
  private signal?: AbortSignal;
  private readonly sandboxPackages: readonly string[];
  private _finishStepId: string | undefined;

  constructor(opts: TaskExecutorOptions) {
    this.provider = opts.provider;
    this.model = opts.model;
    this.tools = opts.tools;
    this.task = opts.task;
    this.context = opts.context;
    this.inputs = opts.inputs ?? {};
    this.sandboxPackages = opts.sandboxPackages ?? [];
    this.systemPrompt = opts.systemPrompt;
    this.maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;
    this.maxStepIterations =
      opts.maxStepIterations ?? DEFAULT_MAX_STEP_ITERATIONS;
    this.maxTokens = opts.maxTokens;
    this.finalStepId = opts.finalStepId;
    this.parallelExecution = opts.parallelExecution ?? false;
    this.maxConcurrentAgents =
      opts.maxConcurrentAgents ?? DEFAULT_AGENT_POLICY.maxConcurrentAgents;
    this.upstreamMemoryKeys = opts.upstreamMemoryKeys ?? [];
    this.signal = opts.signal;
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

    while (!this.allStepsSettled() && stepsTaken < this.maxSteps) {
      stepsTaken++;

      let executableSteps = this.getExecutableSteps();
      executableSteps = this.maybeDeferFinishStep(executableSteps);

      if (executableSteps.length === 0) {
        // Nothing runnable and something still pending: every remaining step
        // is waiting on a dependency that failed or on a cycle. Fail them
        // explicitly instead of leaving them in limbo — a step that never
        // reaches a terminal state reads downstream as "still running".
        yield* this.failBlockedSteps("unsatisfiable dependency");
        break;
      }

      log.debug("Dispatching steps", {
        stepIds: executableSteps.map((s) => s.id)
      });

      const processSteps = executableSteps.filter((s) => s.mode === "process");
      const normalSteps = executableSteps.filter((s) => s.mode !== "process");

      for (const pStep of processSteps) {
        yield* this.handleProcessStep(pStep);
      }

      const stepGenerators = normalSteps.map((step) => {
        const executor = new CodeActExecutor({
          task: this.task,
          step,
          context: this.context,
          provider: this.provider,
          model: this.model,
          tools: this.toolsForStep(step),
          systemPrompt: this.systemPrompt,
          maxIterations: this.maxStepIterations,
          maxTokens: this.maxTokens,
          useFinishTask: this.isFinishStep(step),
          upstreamMemoryKeys: this.upstreamMemoryKeys,
          signal: this.signal,
          sandboxPackages: this.sandboxPackages
        });
        return executor.execute();
      });

      if (this.parallelExecution && stepGenerators.length > 1) {
        yield* mergeAsyncGenerators(stepGenerators, {
          concurrency: this.maxConcurrentAgents
        });
      } else {
        for (const generator of stepGenerators) {
          for await (const message of generator) {
            yield message;
          }
        }
      }
    }

    // The step budget ran out with work still pending: same contract as a
    // dependency deadlock — the leftovers are terminal failures, not steps
    // that merely never started.
    if (!this.allStepsSettled()) {
      yield* this.failBlockedSteps(
        `step budget exhausted after ${stepsTaken} round(s)`
      );
    }
  }

  /**
   * Tools a step may call. A plan's per-step `tools` allow-list is a privilege
   * boundary, not a hint: the same plan must grant the same privileges whether
   * it runs in task mode or script mode. An empty or fully-unresolvable list
   * yields no tools rather than silently falling back to the full collection.
   */
  private toolsForStep(step: Step): Tool[] {
    if (!Array.isArray(step.tools)) return [...this.tools];
    const allowed = new Set(step.tools);
    const selected = this.tools.filter((tool) => allowed.has(tool.name));
    const missing = step.tools.filter(
      (name) => !this.tools.some((tool) => tool.name === name)
    );
    if (missing.length > 0) {
      log.warn("Step requested tools that are not available", {
        stepId: step.id,
        missing
      });
    }
    return selected;
  }

  /**
   * Mark every still-pending step as failed and emit its terminal events.
   */
  private async *failBlockedSteps(
    reason: string
  ): AsyncGenerator<ProcessingMessage> {
    for (const step of this.task.steps) {
      if (step.completed || step.failed) continue;
      const blocking = step.dependsOn.filter((dep) => {
        const dependency = this.task.steps.find((s) => s.id === dep);
        return dependency?.failed === true;
      });
      const message =
        blocking.length > 0
          ? `Step blocked: dependency ${blocking.join(", ")} failed`
          : `Step blocked: ${reason}`;
      yield* this.failStep(step, message);
    }
  }

  /** Record one step as a terminal failure and emit its lifecycle events. */
  private async *failStep(
    step: Step,
    message: string
  ): AsyncGenerator<ProcessingMessage> {
    step.failed = true;
    step.error = message;
    step.endTime = Date.now();
    this.context.memory.set({
      key: memoryKeys.step(step.id),
      kind: "step_result",
      value: { error: message },
      source: step.id,
      title: `Failed: ${step.instructions.slice(0, 60)}`
    });

    yield {
      type: "task_update",
      node_id: step.id,
      task: { id: this.task.id, title: this.task.title },
      step: { id: step.id, instructions: step.instructions },
      event: TaskUpdateEvent.StepFailed
    } satisfies TaskUpdate;

    yield {
      type: "step_result",
      step: { id: step.id, instructions: step.instructions },
      result: { error: message },
      error: message,
      is_task_result: this.isFinishStep(step)
    } satisfies StepResult;
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
    const discoverStep = discoverStepId
      ? this.task.steps.find((s) => s.id === discoverStepId)
      : undefined;
    if (discoverStep?.failed) {
      // The scheduler blocks dependents of failed steps, so this is only
      // reachable when the discover step failed mid-round. Fan-out over a
      // failure marker would run the whole item template against `{error}`.
      yield* this.failStep(
        step,
        `Step blocked: discover step ${discoverStepId} failed`
      );
      return;
    }
    if (!discoverStepId) {
      log.warn("Process step has no dependencies, skipping fan-out", {
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

    const ephemeralSteps: Step[] = items.map((item, index) => {
      let instructions = template;
      if (typeof item === "object" && item !== null) {
        for (const [key, value] of Object.entries(
          item as Record<string, unknown>
        )) {
          const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const strValue =
            typeof value === "object" && value !== null
              ? JSON.stringify(value)
              : String(value);
          instructions = instructions.replace(
            new RegExp(`\\{${escapedKey}\\}`, "g"),
            () => strValue
          );
        }
        instructions = instructions.replace(/\{item\}/g, () =>
          JSON.stringify(item)
        );
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
      };
    });

    const generators = ephemeralSteps.map((ephStep) => {
      const executor = new CodeActExecutor({
        task: this.task,
        step: ephStep,
        context: this.context,
        provider: this.provider,
        model: this.model,
        tools: this.toolsForStep(step),
        systemPrompt: this.systemPrompt,
        maxIterations: this.maxStepIterations,
        maxTokens: this.maxTokens,
        useFinishTask: false,
        upstreamMemoryKeys: this.upstreamMemoryKeys,
        signal: this.signal,
        sandboxPackages: this.sandboxPackages
      });
      return executor.execute();
    });

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
      for await (const msg of mergeAsyncGenerators(generators, {
        concurrency: this.maxConcurrentAgents
      })) {
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
   * Whether every step reached a terminal state — completed or failed. A
   * failed step ends the scheduler loop without counting as success.
   */
  private allStepsSettled(): boolean {
    return this.task.steps.every((step) => step.completed || step.failed);
  }

  /**
   * Find steps whose dependencies are all satisfied (completed). A failed
   * dependency is never satisfied, so its dependents stay unscheduled.
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
        !step.failed &&
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
      (s) => !s.completed && !s.failed && s.id !== this._finishStepId
    );
    if (!otherPending) return executableSteps;

    const withoutFinish = executableSteps.filter(
      (s) => s.id !== this._finishStepId
    );
    if (withoutFinish.length === 0) return executableSteps;

    const dependsOnFinish = (step: Step, seen = new Set<string>()): boolean => {
      if (seen.has(step.id)) return false;
      seen.add(step.id);
      return step.dependsOn.some((dependencyId) => {
        if (dependencyId === this._finishStepId) return true;
        const dependency = this.task.steps.find((s) => s.id === dependencyId);
        return dependency ? dependsOnFinish(dependency, new Set(seen)) : false;
      });
    };
    if (
      this.task.steps.some(
        (step) => !step.completed && !step.failed && dependsOnFinish(step)
      )
    ) {
      return executableSteps;
    }
    return withoutFinish;
  }
}
