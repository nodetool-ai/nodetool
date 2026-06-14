/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo } from "react";
import { useShallow } from "zustand/react/shallow";
import useOnboardingStore, {
  type OnboardingStepId
} from "../../stores/OnboardingStore";
import { wrapStyles } from "./dashboardChrome";

const styles = (theme: Theme) =>
  css({
    borderBottom: `1px solid ${theme.vars.palette.divider}`,

    ".checklist-inner": {
      display: "flex",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap",
      padding: "10px 0"
    },
    ".checklist-label": {
      fontFamily: theme.fontFamily2,
      fontSize: 12,
      textTransform: "uppercase" as const,
      letterSpacing: "0.08em",
      color: theme.vars.palette.text.disabled,
      marginRight: 4
    },
    ".checklist-step": {
      display: "inline-flex",
      alignItems: "center",
      gap: 7,
      height: 30,
      padding: "0 12px",
      borderRadius: 9999,
      border: `1px solid ${theme.vars.palette.divider}`,
      background: "transparent",
      color: theme.vars.palette.text.secondary,
      fontSize: 13,
      cursor: "pointer",
      transition: "border-color 0.15s ease, color 0.15s ease",
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
      borderRadius: 9999,
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
      marginLeft: "auto",
      background: "none",
      border: "none",
      padding: "4px 8px",
      borderRadius: 6,
      fontSize: 12,
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
  onOpenTemplates: () => void;
  onCreateWorkflow: () => void;
}

/**
 * Slim first-run checklist under the dashboard hero: connect a provider,
 * open a template, run it, build your own. Steps complete via
 * OnboardingStore markers (provider state is derived live from secrets).
 * Hidden once every step is done or the user dismisses it.
 */
const GettingStartedChecklist: React.FC<GettingStartedChecklistProps> = ({
  hasConfiguredProvider,
  onConnectProvider,
  onOpenTemplates,
  onCreateWorkflow
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
      id: "open-template",
      label: "Open a starter or template",
      done: completedSteps.includes("open-template"),
      onClick: onOpenTemplates
    },
    {
      id: "run-workflow",
      label: "Run a workflow",
      done: completedSteps.includes("run-workflow"),
      // Running happens in the editor; opening a template is the way there.
      onClick: onOpenTemplates
    },
    {
      id: "create-workflow",
      label: "Build your own",
      done: completedSteps.includes("create-workflow"),
      onClick: onCreateWorkflow
    }
  ];

  const doneCount = steps.filter((s) => s.done).length;
  if (dismissed || doneCount === steps.length) {
    return null;
  }

  return (
    <section css={styles(theme)} aria-label="Getting started checklist">
      <div css={wrapStyles(theme)}>
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
