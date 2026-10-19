/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import useOnboardingStore, {
  type OnboardingStepId
} from "../../stores/OnboardingStore";
import {
  BORDER_RADIUS,
  CONTROL,
  MOTION,
  SPACING,
  getSpacingPx,
  EditorButton
} from "../ui_primitives";

const styles = (theme: Theme) =>
  css({
    width: "100%",

    ".checklist-inner": {
      justifyContent: "center",
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.lg),
      flexWrap: "wrap",
      padding: `${getSpacingPx(SPACING.lg)} 0` // was 10px 0
    },
    ".checklist-label": {
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      textTransform: "uppercase" as const,
      letterSpacing: "0.08em",
      color: theme.vars.palette.text.disabled,
      marginRight: getSpacingPx(SPACING.xs)
    },
    ".checklist-step": {
      display: "inline-flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.sm),
      height: 30,
      padding: `0 ${getSpacingPx(SPACING.lg)}`,
      borderRadius: BORDER_RADIUS.pill,
      border: `1px solid ${theme.vars.palette.divider}`,
      background: "transparent",
      color: theme.vars.palette.text.secondary,
      fontSize: "var(--fontSizeSmall)",
      cursor: "pointer",
      transition: `border-color ${MOTION.fast}, color ${MOTION.fast}`,
      "&:hover": {
        borderColor: theme.vars.palette.action.focus,
        color: theme.vars.palette.text.primary
      },
      "&:disabled": {
        cursor: "default",
        color: theme.vars.palette.text.disabled,
        textDecoration: "line-through",
        "&:hover": { borderColor: theme.vars.palette.divider }
      },
      // A finished step that still opens its place, such as the provider
      // dialog where a key is replaced.
      "&.reopens": {
        color: theme.vars.palette.text.disabled
      }
    },
    ".checklist-check": {
      display: "inline-flex",
      width: 15,
      height: 15,
      borderRadius: BORDER_RADIUS.circle,
      border: `1.5px solid ${theme.vars.palette.text.disabled}`,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      "&.done": {
        border: "none",
        background: theme.vars.palette.success.main,
        color: theme.vars.palette.success.contrastText
      }
    },
    ".checklist-dismiss": {
      marginLeft: 0,
      color: theme.vars.palette.text.disabled
    },


    // Phones: the pills wrapped into a ragged centered cloud. Stack the open
    // steps as full-width rows under a label/dismiss header, and drop the
    // finished ones — the count already says how far along the user is.
    [theme.breakpoints.down("sm")]: {
      ".checklist-inner": {
        justifyContent: "flex-start",
        gap: getSpacingPx(SPACING.sm),
        padding: 0
      },
      ".checklist-label": {
        order: -2,
        flex: 1,
        marginRight: 0
      },
      ".checklist-dismiss": {
        order: -1,
        minHeight: CONTROL.height.xl
      },
      ".checklist-step": {
        flexBasis: "100%",
        height: CONTROL.height.xl,
        padding: `0 ${getSpacingPx(SPACING.lg)}`,
        borderRadius: BORDER_RADIUS.lg,
        "&:disabled, &.reopens": { display: "none" }
      }
    }
  });

interface ChecklistStep {
  id: OnboardingStepId | "connect-provider";
  label: string;
  done: boolean;
  /** Stays clickable once done, under this label. */
  doneLabel?: string;
  onClick: () => void;
}

interface GettingStartedChecklistProps {
  hasConfiguredProvider: boolean;
  onConnectProvider: () => void;
  onStartGuidedFlow: () => void;
  onDescribeIdea: () => void;
  onOpenExamples: () => void;
}

/**
 * Slim first-run checklist for the new-project surface: connect a provider,
 * start a guided flow, describe an idea for the project agent, and keep
 * creating from examples or blank documents. Each pill guides — it scrolls to
 * or opens the surface section behind the step — while OnboardingStore marks
 * the step once the thing is actually done (provider state is derived live
 * from secrets). Hidden once every step is done or the user dismisses it —
 * so a host can mount it unconditionally.
 */
const GettingStartedChecklist: React.FC<GettingStartedChecklistProps> = ({
  hasConfiguredProvider,
  onConnectProvider,
  onStartGuidedFlow,
  onDescribeIdea,
  onOpenExamples
}) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { completedSteps, dismissed, dismiss } = useOnboardingStore(
    useShallow((s) => ({
      completedSteps: s.completedSteps,
      dismissed: s.dismissed,
      dismiss: s.dismiss
    }))
  );

  const steps: ChecklistStep[] = [
    {
      id: "connect-provider",
      label: t("batch2_5.gettingStartedChecklist.steps.connectProvider"),
      done: hasConfiguredProvider,
      // The dialog is where a key is replaced or another provider added, and
      // a disabled pill left people hunting for another way back to it.
      doneLabel: t("batch2_5.gettingStartedChecklist.steps.providerConnected"),
      onClick: onConnectProvider
    },
    {
      id: "start-guided-flow",
      label: t("batch2_5.gettingStartedChecklist.steps.startGuidedFlow"),
      done: completedSteps.includes("start-guided-flow"),
      // The cards live further down this surface; the pill takes the user
      // to them, starting one marks the step.
      onClick: onStartGuidedFlow
    },
    {
      id: "describe-idea",
      label: t("batch2_5.gettingStartedChecklist.steps.describeIdea"),
      done: completedSteps.includes("describe-idea"),
      // The composer below the cards is the way there; pressing Start
      // marks the step.
      onClick: onDescribeIdea
    },
    {
      id: "keep-creating",
      label: t("batch2_5.gettingStartedChecklist.steps.openExampleOrBlankDoc"),
      done: completedSteps.includes("keep-creating"),
      onClick: onOpenExamples
    }
  ];

  const doneCount = steps.filter((s) => s.done).length;
  if (dismissed || doneCount === steps.length) {
    return null;
  }

  return (
    <section
      css={styles(theme)}
      aria-label={t("batch2_5.gettingStartedChecklist.ariaLabel")}
    >
      <div>
        <div className="checklist-inner">
          <span className="checklist-label">
            {t("batch2_5.gettingStartedChecklist.progress", {
              done: doneCount,
              total: steps.length
            })}
          </span>
          {steps.map((step) => (
            <button
              key={step.id}
              type="button"
              className={`checklist-step${
                step.done && step.doneLabel ? " reopens" : ""
              }`}
              onClick={step.onClick}
              disabled={step.done && !step.doneLabel}
            >
              <span className={`checklist-check${step.done ? " done" : ""}`}>
                {step.done && (
                  <svg
                    width="9"
                    height="9"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="m3 8.5 3.5 3.5L13 5" />
                  </svg>
                )}
              </span>
              {step.done && step.doneLabel ? step.doneLabel : step.label}
            </button>
          ))}
          <EditorButton
            variant="text"
            color="inherit"
            className="checklist-dismiss"
            onClick={dismiss}
            aria-label={t("batch2_5.gettingStartedChecklist.dismissAriaLabel")}
          >
            {t("batch2_5.gettingStartedChecklist.dismiss")}
          </EditorButton>
        </div>
      </div>
    </section>
  );
};

export default memo(GettingStartedChecklist);
