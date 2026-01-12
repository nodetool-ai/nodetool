/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useEffect, useState, useCallback } from "react";
import { Box } from "@mui/material";
import isEqual from "lodash/isEqual";
import usePerformanceMetricsStore from "../../stores/PerformanceMetricsStore";

interface ProcessTimerEnhancedProps {
  status: string;
  nodeType: string;
  workflowId: string;
  nodeId: string;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = (seconds % 60).toFixed(1);
  return `${minutes}m ${remainingSeconds}s`;
};

export const ProcessTimerEnhanced: React.FC<ProcessTimerEnhancedProps> = ({
  status,
  nodeType,
  workflowId,
  nodeId
}) => {
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const recordExecution = usePerformanceMetricsStore(
    (state) => state.recordExecution
  );

  const handleComplete = useCallback(() => {
    if (elapsedMs > 0 && nodeType) {
      recordExecution(nodeType, elapsedMs, workflowId, nodeId);
    }
  }, [elapsedMs, nodeType, workflowId, nodeId, recordExecution]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    let startTime: number | null = null;

    if (status === "running") {
      startTime = Date.now();
      interval = setInterval(() => {
        const currentTime = Date.now();
        const diff = currentTime - (startTime as number);
        setElapsedMs(diff);
      }, 100);
    } else if (status === "completed") {
      if (interval) {
        clearInterval(interval);
      }
      handleComplete();
    } else if (status === "failed") {
      if (interval) {
        clearInterval(interval);
      }
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [status, handleComplete]);

  const displayTime = formatDuration(elapsedMs);

  return (
    <div
      className="process-timer-enhanced"
      css={css({
        pointerEvents: "none",
        fontSize: "9px",
        fontFamily: "var(--fontFamily2)",
        lineHeight: "1em",
        width: "fit-content",
        textAlign: "center",
        margin: "auto",
        padding: "2px 4px",
        transition: "opacity 1s 1s"
      })}
    >
      {status === "starting" && (
        <Box sx={{ color: "yellow" }}>{displayTime || "0ms"} starting...</Box>
      )}
      {status === "booting" && (
        <Box sx={{ color: "yellow" }}>{displayTime || "0ms"} starting...</Box>
      )}
      {status === "running" && (
        <Box sx={{ color: "white" }}>{displayTime} running...</Box>
      )}
      {status === "failed" && <Box sx={{ color: "red" }}>failed</Box>}
      {status === "completed" && (
        <Box sx={{ color: "white" }}>completed in {displayTime}</Box>
      )}
    </div>
  );
};

export default memo(ProcessTimerEnhanced, isEqual);
