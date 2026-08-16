/**
 * The LLM-backed `SupervisorHandle`.
 *
 * One `StepExecutor` per decision: a fresh conversation, the verdict schema
 * narrowed to what the kernel will accept, two read-only tools, and a hard
 * dollar ceiling enforced turn by turn inside the provider. Everything that
 * bounds *how many* decisions happen — counting, retries, timeouts, the sticky
 * cache, serialization — lives in the kernel's `BoundedHandle`; this class
 * bounds what one decision may cost and say.
 *
 * Every failure mode here resolves to `fail`. A supervisor that throws, times
 * out, runs out of budget, or answers something unparseable must leave the run
 * exactly where it would have been without a supervisor.
 *
 * See docs/workflow-supervisor-design.md §6.
 */

import type { BaseProvider, ProcessingContext } from "@nodetool-ai/runtime";
import { CostCappedTurnBudget } from "@nodetool-ai/runtime";
import type { Escalation, Verdict } from "@nodetool-ai/protocol";
import { verdictSchema } from "@nodetool-ai/protocol";
import {
  validateSubstituteOutputs,
  type DecisionOutcome,
  type RunStateReader,
  type SupervisorHandle
} from "@nodetool-ai/kernel";
import { createLogger } from "@nodetool-ai/config";
import { StepExecutor, type StepResultAcceptance } from "../step-executor.js";
import type { Step, Task } from "../types.js";
import { buildSupervisorPrompt } from "./prompt.js";
import { buildVerdictSchema } from "./verdict-schema.js";
import { createSupervisorTools } from "./tools.js";

const log = createLogger("nodetool.agents.supervisor");

/** Run-level ceiling on what supervision may cost, in USD. */
export const DEFAULT_MAX_SUPERVISOR_COST_USD = 0.5;

/**
 * Output-token bound assumed for every supervisor turn. Reservation needs a
 * known worst case, so this is never left unset — `StepExecutor.maxTokens`
 * being optional is not good enough where a cap has to hold.
 */
export const DEFAULT_SUPERVISOR_MAX_OUTPUT_TOKENS = 2048;

/** Tool-calling rounds allowed per decision. Diagnosis, then a verdict. */
const DECISION_MAX_ITERATIONS = 6;

export interface SupervisorAgentOptions {
  provider: BaseProvider;
  model: string;
  /**
   * Context for tool execution and memory. The provider instance must not be
   * shared with the run it supervises: per-turn spend is reconciled from the
   * provider's own running cost, and a second caller on the same instance
   * would corrupt that.
   */
  context: ProcessingContext;
  /** Run-level dollar ceiling. Default {@link DEFAULT_MAX_SUPERVISOR_COST_USD}. */
  maxCostUsd?: number;
  /** Per-turn output bound. Default {@link DEFAULT_SUPERVISOR_MAX_OUTPUT_TOKENS}. */
  maxOutputTokens?: number;
  /**
   * Resolves a reference uri against run storage, for accepting a `substitute`
   * that carries reference-typed outputs. Omitted ⇒ such repairs are rejected,
   * which is the safe direction: an unresolvable ref is the failure the check
   * exists to catch.
   */
  resolveRef?: (uri: string) => Promise<boolean>;
}

const FAIL: Verdict = { action: "fail" };

export class SupervisorAgent implements SupervisorHandle {
  private readonly _opts: SupervisorAgentOptions;
  private readonly _budget: CostCappedTurnBudget;
  private _reader: RunStateReader | null = null;
  private _decisions = 0;

  constructor(opts: SupervisorAgentOptions) {
    this._opts = opts;
    this._budget = new CostCappedTurnBudget({
      capUsd: opts.maxCostUsd ?? DEFAULT_MAX_SUPERVISOR_COST_USD,
      maxOutputTokens:
        opts.maxOutputTokens ?? DEFAULT_SUPERVISOR_MAX_OUTPUT_TOKENS
    });
  }

  attach(reader: RunStateReader): void {
    this._reader = reader;
  }

  async decide(
    escalation: Escalation,
    signal: AbortSignal
  ): Promise<DecisionOutcome> {
    const spentBefore = this._budget.spentUsd;
    try {
      const decision = await this._runDecision(escalation, signal);
      const costUsd = this._budget.spentUsd - spentBefore;
      if (decision === null) {
        // The step never produced a verdict: refused turns, an exhausted
        // iteration budget, an unparseable answer. Deterministic degradation.
        return { verdict: FAIL, decidedBy: "bounds", costUsd };
      }
      this._remember(escalation, decision.verdict, decision.rationale);
      return { verdict: decision.verdict, decidedBy: "agent", costUsd };
    } catch (error) {
      log.warn("Supervisor decision failed", {
        nodeId: escalation.nodeId,
        error: error instanceof Error ? error.message : String(error)
      });
      return {
        verdict: FAIL,
        decidedBy: "bounds",
        costUsd: this._budget.spentUsd - spentBefore
      };
    }
  }

  close(): void {
    this._reader = null;
  }

  private async _runDecision(
    escalation: Escalation,
    signal: AbortSignal
  ): Promise<{ verdict: Verdict; rationale: string } | null> {
    const id = `supervisor_${++this._decisions}`;
    const step: Step = {
      id,
      instructions: buildSupervisorPrompt(escalation),
      dependsOn: [],
      completed: false,
      logs: [],
      outputSchema: JSON.stringify(
        buildVerdictSchema(escalation.allowedActions)
      )
    };
    const task: Task = {
      id,
      title: `Supervise ${escalation.nodeId}`,
      steps: [step],
      dependsOn: []
    };

    const executor = new StepExecutor({
      task,
      step,
      context: this._opts.context,
      provider: this._opts.provider,
      model: this._opts.model,
      tools: this._reader
        ? createSupervisorTools(this._reader, escalation, this._opts.context)
        : [],
      maxIterations: DECISION_MAX_ITERATIONS,
      maxTokens:
        this._opts.maxOutputTokens ?? DEFAULT_SUPERVISOR_MAX_OUTPUT_TOKENS,
      turnBudget: this._budget,
      acceptResult: (result) => this._accept(escalation, result),
      signal
    });

    // The verdict is the result; the message stream belongs to the surfaces
    // that wire this handle up (CLI, websocket), not to the decision itself.
    for await (const _message of executor.execute()) {
      if (signal.aborted) break;
    }
    if (signal.aborted) return null;
    const result = executor.getResult();
    const verdict = parseVerdict(result);
    return verdict === null
      ? null
      : { verdict, rationale: readRationale(result) };
  }

  /**
   * A `substitute` is terminal only once its value would survive contact with
   * the graph. Rejections go back into the still-open conversation, so the
   * model repairs its repair instead of the kernel silently downgrading it.
   */
  private async _accept(
    escalation: Escalation,
    result: unknown
  ): Promise<StepResultAcceptance> {
    const verdict = parseVerdict(result);
    if (verdict === null) {
      return {
        accepted: false,
        reason: "not a valid verdict for this escalation"
      };
    }
    if (verdict.action !== "substitute") return { accepted: true };

    const checkOptions: Parameters<typeof validateSubstituteOutputs>[1] = {
      declaredOutputs: escalation.declaredOutputs
    };
    if (this._opts.resolveRef) {
      checkOptions.resolveRef = this._opts.resolveRef;
    }
    const validation = await validateSubstituteOutputs(
      verdict.outputs,
      checkOptions
    );
    return validation.ok
      ? { accepted: true }
      : { accepted: false, reason: validation.issues.join("; ") };
  }

  /**
   * Decisions and their rationales land in agent memory so a downstream
   * compiler pass can reference them when it writes up the run.
   */
  private _remember(
    escalation: Escalation,
    verdict: Verdict,
    rationale: string
  ): void {
    const key = `supervisor:${escalation.nodeId}${
      escalation.invocationKey ? `:${escalation.invocationKey}` : ""
    }`;
    this._opts.context.memory.set({
      key,
      kind: "shared",
      value: { escalation, verdict, rationale },
      source: escalation.nodeId,
      title: `${verdict.action} — ${escalation.nodeId}: ${rationale}`
    });
  }
}

/**
 * The model answers with a verdict plus a `rationale`; the kernel's verdict
 * type has no such field and its schema is strict, so the rationale is split
 * off here and kept in memory rather than dropped.
 */
function parseVerdict(result: unknown): Verdict | null {
  if (result === null || typeof result !== "object") return null;
  const { rationale: _rationale, ...rest } = result as Record<string, unknown>;
  const parsed = verdictSchema.safeParse(rest);
  return parsed.success ? parsed.data : null;
}

function readRationale(result: unknown): string {
  if (result === null || typeof result !== "object") return "";
  const value = (result as Record<string, unknown>)["rationale"];
  return typeof value === "string" ? value : "";
}
