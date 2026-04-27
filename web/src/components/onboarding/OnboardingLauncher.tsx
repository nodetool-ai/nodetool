/** @jsxImportSource @emotion/react */
import React, { memo, useCallback } from "react";
import { css } from "@emotion/react";
import { useTheme, type Theme } from "@mui/material/styles";
import RocketLaunchRoundedIcon from "@mui/icons-material/RocketLaunchRounded";
import { EditorButton } from "../ui_primitives";
import { useOnboardingStore } from "../../stores/OnboardingStore";

interface OnboardingLauncherProps {
  variant?: "primary" | "subtle";
  label?: string;
}

const styles = (theme: Theme) =>
  css({
    "&.onboarding-launcher": {
      borderRadius: 12,
      textTransform: "none",
      fontWeight: 600,
      padding: "8px 14px"
    },
    "&.onboarding-launcher.primary": {
      background: `linear-gradient(120deg, ${theme.vars.palette.primary.light}, ${theme.vars.palette.secondary.dark})`,
      color: theme.vars.palette.common.white,
      "&:hover": {
        background: `linear-gradient(120deg, ${theme.vars.palette.primary.light}, ${theme.vars.palette.secondary.dark})`,
        filter: "brightness(1.1)"
      }
    },
    "&.onboarding-launcher.subtle": {
      color: theme.vars.palette.primary.main,
      borderColor: theme.vars.palette.grey[700]
    }
  });

const OnboardingLauncher: React.FC<OnboardingLauncherProps> = ({
  variant = "primary",
  label
}) => {
  const theme = useTheme();
  const start = useOnboardingStore((s) => s.start);
  const resume = useOnboardingStore((s) => s.resume);
  const completedCount = useOnboardingStore((s) =>
    Object.values(s.completed).filter(Boolean).length
  );

  const hasProgress = completedCount > 0;

  const handleClick = useCallback(() => {
    if (hasProgress) {
      resume();
    } else {
      start();
    }
  }, [hasProgress, resume, start]);

  const finalLabel = label ?? (hasProgress ? "Resume tour" : "Take the tour");

  return (
    <EditorButton
      onClick={handleClick}
      variant={variant === "primary" ? "contained" : "outlined"}
      size="small"
      startIcon={<RocketLaunchRoundedIcon />}
      disableElevation
      className={`onboarding-launcher ${variant}`}
      css={styles(theme)}
    >
      {finalLabel}
    </EditorButton>
  );
};

export default memo(OnboardingLauncher);
