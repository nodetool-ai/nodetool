/**
 * RealtimeDebugStore
 *
 * Persisted toggle for realtime per-frame debug logging. Default is `0` (off)
 * so the realtime path stays silent and fast. When set to a positive sampling
 * rate, per-frame log helpers emit one line per N frames per channel.
 *
 * See `web/src/lib/realtimeDebug.ts` for the helper that consumes this rate.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type RealtimeDebugLogRate = 0 | 1 | 10 | 100 | 1000;

export const REALTIME_DEBUG_LOG_RATE_OPTIONS: ReadonlyArray<{
  value: RealtimeDebugLogRate;
  label: string;
}> = [
  { value: 0, label: "Off" },
  { value: 1, label: "Every frame" },
  { value: 10, label: "Every 10th frame" },
  { value: 100, label: "Every 100th frame" },
  { value: 1000, label: "Every 1000th frame" }
];

interface RealtimeDebugState {
  logRate: RealtimeDebugLogRate;
  setLogRate: (rate: RealtimeDebugLogRate) => void;
}

export const useRealtimeDebugStore = create<RealtimeDebugState>()(
  persist(
    (set) => ({
      logRate: 0,
      setLogRate: (logRate) => set({ logRate })
    }),
    {
      name: "realtime-debug",
      version: 1
    }
  )
);
