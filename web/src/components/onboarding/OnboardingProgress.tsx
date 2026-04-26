/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { css } from "@emotion/react";
import { useTheme, type Theme } from "@mui/material/styles";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import {
  ONBOARDING_STEP_ORDER,
  type OnboardingStepId
} from "../../stores/OnboardingStore";

interface OnboardingProgressProps {
  currentStep: number;
  completed: Record<OnboardingStepId, boolean>;
  onJump?: (index: number) => void;
}

const styles = (theme: Theme) =>
  css({
    display: "flex",
    alignItems: "center",
    gap: 6,

    ".progress-dot": {
      position: "relative",
      width: 22,
      height: 22,
      borderRadius: "50%",
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      backgroundColor: "rgba(255,255,255,0.04)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      color: theme.vars.palette.grey[500],
      transition: "all 220ms ease",
      padding: 0,
      fontSize: 11,
      fontWeight: 600,
      lineHeight: 1
    },
    ".progress-dot.done": {
      backgroundColor: theme.vars.palette.success.main,
      borderColor: theme.vars.palette.success.main,
      color: "#fff"
    },
    ".progress-dot.active": {
      borderColor: theme.vars.palette.primary.main,
      backgroundColor: `color-mix(in srgb, ${theme.vars.palette.primary.main} 25%, transparent)`,
      color: theme.vars.palette.primary.light,
      boxShadow: `0 0 0 4px color-mix(in srgb, ${theme.vars.palette.primary.main} 18%, transparent)`,
      transform: "scale(1.08)"
    },
    ".progress-line": {
      width: 14,
      height: 2,
      backgroundColor: theme.vars.palette.grey[700],
      borderRadius: 1
    },
    ".progress-line.done": {
      backgroundColor: theme.vars.palette.success.main
    }
  });

const OnboardingProgress: React.FC<OnboardingProgressProps> = ({
  currentStep,
  completed,
  onJump
}) => {
  const theme = useTheme();
  const completedCount = ONBOARDING_STEP_ORDER.reduce(
    (acc, id) => acc + (completed[id] ? 1 : 0),
    0
  );
  return (
    <div
      css={styles(theme)}
      role="group"
      aria-label={`Onboarding steps — ${completedCount} of ${ONBOARDING_STEP_ORDER.length} completed`}
    >
      {ONBOARDING_STEP_ORDER.map((id, idx) => {
        const isDone = completed[id];
        const isActive = idx === currentStep;
        return (
          <React.Fragment key={id}>
            <button
              type="button"
              className={`progress-dot${isDone ? " done" : ""}${isActive ? " active" : ""}`}
              onClick={() => onJump?.(idx)}
              aria-label={`Step ${idx + 1}${isDone ? " (completed)" : ""}${isActive ? " (current)" : ""}`}
              aria-current={isActive ? "step" : undefined}
            >
              {isDone ? (
                <CheckRoundedIcon sx={{ fontSize: 14 }} />
              ) : (
                idx + 1
              )}
            </button>
            {idx < ONBOARDING_STEP_ORDER.length - 1 && (
              <div className={`progress-line${isDone ? " done" : ""}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default memo(OnboardingProgress);
