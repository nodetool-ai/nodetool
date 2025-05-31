import React, { useState, useEffect, useRef } from "react";
import { LinearProgress, Typography } from "@mui/material";

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

  return (
    <div className="node-progress">
      <div className="progress-bar">
        <LinearProgress
          variant="determinate"
          value={(progress * 100) / total}
          color="primary"
        />
      </div>
      <Typography variant="caption">{eta && `ETA: ${eta}s`}</Typography>
    </div>
  );
};