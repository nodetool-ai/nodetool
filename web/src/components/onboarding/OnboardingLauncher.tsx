/** @jsxImportSource @emotion/react */
import React, { memo, useCallback } from "react";
import { css } from "@emotion/react";
import { useTheme, type Theme } from "@mui/material/styles";
import { Button } from "@mui/material";
import RocketLaunchRoundedIcon from "@mui/icons-material/RocketLaunchRounded";
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
      background: "linear-gradient(120deg, #7BA8FF, #A35EF1)",
      color: "#fff",
      "&:hover": {
        background: "linear-gradient(120deg, #7BA8FF, #A35EF1)",
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
  const completedCount = useOnboardingStore((s) =>
    Object.values(s.completed).filter(Boolean).length
  );

  const handleClick = useCallback(() => {
    start();
  }, [start]);

  const finalLabel = label ?? (completedCount > 0 ? "Resume tour" : "Take the tour");

  return (
    <Button
      onClick={handleClick}
      variant={variant === "primary" ? "contained" : "outlined"}
      size="small"
      startIcon={<RocketLaunchRoundedIcon />}
      disableElevation
      className={`onboarding-launcher ${variant}`}
      css={styles(theme)}
    >
      {finalLabel}
    </Button>
  );
};

export default memo(OnboardingLauncher);
