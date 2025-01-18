/** @jsxImportSource @emotion/react */
import { memo, useEffect, useState, useRef } from "react";
import { LinearProgress, Typography } from "@mui/material";
import useResultsStore from "../../stores/ResultsStore";
import { isEqual } from "lodash";
import MarkdownRenderer from "../../utils/MarkdownRenderer";

const NodeProgress = ({
  id,
  workflowId
}: {
  id: string;
  workflowId: string;
}) => {
  const progress = useResultsStore((state) =>
    state.getProgress(workflowId, id)
  );
  const [eta, setEta] = useState<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const chunkRef = useRef<HTMLDivElement>(null);
  console.log(progress);

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

  useEffect(() => {
    if (chunkRef.current && progress?.chunk) {
      chunkRef.current.scrollTop = chunkRef.current.scrollHeight;
    }
  }, [progress?.chunk]);

  if (!progress) {
    return null;
  }

  return (
    <div className="node-progress" style={{ marginTop: "0.5em" }}>
      <LinearProgress
        variant="determinate"
        value={(progress.progress * 100) / progress.total}
        color="secondary"
      />
      <Typography
        variant="caption"
        component="div"
        color="textSecondary"
        style={{ textAlign: "center", marginTop: "0.5em" }}
      >
        {progress.progress} / {progress.total}
        {eta && ` (eta ${eta}s)`}
      </Typography>
      {progress.chunk && (
        <div
          ref={chunkRef}
          style={{
            marginTop: "0.5em",
            maxHeight: "200px",
            padding: "0.5em",
            overflowY: "scroll"
          }}
        >
          <MarkdownRenderer content={progress.chunk} />
        </div>
      )}
    </div>
  );
};

export default memo(NodeProgress, isEqual);
