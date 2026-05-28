import { useState, useEffect, useRef } from "react";

const persistedStartTimes = new Map<string, number>();
const MAX_PERSISTED_TIMERS = 200;

/**
 * Hook to track elapsed time for a running workflow.
 * Provides real-time elapsed seconds updated every second.
 *
 * @param isRunning - Whether the workflow is currently running
 * @returns The elapsed time in seconds since the workflow started running
 */
export const useRunningTime = (
  isRunning: boolean,
  timerKey?: string
): number => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (isRunning) {
      const persistedStart =
        timerKey === undefined ? undefined : persistedStartTimes.get(timerKey);
      const startTime = persistedStart ?? Date.now();

      if (timerKey) {
        if (
          persistedStart === undefined &&
          persistedStartTimes.size >= MAX_PERSISTED_TIMERS
        ) {
          const oldestKey = persistedStartTimes.keys().next().value as string;
          persistedStartTimes.delete(oldestKey);
        }
        persistedStartTimes.set(timerKey, startTime);
      }

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
      if (timerKey) {
        persistedStartTimes.delete(timerKey);
      }
      startTimeRef.current = null;
      setElapsedSeconds(0);
    }
  }, [isRunning, timerKey]);

  return elapsedSeconds;
};
