import React, { useMemo, useRef } from "react";
import { ProgressBar } from "../../ui_primitives/ProgressBar";

interface ProgressProps {
  progress: number;
  total: number;
}

export const Progress: React.FC<ProgressProps> = ({ progress, total }) => {
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
};
