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
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
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
  Record<WorkflowSetupRunMode, { labelKey: string; detailKey: string }>
> = {
  manual: {
    labelKey: "nextSteps.manual.label",
    detailKey: "nextSteps.manual.detail"
  },
  app: {
    labelKey: "nextSteps.app.label",
    detailKey: "nextSteps.app.detail"
  },
  trigger: {
    labelKey: "nextSteps.trigger.label",
    detailKey: "nextSteps.trigger.detail"
  }
};

export interface WorkflowLandingChecklistProps {
  result: BuildFromPlanResult;
  runMode: WorkflowSetupRunMode;
  /** Performs the named next operation for the selected run mode. */
  onNextStep: () => void | Promise<void>;
  nextStepPending?: boolean;
  /**
   * Hands the agent panel the first message: the error, with the fix proposed.
   * The creator sends it; this component never applies anything itself.
   */
  onAskAgent: (message: string) => void;
}

/** The message the agent panel opens with when the build did not come out clean. */
export const buildFailureMessage = (
  result: BuildFromPlanResult,
  t: TFunction
): string | null => {
  if (result.validationError !== undefined) {
    return [
      t("pass3_15.landingChecklist.failure.validationCouldNotRun", {
        detail: result.validationError
      }),
      "",
      t("pass3_15.landingChecklist.failure.repairValidationCouldNotRun")
    ].join("\n");
  }
  if (result.validationErrors.length > 0) {
    return [
      t("pass3_15.landingChecklist.failure.graphInvalid"),
      ...result.validationErrors.map((error) => `- ${error}`),
      "",
      t("pass3_15.landingChecklist.failure.repairGraphInvalid")
    ].join("\n");
  }
  if (result.issues.length > 0) {
    return [
      t("pass3_15.landingChecklist.failure.graphUnwired"),
      ...result.issues.map((issue) => `- ${issue}`),
      "",
      t("pass3_15.landingChecklist.failure.repairGraphUnwired")
    ].join("\n");
  }
  if (result.testRun.error !== null) {
    return [
      result.testRun.started
        ? t("pass3_15.landingChecklist.failure.testRunFailed", {
            detail: result.testRun.error
          })
        : t("pass3_15.landingChecklist.failure.testRunDidNotStart", {
            detail: result.testRun.error
          }),
      "",
      t("pass3_15.landingChecklist.failure.repairTestRun")
    ].join("\n");
  }
  if (result.status === "failed") {
    return [
      result.explanation,
      "",
      t("pass3_15.landingChecklist.failure.repairBuildFailed")
    ].join("\n");
  }
  return null;
};

const outputDetail = (output: unknown, t: TFunction): string => {
  if (output === null || output === undefined) {
    return t("pass3_15.landingChecklist.output.ready");
  }
  if (typeof output === "string") {
    return output.length > 0
      ? t("pass3_15.landingChecklist.output.value", { value: output })
      : t("pass3_15.landingChecklist.output.ready");
  }
  if (Array.isArray(output)) {
    return t("pass3_15.landingChecklist.output.valueCount", {
      count: output.length
    });
  }
  if (typeof output === "object") {
    const keys = Object.keys(output);
    return keys.length > 0
      ? t("pass3_15.landingChecklist.output.fields", {
          fields: keys.join(", ")
        })
      : t("pass3_15.landingChecklist.output.ready");
  }
  return t("pass3_15.landingChecklist.output.value", { value: String(output) });
};

type LineTone = "done" | "rendering" | "failed" | "neutral";

interface LineState {
  tone: LineTone;
  /** The pill's word. */
  pill: string;
  detail: string;
}

/** The `Validated` line, read from where the build got to. */
const validationLine = (
  result: BuildFromPlanResult,
  t: TFunction
): LineState => {
  if (result.status === "built") {
    return {
      tone: "rendering",
      pill: t("pass3_15.landingChecklist.pills.checking"),
      detail: t("pass3_15.landingChecklist.validation.checking")
    };
  }
  if (result.validationError !== undefined) {
    return {
      tone: "failed",
      pill: t("pass3_15.landingChecklist.pills.failed"),
      detail: t("pass3_15.landingChecklist.validation.couldNotRun")
    };
  }
  if (result.validationPending) {
    return {
      tone: "neutral",
      pill: t("pass3_15.landingChecklist.pills.unknown"),
      detail:
        result.status === "unrecorded"
          ? t("pass3_15.landingChecklist.validation.resultNotRecorded")
          : t("pass3_15.landingChecklist.validation.notChecked")
    };
  }
  if (result.validationErrors.length > 0) {
    const count = result.validationErrors.length;
    return {
      tone: "failed",
      pill: t("pass3_15.landingChecklist.pills.failed"),
      detail: t("pass3_15.landingChecklist.validation.errors", { count })
    };
  }
  if (result.issues.length > 0) {
    return {
      tone: "failed",
      pill: t("pass3_15.landingChecklist.pills.failed"),
      detail: t("pass3_15.landingChecklist.validation.unwired")
    };
  }
  return {
    tone: "done",
    pill: t("pass3_15.landingChecklist.pills.validated"),
    detail: t("pass3_15.landingChecklist.validation.noProblems")
  };
};

/** The `Test run` line. Why a run did not start matters as much as that it did not. */
const testRunLine = (result: BuildFromPlanResult, t: TFunction): LineState => {
  switch (result.status) {
    case "completed-with-output":
      return {
        tone: "done",
        pill: t("pass3_15.landingChecklist.pills.completed"),
        detail: outputDetail(result.output ?? result.testRun.output, t)
      };
    case "running":
      return {
        tone: "rendering",
        pill: t("pass3_15.landingChecklist.pills.running"),
        detail: t("pass3_15.landingChecklist.testRun.running")
      };
    case "built":
    case "validated":
      return {
        tone: "neutral",
        pill: t("pass3_15.landingChecklist.pills.waiting"),
        detail: t("pass3_15.landingChecklist.testRun.notRun")
      };
    case "canceled":
      return {
        tone: "neutral",
        pill: t("pass3_15.landingChecklist.pills.canceled"),
        detail: t("pass3_15.landingChecklist.testRun.canceled")
      };
    case "unrecorded":
      return {
        tone: "neutral",
        pill: t("pass3_15.landingChecklist.pills.unknown"),
        detail: t("pass3_15.landingChecklist.testRun.resultNotRecorded")
      };
    case "failed":
      break;
  }
  if (result.testRun.started) {
    return {
      tone: "failed",
      pill: t("pass3_15.landingChecklist.pills.failed"),
      detail: result.testRun.error
        ? t("pass3_15.landingChecklist.testRun.failedWithDetail", {
            detail: result.testRun.error
          })
        : t("pass3_15.landingChecklist.testRun.failed")
    };
  }
  if (result.validationError !== undefined) {
    return {
      tone: "neutral",
      pill: t("pass3_15.landingChecklist.pills.skipped"),
      detail: t("pass3_15.landingChecklist.testRun.notRun")
    };
  }
  if (result.testRun.error !== null) {
    return {
      tone: "failed",
      pill: t("pass3_15.landingChecklist.pills.failed"),
      detail: t("pass3_15.landingChecklist.testRun.didNotStartWithDetail", {
        detail: result.testRun.error
      })
    };
  }
  return {
    tone: "neutral",
    pill: t("pass3_15.landingChecklist.pills.skipped"),
    detail:
      result.validationErrors.length > 0
        ? t("pass3_15.landingChecklist.testRun.notStartedInvalid")
        : result.issues.length > 0
          ? t("pass3_15.landingChecklist.testRun.notStartedUnwired")
          : t("pass3_15.landingChecklist.testRun.notStartedBuildStopped")
  };
};

const ChecklistInternal: React.FC<WorkflowLandingChecklistProps> = ({
  result,
  runMode,
  onNextStep,
  nextStepPending = false,
  onAskAgent
}) => {
  const { t } = useTranslation();
  const failure = buildFailureMessage(result, t);
  const next = NEXT_STEP[runMode];

  return (
    <FlexColumn gap={GAP.normal}>
      <Line
        tone="done"
        pill={t("pass3_15.landingChecklist.pills.built")}
        label={t("pass3_15.landingChecklist.graphBuilt.label")}
        detail={t("pass3_15.landingChecklist.graphBuilt.detail", {
          count: result.nodeCount
        })}
      />
      <Line
        label={t("pass3_15.landingChecklist.validation.label")}
        {...validationLine(result, t)}
      />
      {/* The creator was told on the setup step that building would run it
          once, so a missing run is a promise this screen has to account for
          (F1, F8). */}
      <Line
        label={t("pass3_15.landingChecklist.testRun.label")}
        {...testRunLine(result, t)}
      />

      {failure === null ? (
        <FlexRow gap={GAP.normal} align="center">
          <EditorButton
            variant="contained"
            onClick={() => void onNextStep()}
            disabled={nextStepPending}
          >
            {t(`pass3_15.landingChecklist.${next.labelKey}`)}
          </EditorButton>
          <Caption color="secondary">
            {t(`pass3_15.landingChecklist.${next.detailKey}`)}
          </Caption>
        </FlexRow>
      ) : (
        <AlertBanner
          severity="error"
          title={t("pass3_15.landingChecklist.failure.title")}
          action={
            <EditorButton variant="text" onClick={() => onAskAgent(failure)}>
              {t("pass3_15.landingChecklist.failure.askAgent")}
            </EditorButton>
          }
        >
          {/* The summary paragraph only: the repair instructions after the
              blank line are addressed to the agent, not the creator. */}
          <Caption component="span" sx={{ whiteSpace: "pre-line" }}>
            {failure.split("\n\n")[0]}
          </Caption>
        </AlertBanner>
      )}
    </FlexColumn>
  );
};

interface LineProps extends LineState {
  label: string;
}

const Line: React.FC<LineProps> = ({ tone, pill, label, detail }) => (
  <FlexRow gap={GAP.normal} align="center">
    <StatusPill tone={tone}>{pill}</StatusPill>
    <Text size="small" component="span">
      {label}
    </Text>
    <Caption color="secondary">{detail}</Caption>
  </FlexRow>
);

export const WorkflowLandingChecklist = memo(ChecklistInternal);
WorkflowLandingChecklist.displayName = "WorkflowLandingChecklist";

export default WorkflowLandingChecklist;
