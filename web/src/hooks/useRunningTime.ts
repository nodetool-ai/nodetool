import { useState, useEffect, useRef } from "react";

/**
 * Hook to track elapsed time for a running workflow.
 * Provides real-time elapsed seconds updated every second.
 *
 * @param isRunning - Whether the workflow is currently running
 * @returns The elapsed time in seconds since the workflow started running
 */
export const useRunningTime = (isRunning: boolean): number => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (isRunning) {
      startTimeRef.current = Date.now();
      setElapsedSeconds(0);

      const interval = setInterval(() => {
        if (startTimeRef.current) {
          const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
          setElapsedSeconds(elapsed);
        }
      }, 1000);

      return () => clearInterval(interval);
    } else {
      startTimeRef.current = null;
      setElapsedSeconds(0);
    }
  }, [isRunning]);

  return elapsedSeconds;
};
