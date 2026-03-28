import useTraceStore, { traceEventId, TraceEventType } from "../TraceStore";

describe("TraceStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    useTraceStore.getState().clear();
  });

  describe("initial state", () => {
    it("should have empty events array", () => {
      const { events } = useTraceStore.getState();
      expect(events).toEqual([]);
    });

    it("should have null runStartTime", () => {
      const { runStartTime } = useTraceStore.getState();
      expect(runStartTime).toBeNull();
    });

    it("should not be recording", () => {
      const { isRecording } = useTraceStore.getState();
      expect(isRecording).toBe(false);
    });
  });

  describe("startRun", () => {
    it("should clear existing events and start recording", () => {
      const { startRun, append } = useTraceStore.getState();
      const timestamp = "2024-03-28T10:00:00.000Z";

      // Add some events first
      useTraceStore.setState({ isRecording: true });
      append({
        id: "te-1",
        timestamp: "2024-03-28T09:00:00.000Z",
        relativeMs: 0,
        type: "node_start" as TraceEventType,
        nodeId: "node1",
        nodeName: "Test Node",
        nodeType: "test",
        summary: "First event",
        detail: {}
      });

      let { events } = useTraceStore.getState();
      expect(events).toHaveLength(1);

      // Start a new run
      startRun(timestamp);

      const state = useTraceStore.getState();
      expect(state.events).toEqual([]);
      expect(state.runStartTime).toBe(timestamp);
      expect(state.isRecording).toBe(true);
    });

    it("should set the run start time", () => {
      const { startRun } = useTraceStore.getState();
      const timestamp = "2024-03-28T12:30:45.123Z";

      startRun(timestamp);

      const { runStartTime } = useTraceStore.getState();
      expect(runStartTime).toBe(timestamp);
    });

    it("should enable recording", () => {
      const { startRun } = useTraceStore.getState();

      startRun("2024-03-28T10:00:00.000Z");

      const { isRecording } = useTraceStore.getState();
      expect(isRecording).toBe(true);
    });
  });

  describe("append", () => {
    it("should add event when recording", () => {
      const { startRun, append } = useTraceStore.getState();
      const timestamp = "2024-03-28T10:00:00.000Z";

      startRun(timestamp);

      const event = {
        id: "te-1",
        timestamp: "2024-03-28T10:00:01.000Z",
        relativeMs: 1000,
        type: "node_complete" as TraceEventType,
        nodeId: "node1",
        nodeName: "Test Node",
        nodeType: "test",
        summary: "Node completed",
        detail: { result: "success" }
      };

      append(event);

      const { events } = useTraceStore.getState();
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(event);
    });

    it("should not add event when not recording", () => {
      const { append } = useTraceStore.getState();
      const initialLength = useTraceStore.getState().events.length;

      const event = {
        id: "te-1",
        timestamp: "2024-03-28T10:00:01.000Z",
        relativeMs: 1000,
        type: "node_start" as TraceEventType,
        nodeId: "node1",
        nodeName: "Test Node",
        nodeType: "test",
        summary: "Node started",
        detail: {}
      };

      append(event);

      expect(useTraceStore.getState().events).toHaveLength(initialLength);
    });

    it("should add multiple events in order", () => {
      const { startRun, append } = useTraceStore.getState();

      startRun("2024-03-28T10:00:00.000Z");

      const event1 = {
        id: "te-1",
        timestamp: "2024-03-28T10:00:01.000Z",
        relativeMs: 1000,
        type: "node_start" as TraceEventType,
        nodeId: "node1",
        nodeName: "Node 1",
        nodeType: "test",
        summary: "Event 1",
        detail: {}
      };

      const event2 = {
        id: "te-2",
        timestamp: "2024-03-28T10:00:02.000Z",
        relativeMs: 2000,
        type: "node_complete" as TraceEventType,
        nodeId: "node1",
        nodeName: "Node 1",
        nodeType: "test",
        summary: "Event 2",
        detail: {}
      };

      append(event1);
      append(event2);

      const { events } = useTraceStore.getState();
      expect(events).toHaveLength(2);
      expect(events[0]).toEqual(event1);
      expect(events[1]).toEqual(event2);
    });

    it("should implement FIFO eviction when MAX_EVENTS is reached", () => {
      const { startRun, append } = useTraceStore.getState();
      startRun("2024-03-28T10:00:00.000Z");

      // Add MAX_EVENTS + 1 events to test eviction
      const firstEvent = {
        id: "te-1",
        timestamp: "2024-03-28T10:00:00.001Z",
        relativeMs: 1,
        type: "node_start" as TraceEventType,
        nodeId: "node1",
        nodeName: "First Event",
        nodeType: "test",
        summary: "First",
        detail: {}
      };

      append(firstEvent);

      // Add remaining events to reach MAX_EVENTS
      for (let i = 2; i <= 10000; i++) {
        const iStr = String(i);
        const padded = String(i).padStart(3, "0");
        append({
          id: "te-" + iStr,
          timestamp: "2024-03-28T10:00:00." + padded + "Z",
          relativeMs: i,
          type: "node_complete" as TraceEventType,
          nodeId: "node" + iStr,
          nodeName: "Node " + iStr,
          nodeType: "test",
          summary: "Event " + iStr,
          detail: {}
        });
      }

      // At this point, we have exactly MAX_EVENTS
      let { events } = useTraceStore.getState();
      expect(events).toHaveLength(10000);

      // Add one more event - should evict the first
      const extraEvent = {
        id: "te-10001",
        timestamp: "2024-03-28T10:00:10.001Z",
        relativeMs: 10001,
        type: "output" as TraceEventType,
        nodeId: "nodeExtra",
        nodeName: "Extra Node",
        nodeType: "test",
        summary: "Extra Event",
        detail: {}
      };

      append(extraEvent);

      // Should still have MAX_EVENTS
      events = useTraceStore.getState().events;
      expect(events).toHaveLength(10000);
      // First event should be evicted
      expect(events[0].id).not.toBe("te-1");
      // Last event should be the new one
      expect(events[9999]).toEqual(extraEvent);
    });

    it("should handle events without nodeId", () => {
      const { startRun, append } = useTraceStore.getState();
      startRun("2024-03-28T10:00:00.000Z");

      const event = {
        id: "te-1",
        timestamp: "2024-03-28T10:00:01.000Z",
        relativeMs: 1000,
        type: "llm_call" as TraceEventType,
        summary: "LLM called",
        detail: { model: "gpt-4" }
      };

      append(event);

      const { events } = useTraceStore.getState();
      expect(events).toHaveLength(1);
      expect(events[0].nodeId).toBeUndefined();
    });

    it("should support all event types", () => {
      const { startRun, append } = useTraceStore.getState();
      startRun("2024-03-28T10:00:00.000Z");

      const eventTypes: TraceEventType[] = [
        "node_start",
        "node_complete",
        "node_error",
        "llm_call",
        "tool_call",
        "tool_result",
        "edge_active",
        "output"
      ];

      eventTypes.forEach((type, index) => {
        const idxStr = String(index + 1);
        append({
          id: "te-" + idxStr,
          timestamp: "2024-03-28T10:00:00.000Z",
          relativeMs: index * 100,
          type: type,
          nodeId: "node1",
          nodeName: "Test Node",
          nodeType: "test",
          summary: "Event of type " + type,
          detail: {}
        });
      });

      const { events } = useTraceStore.getState();
      expect(events).toHaveLength(8);
      events.forEach((event, index) => {
        expect(event.type).toBe(eventTypes[index]);
      });
    });
  });

  describe("clear", () => {
    it("should reset all state to initial values", () => {
      const { startRun, append, clear } = useTraceStore.getState();

      // Set up some state
      startRun("2024-03-28T10:00:00.000Z");
      append({
        id: "te-1",
        timestamp: "2024-03-28T10:00:01.000Z",
        relativeMs: 1000,
        type: "node_start" as TraceEventType,
        nodeId: "node1",
        nodeName: "Test Node",
        nodeType: "test",
        summary: "Event",
        detail: {}
      });

      expect(useTraceStore.getState().events).toHaveLength(1);
      expect(useTraceStore.getState().isRecording).toBe(true);

      // Clear the state
      clear();

      const state = useTraceStore.getState();
      expect(state.events).toEqual([]);
      expect(state.runStartTime).toBeNull();
      expect(state.isRecording).toBe(false);
    });

    it("should clear events when not recording", () => {
      const { startRun, append, clear } = useTraceStore.getState();

      startRun("2024-03-28T10:00:00.000Z");
      append({
        id: "te-1",
        timestamp: "2024-03-28T10:00:01.000Z",
        relativeMs: 1000,
        type: "node_start" as TraceEventType,
        nodeId: "node1",
        nodeName: "Test Node",
        nodeType: "test",
        summary: "Event",
        detail: {}
      });

      clear();

      const { events } = useTraceStore.getState();
      expect(events).toEqual([]);
    });
  });

  describe("exportJSON", () => {
    it("should export current state as JSON string", () => {
      const { startRun, append, exportJSON } = useTraceStore.getState();
      const timestamp = "2024-03-28T10:00:00.000Z";

      startRun(timestamp);

      const event = {
        id: "te-1",
        timestamp: "2024-03-28T10:00:01.000Z",
        relativeMs: 1000,
        type: "node_complete" as TraceEventType,
        nodeId: "node1",
        nodeName: "Test Node",
        nodeType: "test",
        summary: "Node completed",
        detail: { result: "success" }
      };

      append(event);

      const exported = exportJSON();
      const parsed = JSON.parse(exported);

      expect(parsed).toEqual({
        runStartTime: timestamp,
        events: [event]
      });
    });

    it("should export empty state", () => {
      const { exportJSON } = useTraceStore.getState();

      const exported = exportJSON();
      const parsed = JSON.parse(exported);

      expect(parsed).toEqual({
        runStartTime: null,
        events: []
      });
    });

    it("should include all events in export", () => {
      const { startRun, append, exportJSON } = useTraceStore.getState();

      startRun("2024-03-28T10:00:00.000Z");

      const events = [
        {
          id: "te-1",
          timestamp: "2024-03-28T10:00:01.000Z",
          relativeMs: 1000,
          type: "node_start" as TraceEventType,
          nodeId: "node1",
          nodeName: "Node 1",
          nodeType: "test",
          summary: "Start",
          detail: {}
        },
        {
          id: "te-2",
          timestamp: "2024-03-28T10:00:02.000Z",
          relativeMs: 2000,
          type: "node_complete" as TraceEventType,
          nodeId: "node1",
          nodeName: "Node 1",
          nodeType: "test",
          summary: "Complete",
          detail: {}
        }
      ];

      events.forEach(function(event) {
        append(event);
      });

      const exported = exportJSON();
      const parsed = JSON.parse(exported);

      expect(parsed.events).toHaveLength(2);
      expect(parsed.events).toEqual(events);
    });

    it("should produce valid JSON with pretty printing", () => {
      const { startRun, append, exportJSON } = useTraceStore.getState();

      startRun("2024-03-28T10:00:00.000Z");

      append({
        id: "te-1",
        timestamp: "2024-03-28T10:00:01.000Z",
        relativeMs: 1000,
        type: "output" as TraceEventType,
        nodeId: "node1",
        nodeName: "Test",
        nodeType: "test",
        summary: "Test",
        detail: { key: "value" }
      });

      const exported = exportJSON();

      // Should be parseable JSON
      expect(function() { JSON.parse(exported); }).not.toThrow();

      // Should have indentation (pretty printed)
      expect(exported).toContain("\n");
      expect(exported).toContain("  ");
    });
  });

  describe("traceEventId", () => {
    it("should generate unique sequential IDs", () => {
      const id1 = traceEventId();
      const id2 = traceEventId();
      const id3 = traceEventId();

      expect(id1).toBe("te-1");
      expect(id2).toBe("te-2");
      expect(id3).toBe("te-3");
    });

    it("should increment counter across calls", () => {
      const ids = new Set<string>();

      for (let i = 0; i < 100; i++) {
        ids.add(traceEventId());
      }

      expect(ids.size).toBe(100);
    });

    it("should generate IDs with te- prefix", () => {
      const id = traceEventId();

      expect(id).toMatch(/^te-\d+$/);
    });
  });

  describe("integration scenarios", () => {
    it("should handle a complete workflow trace lifecycle", () => {
      const { startRun, append, exportJSON, clear } = useTraceStore.getState();

      // Start a workflow run
      startRun("2024-03-28T10:00:00.000Z");

      // Simulate node execution
      append({
        id: traceEventId(),
        timestamp: "2024-03-28T10:00:01.000Z",
        relativeMs: 1000,
        type: "node_start",
        nodeId: "node1",
        nodeName: "Input Node",
        nodeType: "input",
        summary: "Processing input",
        detail: { input: "test data" }
      });

      append({
        id: traceEventId(),
        timestamp: "2024-03-28T10:00:02.500Z",
        relativeMs: 2500,
        type: "node_complete",
        nodeId: "node1",
        nodeName: "Input Node",
        nodeType: "input",
        summary: "Input processed",
        detail: { output: "processed data" }
      });

      // Simulate LLM call
      append({
        id: traceEventId(),
        timestamp: "2024-03-28T10:00:03.000Z",
        relativeMs: 3000,
        type: "llm_call",
        nodeId: "node2",
        nodeName: "LLM Node",
        nodeType: "llm",
        summary: "Calling LLM",
        detail: { model: "gpt-4", prompt: "test" }
      });

      append({
        id: traceEventId(),
        timestamp: "2024-03-28T10:00:05.000Z",
        relativeMs: 5000,
        type: "tool_result",
        nodeId: "node2",
        nodeName: "LLM Node",
        nodeType: "llm",
        summary: "LLM response received",
        detail: { response: "test response" }
      });

      // Verify state
      const { events, isRecording, runStartTime } = useTraceStore.getState();
      expect(events).toHaveLength(4);
      expect(isRecording).toBe(true);
      expect(runStartTime).toBe("2024-03-28T10:00:00.000Z");

      // Export and verify
      const exported = exportJSON();
      const parsed = JSON.parse(exported);
      expect(parsed.events).toHaveLength(4);

      // Clear for next run
      clear();
      const state = useTraceStore.getState();
      expect(state.events).toEqual([]);
      expect(state.isRecording).toBe(false);
      expect(state.runStartTime).toBeNull();
    });

    it("should not append events after clearing", () => {
      const { startRun, append, clear } = useTraceStore.getState();

      startRun("2024-03-28T10:00:00.000Z");

      append({
        id: traceEventId(),
        timestamp: "2024-03-28T10:00:01.000Z",
        relativeMs: 1000,
        type: "node_start",
        nodeId: "node1",
        nodeName: "Test",
        nodeType: "test",
        summary: "Before clear",
        detail: {}
      });

      let { events } = useTraceStore.getState();
      expect(events).toHaveLength(1);

      clear();

      // Try to append without starting a new run
      append({
        id: traceEventId(),
        timestamp: "2024-03-28T10:00:02.000Z",
        relativeMs: 2000,
        type: "node_complete",
        nodeId: "node1",
        nodeName: "Test",
        nodeType: "test",
        summary: "After clear",
        detail: {}
      });

      // Should not append since isRecording is false
      events = useTraceStore.getState().events;
      expect(events).toHaveLength(0);
    });
  });
});
