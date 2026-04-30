/** @jsxImportSource @emotion/react */
import { memo, useCallback, useRef } from "react";
import useResultsStore from "../../stores/ResultsStore";
import isEqual from "fast-deep-equal";
import { ProgressBar } from "../ui_primitives/ProgressBar";

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
  const startTimeRef = useRef<number | null>(null);

  if (progress && startTimeRef.current === null) {
    startTimeRef.current = Date.now();
  }

  const formatValue = useCallback(() => {
    if (!progress) return "";
    const elapsedTime = Date.now() - (startTimeRef.current ?? Date.now());
    if (elapsedTime <= 0 || progress.progress <= 0) {
      return `${progress.progress} / ${progress.total}`;
    }
    const itemsPerMs = progress.progress / elapsedTime;
    const remainingMs = (progress.total - progress.progress) / itemsPerMs;
    const etaSeconds = Math.round(remainingMs / 1000);
    return `${progress.progress} / ${progress.total}${etaSeconds > 0 ? ` (eta ${etaSeconds}s)` : ""}`;
  }, [progress]);

  if (!progress) {
    return null;
  }

  const percentValue = (progress.progress * 100) / progress.total;

  return (
    <div className="node-progress" style={{ margin: "0.75em 0 0.5em 0" }}>
      <ProgressBar
        value={percentValue}
        color="secondary"
        showValue={true}
        formatValue={formatValue}
      />
    </div>
  );
};

export default memo(NodeProgress, isEqual);
