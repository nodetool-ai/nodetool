import useWorkflowProfilerStore from "../WorkflowProfilerStore";
import useExecutionTimeStore from "../ExecutionTimeStore";

describe("WorkflowProfilerStore", () => {
  const mockWorkflowId = "test-workflow-1";
  const mockNodeId1 = "node-1";
  const mockNodeId2 = "node-2";
  const mockNodeId3 = "node-3";

  const mockNodes = [
    { id: mockNodeId1, type: "text", data: { label: "Text Node" } },
    { id: mockNodeId2, type: "image", data: { label: "Image Node" } },
    { id: mockNodeId3, type: "audio", data: { label: "Audio Node" } }
  ];

  beforeEach(() => {
    useExecutionTimeStore.setState({ timings: {} });
    useWorkflowProfilerStore.setState({ profiles: {}, suggestions: {}, nodeLabels: {} });
  });

  describe("analyzeWorkflow", () => {
    it("should return null when no execution timings exist", () => {
      const profile = useWorkflowProfilerStore.getState().analyzeWorkflow(mockWorkflowId, mockNodes);
      expect(profile).toBeNull();
    });

    it("should analyze workflow with execution timings", () => {
      const startTime = Date.now() - 5000;
      useExecutionTimeStore.setState({
        timings: {
          [`${mockWorkflowId}:${mockNodeId1}`]: {
            startTime,
            endTime: startTime + 1000
          },
          [`${mockWorkflowId}:${mockNodeId2}`]: {
            startTime,
            endTime: startTime + 3000
          },
          [`${mockWorkflowId}:${mockNodeId3}`]: {
            startTime,
            endTime: startTime + 500
          }
        }
      });

      const profile = useWorkflowProfilerStore.getState().analyzeWorkflow(mockWorkflowId, mockNodes);

      expect(profile).not.toBeNull();
      expect(profile!.workflowId).toBe(mockWorkflowId);
      expect(profile!.totalDuration).toBe(4500);
      expect(profile!.completedNodes).toBe(3);
      expect(profile!.nodeCount).toBe(3);
      expect(profile!.bottlenecks.length).toBeGreaterThan(0);
    });

    it("should identify bottlenecks correctly", () => {
      const startTime = Date.now() - 10000;
      useExecutionTimeStore.setState({
        timings: {
          [`${mockWorkflowId}:${mockNodeId1}`]: {
            startTime,
            endTime: startTime + 500
          },
          [`${mockWorkflowId}:${mockNodeId2}`]: {
            startTime,
            endTime: startTime + 8000
          },
          [`${mockWorkflowId}:${mockNodeId3}`]: {
            startTime,
            endTime: startTime + 300
          }
        }
      });

      const profile = useWorkflowProfilerStore.getState().analyzeWorkflow(mockWorkflowId, mockNodes);

      expect(profile).not.toBeNull();
      expect(profile!.slowestNode).not.toBeNull();
      expect(profile!.slowestNode!.nodeId).toBe(mockNodeId2);
      expect(profile!.slowestNode!.duration).toBe(8000);
    });

    it("should calculate average node duration", () => {
      const startTime = Date.now() - 6000;
      useExecutionTimeStore.setState({
        timings: {
          [`${mockWorkflowId}:${mockNodeId1}`]: {
            startTime,
            endTime: startTime + 1000
          },
          [`${mockWorkflowId}:${mockNodeId2}`]: {
            startTime,
            endTime: startTime + 2000
          }
        }
      });

      const profile = useWorkflowProfilerStore.getState().analyzeWorkflow(mockWorkflowId, mockNodes);

      expect(profile).not.toBeNull();
      expect(profile!.averageNodeDuration).toBe(1500);
    });
  });

  describe("getProfile", () => {
    it("should return null for non-existent workflow", () => {
      const profile = useWorkflowProfilerStore.getState().getProfile("non-existent");
      expect(profile).toBeNull();
    });

    it("should return cached profile after analysis", () => {
      const startTime = Date.now() - 3000;
      useExecutionTimeStore.setState({
        timings: {
          [`${mockWorkflowId}:${mockNodeId1}`]: {
            startTime,
            endTime: startTime + 1000
          }
        }
      });

      useWorkflowProfilerStore.getState().analyzeWorkflow(mockWorkflowId, mockNodes);
      const profile = useWorkflowProfilerStore.getState().getProfile(mockWorkflowId);

      expect(profile).not.toBeNull();
      expect(profile!.totalDuration).toBe(1000);
    });
  });

  describe("getSuggestions", () => {
    it("should return empty array for non-existent workflow", () => {
      const suggestions = useWorkflowProfilerStore.getState().getSuggestions("non-existent");
      expect(suggestions).toEqual([]);
    });

    it("should generate suggestions for slow nodes", () => {
      const startTime = Date.now() - 20000;
      useExecutionTimeStore.setState({
        timings: {
          [`${mockWorkflowId}:${mockNodeId1}`]: {
            startTime,
            endTime: startTime + 15000
          }
        }
      });

      useWorkflowProfilerStore.getState().analyzeWorkflow(mockWorkflowId, mockNodes);
      const suggestions = useWorkflowProfilerStore.getState().getSuggestions(mockWorkflowId);

      expect(suggestions.length).toBeGreaterThan(0);
      const slowNodeSuggestion = suggestions.find(
        (s) => s.impact === "high" && s.type === "warning"
      );
      expect(slowNodeSuggestion).toBeDefined();
    });
  });

  describe("clearProfile", () => {
    it("should remove profile from store", () => {
      const startTime = Date.now() - 3000;
      useExecutionTimeStore.setState({
        timings: {
          [`${mockWorkflowId}:${mockNodeId1}`]: {
            startTime,
            endTime: startTime + 1000
          }
        }
      });

      useWorkflowProfilerStore.getState().analyzeWorkflow(mockWorkflowId, mockNodes);
      expect(useWorkflowProfilerStore.getState().getProfile(mockWorkflowId)).not.toBeNull();

      useWorkflowProfilerStore.getState().clearProfile(mockWorkflowId);
      expect(useWorkflowProfilerStore.getState().getProfile(mockWorkflowId)).toBeNull();
    });
  });

  describe("clearAllProfiles", () => {
    it("should remove all profiles from store", () => {
      const startTime = Date.now() - 3000;
      useExecutionTimeStore.setState({
        timings: {
          [`${mockWorkflowId}:${mockNodeId1}`]: {
            startTime,
            endTime: startTime + 1000
          }
        }
      });

      useWorkflowProfilerStore.getState().analyzeWorkflow(mockWorkflowId, mockNodes);
      useWorkflowProfilerStore.getState().clearAllProfiles();

      expect(useWorkflowProfilerStore.getState().getProfile(mockWorkflowId)).toBeNull();
    });
  });
});

export {};
