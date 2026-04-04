import React, { useState, useEffect, useRef } from "react";
import { ProgressBar } from "../../ui_primitives/ProgressBar";

interface ProgressProps {
  progress: number;
  total: number;
}

export const Progress: React.FC<ProgressProps> = ({ progress, total }) => {
  const [eta, setEta] = useState<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (startTimeRef.current === null) {
      startTimeRef.current = Date.now();
    }

    const remainingItems = total - progress;
    const elapsedTime = Date.now() - (startTimeRef.current || Date.now());
    const itemsPerMs = progress / elapsedTime;
    const remainingTimeMs = remainingItems / itemsPerMs;
    const etaSeconds = Math.round(remainingTimeMs / 1000);
    setEta(etaSeconds);
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
