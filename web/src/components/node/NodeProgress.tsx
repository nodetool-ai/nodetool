/** @jsxImportSource @emotion/react */
import { memo } from "react";
import { LinearProgress, Typography } from "@mui/material";
import useResultsStore from "../../stores/ResultsStore";

export const NodeProgress = memo(function NodeProgress({ id }: { id: string; }) {
  const progress = useResultsStore(state => state.progress)[id];
  if (!progress) {
    return null;
  }
  return (
    <div className="node-progress">
      <LinearProgress
        variant="determinate"
        value={(progress.progress * 100) / progress.total}
        color="secondary" />
      <Typography variant="caption" component="div" color="textSecondary">
        {progress.progress} / {progress.total}
      </Typography>
    </div>
  );
});
