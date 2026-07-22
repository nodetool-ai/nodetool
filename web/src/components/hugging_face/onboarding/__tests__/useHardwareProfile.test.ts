/**
 * @jest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { useHardwareProfile } from "../useHardwareProfile";
import { useSystemStatsStore } from "../../../../stores/systemStatsHandler";
import { useModelManagerStore } from "../../../../stores/ModelManagerStore";
import type { SystemStats } from "../../../../stores/ApiTypes";

const setStats = (stats: Partial<SystemStats> | null) => {
  if (stats === null) {
    useSystemStatsStore.getState().clearStats();
  } else {
    useSystemStatsStore.getState().setStats({
      cpu_percent: 0,
      memory_percent: 0,
      ...stats
    } as SystemStats);
  }
};

beforeEach(() => {
  setStats(null);
  useModelManagerStore.getState().setVramOverrideGb(null);
});

describe("useHardwareProfile", () => {
  it("uses detected VRAM as the budget", () => {
    setStats({ vram_total_gb: 12, memory_total_gb: 32 });
    const { result } = renderHook(() => useHardwareProfile());
    expect(result.current.budgetGb).toBe(12);
    expect(result.current.budgetSource).toBe("gpu");
    expect(result.current.tier).toBe("high");
  });

  it("falls back to a fraction of system RAM when VRAM is absent", () => {
    setStats({ memory_total_gb: 32 });
    const { result } = renderHook(() => useHardwareProfile());
    // 70% of 32 = 22.4 → rounded to 22
    expect(result.current.budgetGb).toBe(22);
    expect(result.current.budgetSource).toBe("unified-memory");
    expect(result.current.vramGb).toBeNull();
  });

  it("lets the manual override win over detection", () => {
    setStats({ vram_total_gb: 8, memory_total_gb: 16 });
    useModelManagerStore.getState().setVramOverrideGb(24);
    const { result } = renderHook(() => useHardwareProfile());
    expect(result.current.budgetGb).toBe(24);
    expect(result.current.budgetSource).toBe("manual");
    expect(result.current.isManual).toBe(true);
  });

  it("reports an unknown budget when nothing is detected", () => {
    const { result } = renderHook(() => useHardwareProfile());
    expect(result.current.budgetGb).toBeNull();
    expect(result.current.budgetSource).toBe("unknown");
    expect(result.current.tier).toBeNull();
    expect(result.current.classify(8)).toBe("unknown");
  });

  it("classifies models against the budget", () => {
    setStats({ vram_total_gb: 16 });
    const { result } = renderHook(() => useHardwareProfile());
    expect(result.current.classify(8)).toBe("fits");
    expect(result.current.classify(16)).toBe("tight");
    expect(result.current.classify(24)).toBe("over");
  });
});
