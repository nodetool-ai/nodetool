/** @jsxImportSource @emotion/react */
import { Button, CircularProgress, Tooltip } from "@mui/material";
import { PlayArrow } from "@mui/icons-material";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

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
  return (
    <Tooltip
      title={
        <div
          className="tooltip-span"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.1em"
          }}
        >
          <span style={{ fontSize: "1.2em", color: "white" }}>Run Group</span>
          {/* <span style={{ fontSize: ".9em", color: "white" }}>
            CTRL+Enter
          </span> */}
        </div>
      }
      enterDelay={TOOLTIP_ENTER_DELAY}
    >
      <Button
        size="large"
        tabIndex={-1}
        className={`action-button run-stop-button run-workflow ${
          isWorkflowRunning ? "disabled" : ""
        }`}
        onClick={() => !isWorkflowRunning && onClick()}
      >
        {state === "connecting" || state === "connected" ? (
          <>
            <span
              className={`run-status ${
                state === "connecting" ? "connecting-status" : ""
              }`}
            >
              {state === "connecting" ? "Connecting" : "Connected"}
            </span>
            <PlayArrow />
          </>
        ) : state === "running" ? (
          <CircularProgress />
        ) : (
          <PlayArrow />
        )}
      </Button>
    </Tooltip>
  );
};

export default RunGroupButton;
