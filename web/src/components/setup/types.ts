/**
 * Per-flow configuration for `SetupFlow` (PRD § 6.2).
 *
 * A creation flow is data, not a subclass: the five flows differ only in their
 * labels, their step bodies, and what each step's primary button does. The
 * shell holds no wizard store — the stage lives on the document the flow
 * produces (PRD § 6.4, D1/D3), so a reload or a second host resumes at the
 * same place with no extra state to reconcile.
 */

import type { ReactNode } from "react";

/** Flow heading and subline, shown above the stepper. */
export interface SetupFlowLabels {
  title: string;
  /** One line under the title. Omit when the title says enough. */
  subline?: string;
}

/**
 * One stage of a flow: what the creator sees, what the primary button says,
 * and what pressing it does before the stage moves on.
 */
export interface SetupStep<Stage extends string> {
  /** The document stage this step renders (PRD § 6.4). */
  stage: Stage;
  /**
   * Stepper label, e.g. "Idea". Consecutive steps sharing a label collapse
   * into one stepper entry, which is how a flow's step 2 covers both its
   * picker stage and the plan review that follows it (PRD § 6.2 table).
   */
  label: string;
  /** Primary button label. It names the outcome: "Generate your storyboard". */
  primaryLabel: string;
  /** The step body. */
  render: () => ReactNode;
  /** False disables the primary button — nothing chosen yet. */
  canAdvance?: boolean;
  /**
   * The step's action: the flow's plan generator on the shape step, its
   * generate action on the last one. The stage moves only after this resolves,
   * so a rejected Director call leaves the creator where they were with the
   * message on the button (PRD § 7.2).
   */
  onAdvance?: () => void | Promise<void>;
  /**
   * Pending state owned elsewhere (a mutation, a queued job). The shell also
   * marks itself busy while it awaits `onAdvance`; either one disables the
   * primary button.
   */
  pending?: boolean;
  /**
   * Rendered beside the primary button — the cost estimate on a generate step.
   * PRD § 6.2: nothing shows when nothing was measured, so pass `undefined`.
   */
  primaryDetail?: ReactNode;
}

export interface SetupFlowConfig<Stage extends string> {
  labels: SetupFlowLabels;
  steps: SetupStep<Stage>[];
  /** The document's current stage. The flow is a function of it. */
  stage: Stage;
  /** Advance or rewind by writing the stage back onto the document. */
  onStageChange: (stage: Stage) => void;
}
