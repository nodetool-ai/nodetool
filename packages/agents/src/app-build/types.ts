/**
 * The contract every stage of `nodetool app build` reads and writes.
 *
 * The Spec stage pins a {@link BuildSpec} — the target the rest of the build is
 * measured against — and never revisits it. Everything after produces
 * {@link BuildIssue}s, which the orchestrator groups into a
 * {@link BuildComplaint} per repair round and finally reports as a
 * {@link BuildReport}.
 *
 * Shapes here follow docs/mini-app-build-harness-design.md §2; change them
 * there first.
 */

import type { ApplicationBundle } from "@nodetool-ai/app-runtime";
import type {
  AppDebugReport,
  InteractionStep
} from "@nodetool-ai/execution/app-debug";
import type { SupervisedRunSummary } from "@nodetool-ai/execution/debug";
import type { Intervention } from "@nodetool-ai/protocol";

/** What a spec expectation asserts about a display widget's final value. */
export type BuildExpectCheck = "nonEmpty" | "equals" | "matches";

/** One declared assertion against a widget after an interaction settles. */
export interface BuildExpectation {
  /** Widget reference: a widget `role`, its `label`, or a unique type. */
  widget: string;
  check: BuildExpectCheck;
  /** Required for `equals` and `matches`; ignored by `nonEmpty`. */
  value?: unknown;
}

/** One value an operation takes, with a runnable example. */
export interface BuildSpecInput {
  name: string;
  type: string;
  example: unknown;
}

/** One value an operation produces. */
export interface BuildSpecOutput {
  name: string;
  type: string;
}

/** A unit of work the app can trigger: one workflow, planned or bound. */
export interface BuildSpecOperation {
  /** Stable slug, e.g. "draft". */
  id: string;
  /** GraphPlanner objective — or empty when {@link workflowId} binds instead. */
  objective: string;
  /** Bind an existing workflow rather than planning one. */
  workflowId?: string;
  inputs: BuildSpecInput[];
  outputs: BuildSpecOutput[];
  streaming: boolean;
}

/** A named piece of app state outside any single run. */
export interface BuildSpecVariable {
  id: string;
  scope: "app" | "instance";
  persist: boolean;
  /** Operation id whose output writes it. */
  writtenBy: string;
  /** Widget roles and operation ids that read it. */
  readBy: string[];
}

/** One placed component, in spec vocabulary (no Puck ids yet). */
export interface BuildSpecWidget {
  /** Stable slug naming this widget's job, e.g. "draft-output". */
  role: string;
  /** A `WIDGET_CATALOG` key. */
  type: string;
  /** Binding token — `op:<id>/in:<name>`, `op:<id>/out:<name>`, `var:<id>`, … */
  binding: string;
  label: string;
  /** Role of the container widget this sits in, when nested. */
  container?: string;
  /** Condition source, verbatim — the app-runtime condition language. */
  visibleWhen?: string;
}

/** The behavioral contract: what a user does, and what must then be true. */
export interface BuildSpecInteraction {
  /** Slug, e.g. "draft-then-approve". */
  name: string;
  /** The app-debug script language — Run replays these unchanged. */
  steps: InteractionStep[];
  expect: BuildExpectation[];
}

/** What the Spec stage produces and every later stage consumes. */
export interface BuildSpec {
  title: string;
  operations: BuildSpecOperation[];
  variables: BuildSpecVariable[];
  widgets: BuildSpecWidget[];
  interactions: BuildSpecInteraction[];
}

/** The stages a build runs, in order. */
export type BuildStage = "spec" | "plan" | "author" | "check" | "run" | "judge";

/** One thing wrong, attributed to the stage that found it. */
export interface BuildIssue {
  stage: BuildStage;
  /** Stable machine code, e.g. "unknown_widget_type". Part of the fingerprint. */
  code: string;
  severity: "error" | "warning";
  message: string;
  /** Widget role the issue is about, when it is about one. */
  widget?: string;
  /** Operation id the issue is about, when it is about one. */
  operation?: string;
  /** Interaction the issue arose in — Run-stage issues carry one. */
  interaction?: string;
  /** Index of the interaction step the issue is about, when it is about one. */
  step?: number;
}

/**
 * The stable identity of an issue across rounds. The oscillation guard compares
 * these, so it must not carry anything that varies with wording or ordering.
 *
 * Run-stage issues add the interaction (and the step inside it) they arose in:
 * without it every failed step of every interaction shares one fingerprint, and
 * a build making real progress reads as oscillating.
 */
export const issueFingerprint = (issue: BuildIssue): string => {
  const ref = issue.widget ?? issue.operation ?? "-";
  const where =
    issue.interaction === undefined
      ? ""
      : `:${issue.interaction}${issue.step === undefined ? "" : `#${issue.step}`}`;
  return `${issue.stage}:${issue.code}:${ref}${where}`;
};

/** One repair round's input: everything wrong, not a delta. */
export interface BuildComplaint {
  round: number;
  issues: BuildIssue[];
  /** {@link issueFingerprint} per issue, for oscillation detection. */
  fingerprints: string[];
}

/** One stage execution — the first pass or any repair round's re-run. */
export interface StageRecord {
  stage: BuildStage;
  /** Repair round this execution belongs to; 0 is the first pass. */
  round: number;
  /** Provider this execution billed to, when it is not the builder's. */
  provider?: string;
  /** Model this execution billed to, when it is not the builder's. */
  model?: string;
  status: "ok" | "failed" | "skipped";
  startedAt: string;
  durationMs: number;
  /** What this execution found. Empty on a clean pass. */
  issues: BuildIssue[];
  costUsd: number;
  /** One line for the human report — why it failed, or what it produced. */
  detail?: string;
}

/** One interaction's judgement, per design §3.6. */
export interface JudgeInteractionVerdict {
  interaction: string;
  achieved: boolean;
  confidence: number;
  reasons: string[];
}

/** What the Judge stage concluded across every interaction. */
export interface JudgeRecord {
  /** The model that judged — recorded because it defaults away from the builder. */
  model: string;
  interactions: JudgeInteractionVerdict[];
}

/**
 * A spec interaction after completion: authored steps untouched, plus whatever
 * the harness had to add for the script to exercise the app at all.
 */
export interface CompletedInteraction {
  name: string;
  steps: InteractionStep[];
  expect: BuildExpectation[];
  /** True when the spec declared no interaction for the operation below. */
  derived: boolean;
  /** The operation a derived interaction exercises. */
  operationId?: string;
  /** Steps the harness prepended, described for the report. */
  addedSteps: string[];
}

/**
 * What supervision decided while the Run stage executed the interactions.
 *
 * Only present when a decision was actually taken, so an unsupervised build and
 * a supervised build the supervisor never had to touch report the same thing:
 * nothing. The record is `Intervention` from `@nodetool-ai/protocol`, verbatim —
 * the same one the kernel mints and the editor surface already reads.
 */
export interface BuildSupervision {
  /** Rollup over every decision the Run stage produced. */
  summary: SupervisedRunSummary;
  /** Decisions per interaction, in run order. Interactions with none are absent. */
  byInteraction: Array<{
    interaction: string;
    interventions: Intervention[];
  }>;
}

export interface BuildReport {
  target: { prompt: string; specPath?: string };
  spec: BuildSpec;
  /** The scripts Run replayed, including everything derivation added. */
  interactions: CompletedInteraction[];
  /** One per stage execution, repairs included. */
  stages: StageRecord[];
  repairs: BuildComplaint[];
  /** The final Check+Run evidence, verbatim. */
  appDebug: AppDebugReport | null;
  judge: JudgeRecord | null;
  /** Null unless the Run stage ran under a supervisor that decided something. */
  supervision: BuildSupervision | null;
  verdict: { ok: boolean; reason: string; notSimulated: string[] };
  cost: { usd: number; byStage: Record<string, number> };
  /** Null only when `verdict.ok` is false. */
  bundle: ApplicationBundle | null;
}
