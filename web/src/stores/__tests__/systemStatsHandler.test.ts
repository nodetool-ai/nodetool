import {
  useSystemStatsStore,
  handleSystemStats,
  SystemStatsMessage
} from "../systemStatsHandler";
import { SystemStats } from "../ApiTypes";

const createStats = (overrides: Partial<SystemStats> = {}): SystemStats => ({
  cpu_percent: 25,
  memory_percent: 60,
  ...overrides
});

describe("useSystemStatsStore", () => {
  beforeEach(() => {
    useSystemStatsStore.setState({ stats: null });
  });

  it("starts with null stats", () => {
    expect(useSystemStatsStore.getState().stats).toBeNull();
  });

  describe("setStats", () => {
    it("stores the stats object", () => {
      const stats = createStats({ cpu_percent: 42 });
      useSystemStatsStore.getState().setStats(stats);
      expect(useSystemStatsStore.getState().stats).toEqual(stats);
    });

    it("replaces previous stats", () => {
      useSystemStatsStore.getState().setStats(createStats({ cpu_percent: 10 }));
      useSystemStatsStore.getState().setStats(createStats({ cpu_percent: 90 }));
      expect(useSystemStatsStore.getState().stats?.cpu_percent).toBe(90);
    });
  });

  describe("clearStats", () => {
    it("resets stats to null", () => {
      useSystemStatsStore.getState().setStats(createStats());
      useSystemStatsStore.getState().clearStats();
      expect(useSystemStatsStore.getState().stats).toBeNull();
    });
  });
});

describe("handleSystemStats", () => {
  beforeEach(() => {
    useSystemStatsStore.setState({ stats: null });
  });

  it("updates the store from a WebSocket message", () => {
    const message: SystemStatsMessage = {
      type: "system_stats",
      stats: createStats({
        cpu_percent: 55,
        memory_percent: 70,
        vram_percent: 30
      })
    };

    handleSystemStats(message);

    const stored = useSystemStatsStore.getState().stats;
    expect(stored).not.toBeNull();
    expect(stored?.cpu_percent).toBe(55);
    expect(stored?.memory_percent).toBe(70);
    expect(stored?.vram_percent).toBe(30);
  });

  it("handles stats with optional fields", () => {
    const message: SystemStatsMessage = {
      type: "system_stats",
      stats: createStats({
        gpu_percent: 80,
        vram_total_gb: 24,
        vram_used_gb: 12,
        memory_total_gb: 64,
        memory_used_gb: 40
      })
    };

    handleSystemStats(message);

    const stored = useSystemStatsStore.getState().stats;
    expect(stored?.gpu_percent).toBe(80);
    expect(stored?.vram_total_gb).toBe(24);
    expect(stored?.memory_total_gb).toBe(64);
  });
});
