import usePerformanceStore from "../PerformanceStore";
import useExecutionTimeStore from "../ExecutionTimeStore";

jest.mock("../ExecutionTimeStore", () => ({
  __esModule: true,
  default: jest.fn()
}));

const mockExecutionTimeStore = useExecutionTimeStore as unknown as jest.Mock;

describe("PerformanceStore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecutionTimeStore.mockReturnValue({
      timings: {},
      getDuration: jest.fn()
    });
  });

  describe("analyzePerformance", () => {
    it("should calculate total duration correctly", () => {
      const mockGetDuration = jest.fn()
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(2000)
        .mockReturnValueOnce(500);

      mockExecutionTimeStore.mockReturnValue({
        timings: {},
        getDuration: mockGetDuration
      });

      const store = mockExecutionTimeStore.mock.results[0].value;
      store.getDuration = mockGetDuration;

      const nodes = [
        { id: "1", type: "test", data: { label: "Node 1" } },
        { id: "2", type: "test", data: { label: "Node 2" } },
        { id: "3", type: "test", data: { label: "Node 3" } }
      ];

      usePerformanceStore.setState({ isAnalyzing: false, metrics: null });
      usePerformanceStore.getState().analyzePerformance("workflow-1", nodes as any);

      const metrics = usePerformanceStore.getState().metrics;
      expect(metrics).not.toBeNull();
      expect(metrics!.totalDuration).toBe(3500);
    });

    it("should identify bottleneck nodes", () => {
      const mockGetDuration = jest.fn()
        .mockReturnValueOnce(10000)
        .mockReturnValueOnce(500)
        .mockReturnValueOnce(200);

      mockExecutionTimeStore.mockReturnValue({
        timings: {},
        getDuration: mockGetDuration
      });

      const nodes = [
        { id: "slow", type: "slow-node", data: { label: "Slow Node" } },
        { id: "fast", type: "fast-node", data: { label: "Fast Node" } },
        { id: "faster", type: "fast-node", data: { label: "Faster Node" } }
      ];

      usePerformanceStore.getState().analyzePerformance("workflow-2", nodes as any);

      const metrics = usePerformanceStore.getState().metrics;
      expect(metrics).not.toBeNull();
      expect(metrics!.bottlenecks.length).toBeGreaterThan(0);
      expect(metrics!.bottlenecks[0].nodeId).toBe("slow");
    });

    it("should handle empty nodes array", () => {
      usePerformanceStore.getState().analyzePerformance("workflow-3", []);

      const metrics = usePerformanceStore.getState().metrics;
      expect(metrics).not.toBeNull();
      expect(metrics!.totalDuration).toBe(0);
      expect(metrics!.nodeCount).toBe(0);
    });

    it("should calculate estimated speedup for parallel execution", () => {
      const mockGetDuration = jest.fn()
        .mockReturnValue(1000);

      mockExecutionTimeStore.mockReturnValue({
        timings: {},
        getDuration: mockGetDuration
      });

      const nodes = [
        { id: "1", type: "test", data: { label: "Node 1" } },
        { id: "2", type: "test", data: { label: "Node 2" } }
      ];

      usePerformanceStore.getState().analyzePerformance("workflow-4", nodes as any);

      const metrics = usePerformanceStore.getState().metrics;
      expect(metrics).not.toBeNull();
      expect(metrics!.estimatedSpeedup).toBeGreaterThan(1);
    });
  });

  describe("clearMetrics", () => {
    it("should clear metrics", () => {
      usePerformanceStore.setState({
        metrics: {
          totalDuration: 5000,
          nodeCount: 5,
          bottlenecks: [],
          parallelizableChains: [],
          estimatedSpeedup: 2
        }
      });

      usePerformanceStore.getState().clearMetrics();

      expect(usePerformanceStore.getState().metrics).toBeNull();
    });
  });
});
