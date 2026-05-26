import { useState, useEffect, useRef } from "react";

const persistedStartTimes = new Map<string, number>();

/**
 * Hook to track elapsed time for a running workflow.
 * Provides real-time elapsed seconds updated every second.
 *
 * @param isRunning - Whether the workflow is currently running
 * @returns The elapsed time in seconds since the workflow started running
 */
export const useRunningTime = (
  isRunning: boolean,
  timerKey = "default"
): number => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (isRunning) {
      const persistedStart = persistedStartTimes.get(timerKey);
      const startTime = persistedStart ?? Date.now();
      persistedStartTimes.set(timerKey, startTime);
      startTimeRef.current = startTime;
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));

      const interval = setInterval(() => {
        if (startTimeRef.current) {
          const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
          setElapsedSeconds(elapsed);
        }
      }, 1000);

      return () => clearInterval(interval);
    } else {
      persistedStartTimes.delete(timerKey);
      startTimeRef.current = null;
      setElapsedSeconds(0);
    }
  }, [isRunning, timerKey]);

  return elapsedSeconds;
};
