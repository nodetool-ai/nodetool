/** @jsxImportSource @emotion/react */
import { memo, useEffect, useState, useRef } from "react";
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

  const percentValue = (progress.progress * 100) / progress.total;

  return (
    <div className="node-progress" style={{ margin: "0.75em 0 0.5em 0" }}>
      <ProgressBar
        value={percentValue}
        color="secondary"
        showValue={true}
        formatValue={() =>
          `${progress.progress} / ${progress.total}${eta ? ` (eta ${eta}s)` : ""}`
        }
      />
    </div>
  );
};

export default memo(NodeProgress, isEqual);
