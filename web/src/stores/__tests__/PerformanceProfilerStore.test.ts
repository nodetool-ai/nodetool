/**
 * PerformanceProfilerStore Tests
 */

describe("PerformanceProfilerStore", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("should export required types and functions", () => {
    const store = require("../PerformanceProfilerStore");
    expect(store.usePerformanceProfilerStore).toBeDefined();
    expect(typeof store.default).toBe("function");
  });

  it("should have the correct interface", () => {
    const store = require("../PerformanceProfilerStore");
    const state = store.usePerformanceProfilerStore.getState();
    
    expect(typeof state.startProfiling).toBe("function");
    expect(typeof state.endProfiling).toBe("function");
    expect(typeof state.recordNodeExecution).toBe("function");
    expect(typeof state.getLatestProfile).toBe("function");
    expect(typeof state.getBottlenecks).toBe("function");
    expect(typeof state.getNodeRankings).toBe("function");
    expect(typeof state.clearProfiles).toBe("function");
  });
});
