/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo } from "react";
import { useShallow } from "zustand/react/shallow";
import useOnboardingStore, {
  type OnboardingStepId
} from "../../stores/OnboardingStore";
import { BORDER_RADIUS, MOTION, SPACING, getSpacingPx } from "../ui_primitives";

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
      background: "none",
      border: "none",
      padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.md)}`,
      borderRadius: BORDER_RADIUS.md,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.disabled,
      cursor: "pointer",
      "&:hover": {
        color: theme.vars.palette.text.primary,
        background: theme.vars.palette.action.hover
      }
    }
  });

interface ChecklistStep {
  id: OnboardingStepId | "connect-provider";
  label: string;
  done: boolean;
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
      label: "Connect an AI provider",
      done: hasConfiguredProvider,
      onClick: onConnectProvider
    },
    {
      id: "start-guided-flow",
      label: "Start a guided flow",
      done: completedSteps.includes("start-guided-flow"),
      // The cards live further down this surface; the pill takes the user
      // to them, starting one marks the step.
      onClick: onStartGuidedFlow
    },
    {
      id: "describe-idea",
      label: "Describe what you want to make",
      done: completedSteps.includes("describe-idea"),
      // The composer below the cards is the way there; pressing Start
      // marks the step.
      onClick: onDescribeIdea
    },
    {
      id: "keep-creating",
      label: "Open an example or a blank doc",
      done: completedSteps.includes("keep-creating"),
      onClick: onOpenExamples
    }
  ];

  const doneCount = steps.filter((s) => s.done).length;
  if (dismissed || doneCount === steps.length) {
    return null;
  }

  return (
    <section css={styles(theme)} aria-label="Getting started checklist">
      <div>
        <div className="checklist-inner">
          <span className="checklist-label">
            Getting started · {doneCount}/{steps.length}
          </span>
          {steps.map((step) => (
            <button
              key={step.id}
              type="button"
              className="checklist-step"
              onClick={step.onClick}
              disabled={step.done}
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
              {step.label}
            </button>
          ))}
          <button
            type="button"
            className="checklist-dismiss"
            onClick={dismiss}
            aria-label="Dismiss getting started checklist"
          >
            Dismiss
          </button>
        </div>
      </div>
    </section>
  );
};

export default memo(GettingStartedChecklist);
