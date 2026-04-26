/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { css } from "@emotion/react";
import { useTheme, type Theme } from "@mui/material/styles";
import { Button } from "@mui/material";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import {
  fadeInBackdrop,
  illustrationFloat,
  illustrationGlow,
  screenEnter
} from "./animations";
import type { OnboardingStepDefinition } from "./steps";
import OnboardingProgress from "./OnboardingProgress";
import type { OnboardingStepId } from "../../stores/OnboardingStore";

interface OnboardingScreenProps {
  step: OnboardingStepDefinition;
  index: number;
  total: number;
  completed: Record<OnboardingStepId, boolean>;
  isFirst: boolean;
  isLast: boolean;
  onPrimary: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onJump?: (idx: number) => void;
}

const styles = (theme: Theme, accent: { from: string; to: string }) =>
  css({
    position: "fixed",
    inset: 0,
    zIndex: 2000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,

    "&::before": {
      content: '""',
      position: "absolute",
      inset: 0,
      backgroundColor: "rgba(8, 12, 22, 0.74)",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
      animation: `${fadeInBackdrop} 280ms ease both`
    },

    ".onboarding-card": {
      position: "relative",
      width: "min(720px, 100%)",
      borderRadius: 24,
      padding: "40px 44px 32px",
      backgroundColor: theme.vars.palette.grey[900],
      border: `1px solid ${theme.vars.palette.grey[800]}`,
      boxShadow:
        "0 30px 80px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255,255,255,0.02) inset",
      animation: `${screenEnter} 460ms cubic-bezier(0.22, 0.61, 0.36, 1) both`,
      overflow: "hidden",

      "&::before": {
        content: '""',
        position: "absolute",
        top: -120,
        right: -120,
        width: 320,
        height: 320,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${accent.from}55 0%, transparent 70%)`,
        pointerEvents: "none"
      },
      "&::after": {
        content: '""',
        position: "absolute",
        bottom: -160,
        left: -160,
        width: 380,
        height: 380,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${accent.to}40 0%, transparent 70%)`,
        pointerEvents: "none"
      }
    },

    ".onboarding-card-content": {
      position: "relative",
      display: "flex",
      gap: 28,
      alignItems: "center",
      [theme.breakpoints.down("sm")]: {
        flexDirection: "column",
        textAlign: "center"
      }
    },

    ".onboarding-illustration": {
      flexShrink: 0,
      width: 128,
      height: 128,
      borderRadius: 32,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: `linear-gradient(135deg, ${accent.from}, ${accent.to})`,
      color: "#fff",
      animation: `${illustrationFloat} 6s ease-in-out infinite, ${illustrationGlow} 4s ease-in-out infinite`
    },

    ".onboarding-tagline": {
      fontSize: 12,
      fontWeight: 600,
      letterSpacing: "0.16em",
      textTransform: "uppercase",
      color: theme.vars.palette.grey[400],
      marginBottom: 8
    },
    ".onboarding-title": {
      fontSize: "2rem",
      fontWeight: 700,
      lineHeight: 1.15,
      margin: 0,
      color: theme.vars.palette.text.primary,
      background: `linear-gradient(120deg, ${accent.from}, ${accent.to})`,
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      backgroundClip: "text"
    },
    ".onboarding-description": {
      fontSize: "0.95rem",
      lineHeight: 1.55,
      color: theme.vars.palette.grey[300],
      marginTop: 12,
      marginBottom: 0,
      maxWidth: 480
    },

    ".onboarding-footer": {
      position: "relative",
      marginTop: 32,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      [theme.breakpoints.down("sm")]: {
        flexDirection: "column",
        gap: 12
      }
    },
    ".onboarding-actions": {
      display: "flex",
      alignItems: "center",
      gap: 8
    },

    ".onboarding-skip": {
      position: "absolute",
      top: 14,
      right: 14,
      width: 32,
      height: 32,
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      color: theme.vars.palette.grey[400],
      backgroundColor: "transparent",
      border: "none",
      transition: "all 160ms ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[800],
        color: theme.vars.palette.grey[100]
      }
    },

    ".onboarding-primary": {
      borderRadius: 12,
      padding: "10px 22px",
      fontWeight: 600,
      textTransform: "none",
      background: `linear-gradient(120deg, ${accent.from}, ${accent.to})`,
      color: "#fff",
      "&:hover": {
        background: `linear-gradient(120deg, ${accent.from}, ${accent.to})`,
        filter: "brightness(1.1)"
      }
    },
    ".onboarding-secondary": {
      borderRadius: 12,
      padding: "8px 14px",
      fontWeight: 500,
      textTransform: "none",
      color: theme.vars.palette.grey[300]
    }
  });

const OnboardingScreen: React.FC<OnboardingScreenProps> = ({
  step,
  index,
  completed,
  isFirst,
  isLast,
  onPrimary,
  onPrev,
  onSkip,
  onJump
}) => {
  const theme = useTheme();
  return (
    <div css={styles(theme, step.accent)} role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="onboarding-card">
        <button
          type="button"
          className="onboarding-skip"
          onClick={onSkip}
          aria-label="Skip onboarding"
        >
          <CloseRoundedIcon fontSize="small" />
        </button>

        <div className="onboarding-card-content">
          <div className="onboarding-illustration">{step.illustration}</div>
          <div>
            <div className="onboarding-tagline">{step.tagline}</div>
            <h1 id="onboarding-title" className="onboarding-title">
              {step.title}
            </h1>
            <p className="onboarding-description">{step.description}</p>
          </div>
        </div>

        <div className="onboarding-footer">
          <OnboardingProgress
            currentStep={index}
            completed={completed}
            onJump={onJump}
          />
          <div className="onboarding-actions">
            {!isFirst && (
              <Button
                className="onboarding-secondary"
                onClick={onPrev}
                startIcon={<ArrowBackRoundedIcon />}
              >
                Back
              </Button>
            )}
            <Button
              className="onboarding-primary"
              onClick={onPrimary}
              endIcon={<ArrowForwardRoundedIcon />}
              variant="contained"
              disableElevation
            >
              {step.ctaLabel ?? (isLast ? "Finish" : "Let's go")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(OnboardingScreen);
