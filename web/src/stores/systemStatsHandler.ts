/**
 * System Stats Handler
 *
 * Handles system_stats messages from the WebSocket and updates
 * a Zustand store that can be consumed by UI components.
 *
 * This follows the same pattern as resourceChangeHandler but uses
 * a standalone store since system stats are global and not tied
 * to any specific workflow or job.
 */
import { create } from "zustand";
import log from "loglevel";
import { SystemStats } from "./ApiTypes";

/**
 * WebSocket message type for system stats
 */
export interface SystemStatsMessage {
  type: "system_stats";
  stats: SystemStats;
}

/**
 * Store state interface for system stats
 */
interface SystemStatsState {
  stats: SystemStats | null;
  setStats: (stats: SystemStats) => void;
  clearStats: () => void;
}

/**
 * Zustand store for system stats.
 * Components can subscribe to this store to display real-time
 * system statistics (CPU, memory, GPU usage).
 */
export const useSystemStatsStore = create<SystemStatsState>((set) => ({
  stats: null,
  setStats: (stats: SystemStats) => {
    log.debug("[SystemStats] Updated:", stats);
    set({ stats });
  },
  clearStats: () => {
    log.debug("[SystemStats] Cleared");
    set({ stats: null });
  }
}));

/**
 * Handle system_stats messages from the WebSocket.
 *
 * @param message - The system stats message containing stats data
 */
export function handleSystemStats(message: SystemStatsMessage): void {
  const { stats } = message;

  log.debug("[SystemStats] Received update:", {
    cpu: stats.cpu_percent,
    memory: stats.memory_percent,
    vram: stats.vram_percent
  });

  useSystemStatsStore.getState().setStats(stats);
}
