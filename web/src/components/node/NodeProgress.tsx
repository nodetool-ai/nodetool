/** @jsxImportSource @emotion/react */
import { memo, useEffect, useState, useRef } from "react";
import { LinearProgress, Typography } from "@mui/material";
import { useNodeProgress } from "../../hooks/useNodeProgress";
import isEqual from "lodash/isEqual";

const NodeProgress = ({
  id,
  workflowId
}: {
  id: string;
  workflowId: string;
}) => {
  // Use optimized hook to prevent unnecessary re-renders
  const progress = useNodeProgress(workflowId, id);
  const [eta, setEta] = useState<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (progress && startTimeRef.current === null) {
      startTimeRef.current = Date.now();
    }

    if (progress) {
      const remainingItems = progress.total - progress.progress;
      const elapsedTime = Date.now() - (startTimeRef.current || Date.now());
      const itemsPerMs = progress.progress / elapsedTime;
      const remainingTimeMs = remainingItems / itemsPerMs;
      const etaSeconds = Math.round(remainingTimeMs / 1000);
      setEta(etaSeconds);
    }
  }, [progress]);

  if (!progress) {
    return null;
  }

  return (
    <div className="node-progress" style={{ margin: "0.75em 0 0.5em 0" }}>
      <LinearProgress
        variant="determinate"
        value={(progress.progress * 100) / progress.total}
        color="secondary"
      />
      <Typography
        variant="caption"
        component="div"
        color="textSecondary"
        style={{ textAlign: "center", marginTop: "0.5em", minHeight: "1.2em" }}
      >
        {progress.progress} / {progress.total}
        {eta && ` (eta ${eta}s)`}
      </Typography>
    </div>
  );
};

export default memo(NodeProgress, isEqual);
