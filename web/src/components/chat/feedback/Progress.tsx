import React, { memo, useMemo, useRef } from "react";
import { ProgressBar } from "../../ui_primitives";

interface ProgressProps {
  progress: number;
  total: number;
}

// Memoized because the chat status footer re-renders once a second off its
// elapsed timer, far more often than progress actually moves.
export const Progress = memo(function Progress({
  progress,
  total
}: ProgressProps) {
  const startTimeRef = useRef<number>(Date.now());

  const eta = useMemo(() => {
    const elapsedTime = Date.now() - startTimeRef.current;
    if (progress <= 0 || elapsedTime <= 0) return null;
    const itemsPerMs = progress / elapsedTime;
    const remainingItems = total - progress;
    return Math.round(remainingItems / itemsPerMs / 1000);
  }, [progress, total]);

  const percentValue = (progress * 100) / total;

  return (
    <div className="node-progress">
      <ProgressBar
        value={percentValue}
        showValue={true}
        formatValue={() => (eta ? `ETA: ${eta}s` : `${Math.round(percentValue)}%`)}
        color="primary"
      />
    </div>
  );
});
