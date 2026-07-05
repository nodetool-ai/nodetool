/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Tooltip, ToolbarIconButton, LoadingSpinner, MOTION, BORDER_RADIUS } from "../ui_primitives";
import PlayArrow from "@mui/icons-material/PlayArrow";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { memo, useCallback, useMemo } from "react";

const styles = (theme: Theme, _isRunning: boolean) =>
  css({
    "&.run-button": {
      width: 28,
      height: 28,
      padding: 0,
      borderRadius: BORDER_RADIUS.circle,
      backgroundColor: theme.vars.palette.primary.main,
      color: theme.vars.palette.common.black,
      transition: `all ${MOTION.fast}`,
      "&:hover": {
        backgroundColor: theme.vars.palette.primary.light,
        borderColor: theme.vars.palette.primary.light
      },
      "&.disabled": {
        opacity: 0.7,
        cursor: "not-allowed"
      },
      "& svg": {
        fontSize: 18
      },
      "& .MuiCircularProgress-root": {
        width: "16px !important",
        height: "16px !important",
        color: theme.vars.palette.common.black
      }
    }
  });

interface RunGroupButtonProps {
  isWorkflowRunning: boolean;
  state: string; // "connecting", "connected", "running", or other
  onClick: () => void;
}

const RunGroupButton: React.FC<RunGroupButtonProps> = ({
  isWorkflowRunning,
  state,
  onClick
}) => {
  const theme = useTheme();
  const isRunning = state === "running";
  const cssStyles = useMemo(() => styles(theme, isRunning), [theme, isRunning]);

  const handleClick = useCallback(() => {
    if (!isWorkflowRunning) {
      onClick();
    }
  }, [isWorkflowRunning, onClick]);

  // Memoize inline styles to avoid recreating on every render
  const tooltipSpanStyle = useMemo(() => ({
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "0.1em"
  }), []);

  const tooltipTextStyle = useMemo(() => ({
    fontSize: "1.1em",
    color: "white"
  }), []);

  return (
    <Tooltip
      title={
        isWorkflowRunning ? (
          "Group is currently running..."
        ) : (
          <div
            className="tooltip-span"
            style={tooltipSpanStyle}
          >
            <span style={tooltipTextStyle}>Run Group</span>
          </div>
        )
      }
      delay={TOOLTIP_ENTER_DELAY}
    >
      <ToolbarIconButton
        title=""
        size="small"
        tabIndex={-1}
        css={cssStyles}
        className={`run-button ${isWorkflowRunning ? "disabled" : ""}`}
        onClick={handleClick}
      >
        {isRunning ? <LoadingSpinner size="small" /> : <PlayArrow />}
      </ToolbarIconButton>
    </Tooltip>
  );
};

export default memo(RunGroupButton);
