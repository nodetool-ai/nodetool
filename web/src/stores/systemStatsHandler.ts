import { create } from "zustand";
import { SystemStats } from "./ApiTypes";

export interface SystemStatsMessage {
  type: "system_stats";
  stats: SystemStats;
}

interface SystemStatsState {
  stats: SystemStats | null;
  setStats: (stats: SystemStats) => void;
  clearStats: () => void;
}

export const useSystemStatsStore = create<SystemStatsState>((set) => ({
  stats: null,
  setStats: (stats: SystemStats) => {
    console.debug("[SystemStats] Updated:", stats);
    set({ stats });
  },
  clearStats: () => {
    console.debug("[SystemStats] Cleared");
    set({ stats: null });
  }
}));

export function handleSystemStats(message: SystemStatsMessage): void {
  const { stats } = message;

  console.debug("[SystemStats] Received update:", {
    cpu: stats.cpu_percent,
    memory: stats.memory_percent,
    vram: stats.vram_percent
  });

  useSystemStatsStore.getState().setStats(stats);
}
