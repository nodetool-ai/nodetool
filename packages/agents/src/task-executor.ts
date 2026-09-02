/**
 * TaskExecutor -- orchestrates execution of a complete Task plan.
 *
 * Port of src/nodetool/agents/task_executor.py
 *
 * The task's steps are a DAG, handed to {@link scheduleDag}: a step starts the
 * moment its last dependency settles and runs as a `CodeActExecutor`. Nothing
 * counts dispatch rounds, so a chain is as deep as the plan says; what bounds
 * the work is the run budget, the per-step iteration cap, and the permit pool.
 */

import type {
  BaseProvider,
  ProcessingContext,
  RunBudget,
  Semaphore
} from "@nodetool-ai/runtime";
import {
  budgetFromContext,
  createSemaphore,
  memoryKeys
} from "@nodetool-ai/runtime";
import { createLogger } from "@nodetool-ai/config";
import {
  TaskUpdateEvent,
  type ProcessingMessage,
  type StepResult,
  type TaskUpdate
} from "@nodetool-ai/protocol";

const log = createLogger("nodetool.agents.task-executor");
import { CodeActExecutor } from "./codeact/codeact-executor.js";
import { holdsRunSlot, markRunSlotHeld } from "./subagent.js";
import {
  ABORTED,
  UNSATISFIABLE_DEPENDENCY,
  scheduleDag,
  type DagNode,
  type DagOutcome,
  type DagRunResult
} from "./utils/dag-scheduler.js";
import type { Tool } from "./tools/base-tool.js";
import type { Step, Task } from "./types.js";
import { DEFAULT_AGENT_POLICY } from "./agent-policy.js";

const DEFAULT_MAX_STEP_ITERATIONS = 10;

/** One step, as the scheduler sees it. */
interface StepNode extends DagNode {
  step: Step;
}

export interface TaskExecutorOptions {
  provider: BaseProvider;
  model: string;
  context: ProcessingContext;
  tools: Tool[];
  task: Task;
  systemPrompt?: string;
  inputs?: Record<string, unknown>;
  maxStepIterations?: number;
  /** Cap on output tokens per step turn. Forwarded to each step executor. */
  maxTokens?: number;
  /**
   * Steps this task may run at once. Defaults to the shared agent policy, so a
   * wide task does not open one provider conversation per step.
   */
  maxConcurrentAgents?: number;
  /**
   * Memory keys (typically `task:<id>` from the parent plan's task-level
   * dependencies) to surface in every step's user message as required
   * upstream context. Forwarded to {@link CodeActExecutor.upstreamMemoryKeys}.
   */
  upstreamMemoryKeys?: string[];
  /**
   * The run's budget, forwarded to every step executor so the whole task
   * reserves against one cap, and used as the concurrency bound its fan-outs
   * share. Omitted, the budget on {@link context} is used; absent there too,
   * the task is unbudgeted.
   */
  budget?: RunBudget;
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
  private maxStepIterations: number;
  private maxTokens?: number;
  private maxConcurrentAgents: number;
  private upstreamMemoryKeys: string[];
  private readonly budget?: RunBudget;
  /**
   * The run's permit pool, when this executor is the layer drawing from it.
   * Set for the length of a run by {@link enterRunSlot}: a nested executor, or
   * a sub-agent under one of these steps, sees the branch already holding a
   * permit and takes none, because a holder that queues for a second permit
   * deadlocks the run.
   */
  private mergeSemaphore?: Semaphore;
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
    this.maxStepIterations =
      opts.maxStepIterations ?? DEFAULT_MAX_STEP_ITERATIONS;
    this.maxTokens = opts.maxTokens;
    this.maxConcurrentAgents =
      opts.maxConcurrentAgents ?? DEFAULT_AGENT_POLICY.maxConcurrentAgents;
    this.upstreamMemoryKeys = opts.upstreamMemoryKeys ?? [];
    this.budget = opts.budget ?? budgetFromContext(opts.context);
    this.signal = opts.signal;
  }

  /**
   * Claim this branch's run slot for the fan-outs below, and hand back the
   * undo. A branch already holding one keeps its numeric bound only.
   */
  private enterRunSlot(): () => void {
    if (!this.budget || holdsRunSlot(this.context)) {
      this.mergeSemaphore = undefined;
      return () => {};
    }
    this.mergeSemaphore = this.budget.concurrency;
    return markRunSlotHeld(this.context);
  }

  /**
   * Execute all steps in the task plan, respecting dependency order.
   * Supports both sequential and parallel execution modes.
   */
  async *executeTasks(): AsyncGenerator<ProcessingMessage> {
    const leaveRunSlot = this.enterRunSlot();
    try {
      yield* this.runSteps();
    } finally {
      leaveRunSlot();
    }
  }

  private async *runSteps(): AsyncGenerator<ProcessingMessage> {
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

    // The last step in the plan is the finish step.
    this._finishStepId =
      this.task.steps.length > 0
        ? this.task.steps[this.task.steps.length - 1].id
        : undefined;

    log.info("Task execution started", {
      title: this.task.title,
      steps: this.task.steps.length
    });

    // Steps this task may run at once — a bound on this task rather than on
    // the run.
    const perTask = this.maxConcurrentAgents;

    yield* scheduleDag<StepNode, ProcessingMessage>({
      nodes: this.stepNodes(),
      // The branch's pool when this executor is the layer drawing from it,
      // else a pool of its own so an unbudgeted task is still bounded.
      concurrency: this.mergeSemaphore ?? createSemaphore(perTask),
      maxConcurrent: perTask,
      signal: this.signal,
      run: (node) => this.runStep(node.step),
      settle: (node, outcome, error) =>
        this.settleStep(node.step, outcome, error),
      onBlocked: (node, by) =>
        this.failStepEvents(
          node.step,
          `Step blocked: dependency ${by.id} failed`
        )
    });
  }

  /**
   * The steps the scheduler runs, with the dependencies each waits on.
   *
   * A step already settled when the task starts is not a node: its dependents
   * treat it as satisfied (completed) or as never satisfiable (failed), which
   * is what the round loop's `completedIds` set did. Input keys count as
   * satisfied the same way. A dependency naming nothing at all is left in
   * place, so the step never becomes ready and the scheduler settles it with
   * `unsatisfiable dependency`.
   */
  private stepNodes(): StepNode[] {
    const pending = this.task.steps.filter(
      (step) => !step.completed && !step.failed
    );
    const satisfied = new Set<string>(Object.keys(this.inputs));
    for (const step of this.task.steps) {
      if (step.completed) satisfied.add(step.id);
    }

    const deferredBehind = this.stepsFinishWaitsFor(pending);
    return pending.map((step) => {
      const dependsOn = step.dependsOn.filter((dep) => !satisfied.has(dep));
      if (step.id === this._finishStepId) {
        // A Set, not `includes`: the list it is checked against grows with
        // every id added, which would make a wide task quadratic.
        const declared = new Set(dependsOn);
        for (const id of deferredBehind) {
          if (!declared.has(id)) dependsOn.push(id);
        }
      }
      return { id: step.id, dependsOn, step };
    });
  }

  /**
   * The steps the finish step must wait for: every other pending step that
   * does not itself depend on the finish step.
   *
   * The aggregation step runs last, which the round loop arranged by holding
   * it back each round. Here it is a real dependency, so a sibling that fails
   * blocks it (I-5) instead of aggregating over a hole. Steps downstream of
   * the finish step are excluded — a plan may declare one, and depending on
   * them both ways is a cycle nothing could run.
   */
  private stepsFinishWaitsFor(pending: Step[]): string[] {
    const finishId = this._finishStepId;
    if (!finishId) return [];
    const dependents = new Map<string, Step[]>();
    for (const step of pending) {
      for (const dep of step.dependsOn) {
        const list = dependents.get(dep);
        if (list) {
          list.push(step);
        } else {
          dependents.set(dep, [step]);
        }
      }
    }
    const downstream = new Set<string>([finishId]);
    const frontier = [finishId];
    for (let i = 0; i < frontier.length; i++) {
      for (const dependent of dependents.get(frontier[i]) ?? []) {
        if (downstream.has(dependent.id)) continue;
        downstream.add(dependent.id);
        frontier.push(dependent.id);
      }
    }
    return pending
      .filter((step) => !downstream.has(step.id))
      .map((step) => step.id);
  }

  /** Run one step and report how it settled. */
  private async *runStep(
    step: Step
  ): AsyncGenerator<ProcessingMessage, DagRunResult> {
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
      turnBudget: this.budget,
      useFinishTask: this.isFinishStep(step),
      upstreamMemoryKeys: this.upstreamMemoryKeys,
      signal: this.signal,
      sandboxPackages: this.sandboxPackages
    });
    yield* this.withStepLog(step, executor.execute());
    // A step failure does not throw: the executor records it on the step and
    // emits its own terminal events.
    return step.failed
      ? { outcome: "failed", error: step.error }
      : { outcome: "ok" };
  }

  /**
   * Terminal events for a settled step. A step that ran emitted its own, so
   * this speaks only for one that never did — blocked by a dependency that can
   * never be satisfied, or cut short by the run's signal.
   */
  private settleStep(
    step: Step,
    outcome: DagOutcome,
    reason?: string
  ): ProcessingMessage[] {
    if (outcome === "ok" || step.completed || step.failed) return [];
    if (reason === ABORTED) {
      return this.failStepEvents(step, "Step aborted");
    }
    const blocking = step.dependsOn.filter((dep) => {
      const dependency = this.task.steps.find((s) => s.id === dep);
      return dependency?.failed === true;
    });
    return this.failStepEvents(
      step,
      blocking.length > 0
        ? `Step blocked: dependency ${blocking.join(", ")} failed`
        : `Step blocked: ${reason ?? UNSATISFIABLE_DEPENDENCY}`
    );
  }

  /**
   * Bracket one step with a start/finish line. The run log recorded task
   * boundaries and nothing between them, so a plan that spent minutes in a
   * step left no trace of which step, how long, or how it settled. Bounded by
   * the plan's step count, so it cannot become the log-volume problem it fixes.
   */
  private async *withStepLog(
    step: Step,
    gen: AsyncGenerator<ProcessingMessage>
  ): AsyncGenerator<ProcessingMessage> {
    const startedAt = Date.now();
    log.info("Step started", {
      taskId: this.task.id,
      stepId: step.id,
      tools: this.toolsForStep(step).length
    });
    try {
      yield* gen;
    } finally {
      log.info("Step finished", {
        taskId: this.task.id,
        stepId: step.id,
        durationMs: Date.now() - startedAt,
        completed: step.completed === true,
        failed: step.failed === true,
        error: step.error
      });
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

  /** Record one step as a terminal failure and build its lifecycle events. */
  private failStepEvents(step: Step, message: string): ProcessingMessage[] {
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

    return [
      {
        type: "task_update",
        node_id: step.id,
        task: { id: this.task.id, title: this.task.title },
        step: { id: step.id, instructions: step.instructions },
        event: TaskUpdateEvent.StepFailed
      } satisfies TaskUpdate,
      {
        type: "step_result",
        step: { id: step.id, instructions: step.instructions },
        result: { error: message },
        error: message,
        is_task_result: this.isFinishStep(step)
      } satisfies StepResult
    ];
  }

  /** The task's last step, the one whose result is the task's result. */
  private isFinishStep(step: Step): boolean {
    return step.id === this._finishStepId;
  }
}
