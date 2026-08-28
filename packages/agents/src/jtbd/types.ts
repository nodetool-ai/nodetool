/**
 * Jobs to be done — the agent-intent layer over NodeTool's surfaces.
 *
 * The repo already catalogues two things: `SURFACES` (what a product owner
 * ships) and `CAPABILITY_COVERAGE` (what a tool call can do). Neither answers
 * the question an optimizer needs to ask, which is what an agent was *trying to
 * get done* and where the product stopped it. A capability check proves
 * `add_track` returns a track id; it cannot notice that no model ever finds
 * `add_track` because its description does not say the word "audio".
 *
 * A job is one objective an agent takes end to end across whatever surfaces it
 * needs, run against the real tool contract, recorded in full. Three things
 * come out of a run and all three matter:
 *
 *  - the **transcript** — the system prompt, every assistant turn, every tool
 *    call and its result. Without it a failed run says "score 0.4" and nothing
 *    an outer agent can act on.
 *  - the **outcome** — did the job get done, per the case's own checks.
 *  - the **friction** — where the run wasted turns, and whether the blame lands
 *    on the harness or on the prompt. This is the attribution the optimizer
 *    reads; see `friction.ts` for how it is derived and why it is a heuristic
 *    that proposes rather than decides.
 */

import type { Message } from "@nodetool-ai/runtime";
import type { ToolLoopCallRecord } from "../app-build/tool-loop.js";
import type { HeadlessSurfaceBridge } from "../evals/tool-loop-eval.js";

/**
 * Where a job's friction lands. The split is the whole point of the loop: an
 * outer agent fixes a `harness` finding by changing a tool — its schema, its
 * error text, its result shape — and a `prompt` finding by changing what the
 * agent was told. Getting the attribution wrong sends the fix to the wrong
 * file, so the deriver leaves it `unattributed` rather than guessing.
 */
export type FrictionOwner = "harness" | "prompt" | "unattributed";

export type FrictionSeverity = "blocking" | "wasteful" | "cosmetic";

/** One thing that went wrong, with enough context to act on it. */
export interface FrictionSignal {
  /** Stable kind, e.g. `repeated-tool-error`, `schema-rejection`, `flailing`. */
  kind: string;
  owner: FrictionOwner;
  severity: FrictionSeverity;
  /** What happened, in one sentence, naming the tool where there is one. */
  summary: string;
  /** The tool this is about, when the signal is tool-scoped. */
  tool?: string;
  /** Indices into `JobRunReport.toolCalls` that evidence the signal. */
  callIndices: number[];
  /**
   * The verbatim evidence — an error string the harness returned, the repeated
   * arguments. An optimizer that only sees a summary is diagnosing our
   * paraphrase instead of the run.
   */
  evidence: string[];
}

/** A named boolean assertion over the world the job left behind. */
export interface JobOutcomeCheck<TFinal = unknown> {
  name: string;
  /** What the agent was supposed to have achieved, in the user's terms. */
  describe: string;
  test: (state: TFinal) => boolean;
}

/**
 * One job an agent takes end to end.
 *
 * The `statement` is deliberately written in JTBD form ("when ... I want ... so
 * I can ...") rather than as a task label. It is what the optimizer quotes back
 * to a model when asking whether the run achieved anything, and a label like
 * "timeline test 3" gives it nothing to judge against.
 */
export interface JobToBeDone<TFinal = unknown> {
  id: string;
  /** "When <situation>, I want to <motivation>, so I can <outcome>." */
  statement: string;
  /** Surface ids from the harness registry this job crosses. */
  surfaces: string[];
  /**
   * How hard the job is meant to be. `smoke` jobs should never fail on a
   * capable model — one that does is a harness regression, not a model gap.
   */
  difficulty: "smoke" | "standard" | "long-horizon";
  /** The objective handed to the agent, in the user's own voice. */
  objective: string;
  /** Builds a fresh world per run. */
  createBridge: () => HeadlessSurfaceBridge<TFinal>;
  /** System prompt under test. Absent means the suite default is under test. */
  systemPrompt?: string;
  /** Turn cap. A long-horizon job declares the budget it needs. */
  maxIterations?: number;
  /** Needs configured model providers to be solvable at all. */
  needsModelProviders?: boolean;
  /** What "done" means for this job. */
  outcomes: JobOutcomeCheck<TFinal>[];
  /**
   * Turn budget past which the run is doing the job the slow way. Exceeding it
   * is friction, never failure — a job done in 30 calls is still done.
   */
  expectedToolCalls?: number;
}

/** Everything one run of a job produced. */
export interface JobRunReport {
  jobId: string;
  statement: string;
  provider: string;
  model: string;
  startedAt: string;
  skipped: boolean;
  /** The loop ran to a stop without a provider error. */
  completed: boolean;
  /** Every outcome check passed — the job actually got done. */
  achieved: boolean;
  outcomes: Array<{ name: string; describe: string; passed: boolean }>;
  /** The full conversation, system prompt first. */
  transcript: Message[];
  toolCalls: ToolLoopCallRecord[];
  friction: FrictionSignal[];
  totalToolCalls: number;
  durationMs: number;
  costUsd: number;
  error?: string;
}

export interface JobSuiteReport {
  provider: string;
  model: string;
  startedAt: string;
  jobs: JobRunReport[];
  summary: {
    total: number;
    skipped: number;
    achieved: number;
    /** achieved / (total - skipped) — the number a gate reads. */
    achievementRate: number;
    /** Friction signals across the suite, by owner. */
    frictionByOwner: Record<FrictionOwner, number>;
    totalCostUsd: number;
  };
}
