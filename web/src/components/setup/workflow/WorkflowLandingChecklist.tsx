/**
 * The landing checklist, at the top of the agent panel (PRD § 11.4).
 *
 * Four lines: `Graph built`, `Validated`, `Test run` with its outcome, and the
 * next step the chosen run mode implies. A validation error or a failed run
 * shows the error here and offers the fix as a message to the agent —
 * **nothing is applied without the creator's click**, which is the rule the PRD
 * states outright and this component enforces by having no apply path at all.
 */

import React, { memo } from "react";
import type { WorkflowSetupRunMode } from "@nodetool-ai/protocol/api-schemas/workflows.js";

import {
  AlertBanner,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  StatusPill,
  Text
} from "../../ui_primitives";
import type { BuildFromPlanResult } from "../../../hooks/workflow/useBuildFromPlan";

/** What each run mode leaves to do once the graph runs (PRD § 11.4). */
const NEXT_STEP: Readonly<
  Record<WorkflowSetupRunMode, { label: string; detail: string }>
> = {
  manual: { label: "Run it again", detail: "Change the inputs and press run." },
  app: { label: "Save as app", detail: "Put a form over these inputs." },
  trigger: {
    label: "Add a trigger",
    detail: "Start it on a schedule or a webhook."
  }
};

export interface WorkflowLandingChecklistProps {
  result: BuildFromPlanResult;
  runMode: WorkflowSetupRunMode;
  /** Opens the run mode's next step — the app builder, the trigger editor. */
  onNextStep: () => void;
  /**
   * Hands the agent panel the first message: the error, with the fix proposed.
   * The creator sends it; this component never applies anything itself.
   */
  onAskAgent: (message: string) => void;
}

/** The message the agent panel opens with when the build did not come out clean. */
export const buildFailureMessage = (result: BuildFromPlanResult): string | null => {
  if (result.validationErrors.length > 0) {
    return [
      "The graph I just built does not validate:",
      ...result.validationErrors.map((error) => `- ${error}`),
      "",
      "Propose a fix and wait for me before changing the graph."
    ].join("\n");
  }
  if (result.issues.length > 0) {
    return [
      "The graph I just built validates, but part of the plan was never wired:",
      ...result.issues.map((issue) => `- ${issue}`),
      "",
      "That means it can run and produce nothing. Propose a fix and wait for me."
    ].join("\n");
  }
  if (result.testRun.error !== null) {
    return [
      `The test run did not start: ${result.testRun.error}`,
      "",
      "Propose a fix and wait for me before changing the graph."
    ].join("\n");
  }
  return null;
};

const ChecklistInternal: React.FC<WorkflowLandingChecklistProps> = ({
  result,
  runMode,
  onNextStep,
  onAskAgent
}) => {
  const validated = result.validationErrors.length === 0;
  const wired = result.issues.length === 0;
  const failure = buildFailureMessage(result);
  const next = NEXT_STEP[runMode];

  return (
    <FlexColumn gap={GAP.normal}>
      <Line
        done
        label="Graph built"
        detail={`${result.nodeCount} node${result.nodeCount === 1 ? "" : "s"} placed`}
      />
      <Line
        done={validated && wired}
        label="Validated"
        detail={
          validated
            ? wired
              ? "No problems found"
              : "Validates, but part of the plan is unwired"
            : `${result.validationErrors.length} error${
                result.validationErrors.length === 1 ? "" : "s"
              }`
        }
      />
      {/* Why a run did not start matters more than that it did not: the
          creator was told on the setup step that building would run it once,
          so a missing run is a promise this screen has to account for (F1, F8). */}
      <Line
        done={result.testRun.started}
        label="Test run"
        detail={
          result.testRun.started
            ? "Started with your sample inputs"
            : (result.testRun.error ??
              (validated
                ? "Not started — part of the plan is unwired"
                : "Not started — the graph did not validate"))
        }
      />

      {failure === null ? (
        <FlexRow gap={GAP.normal} align="center">
          <EditorButton variant="contained" onClick={onNextStep}>
            {next.label}
          </EditorButton>
          <Caption color="secondary">{next.detail}</Caption>
        </FlexRow>
      ) : (
        <AlertBanner
          severity="error"
          title="This needs a fix before it works"
          action={
            <EditorButton variant="text" onClick={() => onAskAgent(failure)}>
              Ask the agent
            </EditorButton>
          }
        >
          <Caption component="span">{failure.split("\n")[0]}</Caption>
        </AlertBanner>
      )}
    </FlexColumn>
  );
};

interface LineProps {
  done: boolean;
  label: string;
  detail: string;
}

const Line: React.FC<LineProps> = ({ done, label, detail }) => (
  <FlexRow gap={GAP.normal} align="center">
    <StatusPill tone={done ? "done" : "failed"}>{done ? "done" : "todo"}</StatusPill>
    <Text size="small" component="span">
      {label}
    </Text>
    <Caption color="secondary">{detail}</Caption>
  </FlexRow>
);

export const WorkflowLandingChecklist = memo(ChecklistInternal);
WorkflowLandingChecklist.displayName = "WorkflowLandingChecklist";

export default WorkflowLandingChecklist;
