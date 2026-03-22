/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { IconButton, CircularProgress, Tooltip } from "@mui/material";
import { PlayArrow } from "@mui/icons-material";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { useCallback, useMemo } from "react";

const styles = (theme: Theme, _isRunning: boolean) =>
  css({
    "&.run-button": {
      width: 28,
      height: 28,
      padding: 0,
      borderRadius: "50%",
      backgroundColor: theme.vars.palette.primary.main,
      color: theme.vars.palette.common.black,
      transition: "all 0.15s ease",
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
      enterDelay={TOOLTIP_ENTER_DELAY}
    >
      <IconButton
        size="small"
        tabIndex={-1}
        css={styles(theme, isRunning)}
        className={`run-button ${isWorkflowRunning ? "disabled" : ""}`}
        onClick={handleClick}
      >
        {isRunning ? <CircularProgress /> : <PlayArrow />}
      </IconButton>
    </Tooltip>
  );
};

export default RunGroupButton;
