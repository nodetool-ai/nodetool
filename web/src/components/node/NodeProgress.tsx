/** @jsxImportSource @emotion/react */
import { memo } from "react";
import { LinearProgress, Typography } from "@mui/material";
import useResultsStore from "../../stores/ResultsStore";

export const NodeProgress = memo(function NodeProgress({ id, workflowId }: { id: string; workflowId: string }) {
  const progress = useResultsStore(state => state.getProgress(workflowId, id));
  if (!progress) {
    return null;
  }
  return (
    <div className="node-progress" style={{ marginTop: "0.5em" }}>
      <LinearProgress
        variant="determinate"
        value={(progress.progress * 100) / progress.total}
        color="secondary" />
      <Typography variant="caption" component="div" color="textSecondary" style={{ textAlign: "center", marginTop: "0.5em" }}>
        {progress.progress} / {progress.total}
      </Typography>
    </div>
  );
});
