/** @jsxImportSource @emotion/react */
import React, { memo, useEffect, useState } from "react";
import { css } from "@emotion/react";
import { useTheme, type Theme } from "@mui/material/styles";
import { Button } from "@mui/material";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { hintPop, arrowBounce } from "./animations";
import type { OnboardingStepDefinition } from "./steps";

interface OnboardingHintProps {
  step: OnboardingStepDefinition;
  target: HTMLElement | null;
  isCompleted: boolean;
  onSkipStep: () => void;
  onContinue: () => void;
  onClose: () => void;
}

interface Position {
  top: number;
  left: number;
  placement: "top" | "bottom" | "left" | "right" | "center";
}

const HINT_OFFSET = 16;
const HINT_WIDTH = 320;
const HINT_HEIGHT_ESTIMATE = 180;

const computePosition = (
  rect: DOMRect | null,
  preferred: OnboardingStepDefinition["hintPlacement"]
): Position => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (!rect || preferred === "center") {
    return {
      top: vh / 2 - HINT_HEIGHT_ESTIMATE / 2,
      left: vw / 2 - HINT_WIDTH / 2,
      placement: "center"
    };
  }

  const placement = preferred ?? "bottom";

  let top = 0;
  let left = 0;

  switch (placement) {
    case "top":
      top = rect.top - HINT_HEIGHT_ESTIMATE - HINT_OFFSET;
      left = rect.left + rect.width / 2 - HINT_WIDTH / 2;
      break;
    case "bottom":
      top = rect.bottom + HINT_OFFSET;
      left = rect.left + rect.width / 2 - HINT_WIDTH / 2;
      break;
    case "left":
      top = rect.top + rect.height / 2 - HINT_HEIGHT_ESTIMATE / 2;
      left = rect.left - HINT_WIDTH - HINT_OFFSET;
      break;
    case "right":
      top = rect.top + rect.height / 2 - HINT_HEIGHT_ESTIMATE / 2;
      left = rect.right + HINT_OFFSET;
      break;
  }

  // Clamp into the viewport with a 16 px gutter.
  top = Math.max(16, Math.min(top, vh - HINT_HEIGHT_ESTIMATE - 16));
  left = Math.max(16, Math.min(left, vw - HINT_WIDTH - 16));

  return { top, left, placement };
};

const styles = (theme: Theme, accent: { from: string; to: string }) =>
  css({
    position: "fixed",
    width: HINT_WIDTH,
    zIndex: 2100,
    pointerEvents: "auto",
    animation: `${hintPop} 320ms cubic-bezier(0.22, 0.61, 0.36, 1) both`,

    ".hint-card": {
      position: "relative",
      borderRadius: 16,
      padding: "16px 18px 14px",
      backgroundColor: theme.vars.palette.grey[900],
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      boxShadow: "0 18px 48px rgba(0,0,0,0.55)",
      backdropFilter: "blur(14px)"
    },
    ".hint-accent-bar": {
      position: "absolute",
      top: 0,
      left: 12,
      right: 12,
      height: 3,
      borderRadius: "0 0 3px 3px",
      background: `linear-gradient(90deg, ${accent.from}, ${accent.to})`
    },

    ".hint-header": {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 6
    },
    ".hint-step-badge": {
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      padding: "2px 8px",
      borderRadius: 999,
      color: "#fff",
      background: `linear-gradient(120deg, ${accent.from}, ${accent.to})`
    },
    ".hint-close": {
      marginLeft: "auto",
      width: 24,
      height: 24,
      borderRadius: "50%",
      border: "none",
      backgroundColor: "transparent",
      color: theme.vars.palette.grey[400],
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[800],
        color: theme.vars.palette.grey[100]
      }
    },
    ".hint-title": {
      fontSize: 14,
      fontWeight: 600,
      color: theme.vars.palette.text.primary,
      margin: 0
    },
    ".hint-body": {
      fontSize: 12.5,
      lineHeight: 1.55,
      color: theme.vars.palette.grey[300],
      marginTop: 6,
      marginBottom: 0
    },
    ".hint-footer": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      marginTop: 12
    },
    ".hint-status": {
      display: "flex",
      alignItems: "center",
      gap: 6,
      fontSize: 12,
      color: theme.vars.palette.grey[400],
      "& svg": {
        animation: `${arrowBounce} 1.4s ease-in-out infinite`
      }
    },
    ".hint-status.done": {
      color: theme.vars.palette.success.main
    },

    ".hint-skip": {
      fontSize: 12,
      textTransform: "none",
      padding: "4px 10px",
      borderRadius: 8,
      color: theme.vars.palette.grey[400]
    },
    ".hint-continue": {
      fontSize: 12,
      textTransform: "none",
      padding: "5px 12px",
      borderRadius: 8,
      fontWeight: 600,
      background: `linear-gradient(120deg, ${accent.from}, ${accent.to})`,
      color: "#fff",
      "&:hover": {
        background: `linear-gradient(120deg, ${accent.from}, ${accent.to})`,
        filter: "brightness(1.1)"
      }
    }
  });

const OnboardingHint: React.FC<OnboardingHintProps> = ({
  step,
  target,
  isCompleted,
  onSkipStep,
  onContinue,
  onClose
}) => {
  const theme = useTheme();
  const [position, setPosition] = useState<Position>(() =>
    computePosition(null, step.hintPlacement)
  );

  useEffect(() => {
    const update = (): void => {
      const rect = target ? target.getBoundingClientRect() : null;
      setPosition(computePosition(rect, step.hintPlacement));
    };
    update();

    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    let ro: ResizeObserver | null = null;
    if (target) {
      ro = new ResizeObserver(update);
      ro.observe(target);
    }

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      ro?.disconnect();
    };
  }, [target, step.hintPlacement]);

  return (
    <div
      css={styles(theme, step.accent)}
      style={{ top: position.top, left: position.left }}
      role="dialog"
      aria-label={step.hintTitle}
    >
      <div className="hint-card">
        <div className="hint-accent-bar" />
        <div className="hint-header">
          <span className="hint-step-badge">{step.tagline}</span>
          <button
            type="button"
            className="hint-close"
            onClick={onClose}
            aria-label="Close onboarding"
          >
            <CloseRoundedIcon sx={{ fontSize: 14 }} />
          </button>
        </div>
        <h3 className="hint-title">{step.hintTitle}</h3>
        <p className="hint-body">{step.hintBody}</p>
        <div className="hint-footer">
          <div className={`hint-status${isCompleted ? " done" : ""}`}>
            {isCompleted ? (
              <>
                <CheckCircleRoundedIcon sx={{ fontSize: 16 }} />
                <span>Nicely done</span>
              </>
            ) : (
              <>
                <ArrowForwardRoundedIcon sx={{ fontSize: 16 }} />
                <span>Waiting for you…</span>
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Button className="hint-skip" size="small" onClick={onSkipStep}>
              Skip
            </Button>
            <Button
              className="hint-continue"
              size="small"
              onClick={onContinue}
              disableElevation
            >
              {isCompleted ? "Continue" : "I'll do it later"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(OnboardingHint);
