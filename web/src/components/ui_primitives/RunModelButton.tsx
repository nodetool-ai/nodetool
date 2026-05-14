/** @jsxImportSource @emotion/react */
/**
 * RunModelButton
 *
 * Bottom-right primary action used by ContentCardBody and editing-node
 * bodies. Pure presentational primitive — call sites provide `isRunning`
 * (typically derived from the workflow runner / status store) and
 * `onClick` (typically triggers a single-node run via the existing
 * runner API).
 *
 * For full-workflow run/stop controls, use `RunWorkflowButton` instead.
 */

import React, { forwardRef, memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { Button } from "@mui/material";
import { LoadingSpinner } from "./LoadingSpinner";

const styles = (theme: Theme) =>
  css({
    "&.run-model-button": {
      textTransform: "none",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmall,
      fontWeight: 600,
      letterSpacing: "0.01em",
      color: theme.vars.palette.common.black,
      backgroundColor: theme.vars.palette.primary.main,
      borderRadius: "var(--rounded-sm)",
      padding: "4px 12px",
      minWidth: 0,
      gap: 6,
      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.25)",
      transition: "background-color 0.15s ease, box-shadow 0.15s ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.primary.light,
        boxShadow: "0 2px 6px rgba(0, 0, 0, 0.35)"
      },
      "&.Mui-disabled": {
        opacity: 0.55,
        color: theme.vars.palette.common.black,
        backgroundColor: theme.vars.palette.primary.main
      },
      "&.running": {
        backgroundColor: theme.vars.palette.primary.dark,
        color: theme.vars.palette.common.white
      },
      "& .MuiButton-startIcon": {
        margin: 0
      },
      "& svg": {
        fontSize: 16
      }
    }
  });

export interface RunModelButtonProps {
  /** Label shown next to the icon */
  label?: string;
  /** True while a single-node run is in flight */
  isRunning?: boolean;
  /** Disabled (overrides running visual when set) */
  disabled?: boolean;
  /** Click handler — call sites trigger the actual single-node run */
  onClick: () => void;
  className?: string;
}

const RunModelButtonInner = forwardRef<
  HTMLButtonElement,
  RunModelButtonProps
>(({ label = "Run Model", isRunning = false, disabled = false, onClick, className }, ref) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  const handleClick = useCallback(() => {
    if (disabled || isRunning) {return;}
    onClick();
  }, [disabled, isRunning, onClick]);

  return (
    <Button
      ref={ref}
      css={cssStyles}
      className={`run-model-button nodrag ${isRunning ? "running" : ""} ${className ?? ""}`}
      onClick={handleClick}
      disabled={disabled}
      startIcon={
        isRunning ? (
          <LoadingSpinner inline size={14} color="inherit" />
        ) : (
          <PlayArrowIcon />
        )
      }
      aria-label={label}
      size="small"
    >
      {label}
    </Button>
  );
});

RunModelButtonInner.displayName = "RunModelButtonInner";

export const RunModelButton = memo(RunModelButtonInner);
RunModelButton.displayName = "RunModelButton";

export default RunModelButton;
