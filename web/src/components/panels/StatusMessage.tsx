/** @jsxImportSource @emotion/react */
import { Typography } from "@mui/material";
import { css } from "@emotion/react";
import { memo } from "react";
import useWorkflowRunner from "../../stores/WorkflowRunner";

const StatusMessage = memo(() => {
  const { statusMessage, isWorkflowRunning } = useWorkflowRunner((state) => ({
    statusMessage: state.statusMessage,
    isWorkflowRunning: state.state === "running"
  }));

  if (!isWorkflowRunning) return null;

  return (
    <Typography
      className="status-message"
      variant="caption"
      color="inherit"
      css={css`
        @keyframes typing {
          0% {
            color: #ff6b3d;
          }
          20% {
            color: #ffd700;
          }
          40% {
            color: #9acd32;
          }
          60% {
            color: #40e0d0;
          }
          80% {
            color: #48d1ff;
          }
          100% {
            color: #9370db;
          }
        }
        @keyframes slideIn {
          from {
            transform: translateY(-10px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        animation: typing 3s linear infinite, slideIn 0.3s ease-out;
        display: inline-block;
        padding: 4px 8px;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
      `}
    >
      {statusMessage || ""}
    </Typography>
  );
});

export default StatusMessage;
