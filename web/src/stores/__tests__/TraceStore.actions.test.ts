/**
 * @jest-environment node
 */
import useTraceStore, { traceEventId } from "../TraceStore";
import type { TraceEvent } from "../TraceStore";

describe("traceEventId", () => {
  it("returns a string starting with 'te-'", () => {
    const id = traceEventId();
    expect(id).toMatch(/^te-\d+$/);
  });

  it("returns unique IDs on consecutive calls", () => {
    const ids = new Set(Array.from({ length: 100 }, () => traceEventId()));
    expect(ids.size).toBe(100);
  });

  it("returns incrementing numeric suffixes", () => {
    const id1 = traceEventId();
    const id2 = traceEventId();
    const num1 = parseInt(id1.replace("te-", ""), 10);
    const num2 = parseInt(id2.replace("te-", ""), 10);
    expect(num2).toBe(num1 + 1);
  });
});

describe("useTraceStore actions", () => {
  const makeEvent = (overrides?: Partial<TraceEvent>): TraceEvent => ({
    id: traceEventId(),
    timestamp: "2024-01-01T00:00:00Z",
    relativeMs: 0,
    type: "node_start",
    summary: "test event",
    detail: null,
    ...overrides,
  });

  beforeEach(() => {
    useTraceStore.getState().clear();
  });

  describe("initial state", () => {
    it("has empty events", () => {
      expect(useTraceStore.getState().events).toEqual([]);
    });

    it("has null runStartTime", () => {
      expect(useTraceStore.getState().runStartTime).toBeNull();
    });

    it("is not recording", () => {
      expect(useTraceStore.getState().isRecording).toBe(false);
    });
  });

  describe("startRun", () => {
    it("sets isRecording to true", () => {
      useTraceStore.getState().startRun("2024-01-01T00:00:00Z");
      expect(useTraceStore.getState().isRecording).toBe(true);
    });

    it("stores the run start timestamp", () => {
      useTraceStore.getState().startRun("2024-06-04T12:00:00Z");
      expect(useTraceStore.getState().runStartTime).toBe("2024-06-04T12:00:00Z");
    });

    it("stores workflow and run context", () => {
      useTraceStore.getState().startRun("2024-06-04T12:00:00Z", {
        workflowId: "workflow-1",
        workflowName: "Image workflow",
        jobId: "job-1"
      });

      expect(useTraceStore.getState().runContext).toEqual({
        workflowId: "workflow-1",
        workflowName: "Image workflow",
        jobId: "job-1"
      });
    });

    it("clears previous events", () => {
      useTraceStore.getState().startRun("2024-01-01T00:00:00Z");
      useTraceStore.getState().append(makeEvent());
      expect(useTraceStore.getState().events).toHaveLength(1);

      useTraceStore.getState().startRun("2024-01-02T00:00:00Z");
      expect(useTraceStore.getState().events).toEqual([]);
    });

    it("retains earlier runs and allows revisiting them", () => {
      useTraceStore.getState().startRun("2024-01-01T00:00:00Z", {
        workflowId: "workflow-1",
        workflowName: "First workflow",
        jobId: "job-1"
      });
      useTraceStore.getState().append(makeEvent({ summary: "first run" }));
      const firstRunId = useTraceStore.getState().selectedRunId;

      useTraceStore.getState().startRun("2024-01-02T00:00:00Z", {
        workflowId: "workflow-2",
        workflowName: "Second workflow",
        jobId: "job-2"
      });
      useTraceStore.getState().append(makeEvent({ summary: "second run" }));

      expect(useTraceStore.getState().runs).toHaveLength(2);
      useTraceStore.getState().selectRun(firstRunId!);
      expect(useTraceStore.getState().events).toEqual([
        expect.objectContaining({ summary: "first run" })
      ]);
      expect(useTraceStore.getState().runContext?.jobId).toBe("job-1");
    });

    it("continues routing live events while an earlier run is selected", () => {
      useTraceStore.getState().startRun("2024-01-01T00:00:00Z", {
        workflowId: "workflow-1",
        workflowName: "Workflow",
        jobId: "job-1"
      });
      const firstRunId = useTraceStore.getState().selectedRunId!;
      useTraceStore.getState().append(makeEvent({ summary: "first run" }));

      useTraceStore.getState().startRun("2024-01-02T00:00:00Z", {
        workflowId: "workflow-1",
        workflowName: "Workflow",
        jobId: "job-2"
      });
      const activeRunId = useTraceStore.getState().activeRunId!;
      useTraceStore.getState().selectRun(firstRunId);
      useTraceStore.getState().append(makeEvent({ summary: "live update" }));

      expect(useTraceStore.getState().events).toEqual([
        expect.objectContaining({ summary: "first run" })
      ]);
      useTraceStore.getState().selectRun(activeRunId);
      expect(useTraceStore.getState().events).toEqual([
        expect.objectContaining({ summary: "live update" })
      ]);
    });

    it("routes scoped events to their retained run", () => {
      useTraceStore.getState().startRun("2024-01-01T00:00:00Z", {
        workflowId: "workflow-1",
        workflowName: "First workflow",
        jobId: "job-1"
      });
      const firstRunId = useTraceStore.getState().selectedRunId!;
      useTraceStore.getState().startRun("2024-01-02T00:00:00Z", {
        workflowId: "workflow-2",
        workflowName: "Second workflow",
        jobId: "job-2"
      });

      useTraceStore.getState().append(
        makeEvent({ summary: "workflow one update" }),
        { workflowId: "workflow-1", jobId: "job-1" }
      );

      expect(useTraceStore.getState().events).toEqual([]);
      useTraceStore.getState().selectRun(firstRunId);
      expect(useTraceStore.getState().events).toEqual([
        expect.objectContaining({ summary: "workflow one update" })
      ]);
    });

    it("keeps only the ten most recent runs", () => {
      for (let index = 0; index < 11; index += 1) {
        useTraceStore.getState().startRun(
          `2024-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
          {
            workflowId: "workflow-1",
            workflowName: "Workflow",
            jobId: `job-${index}`
          }
        );
      }

      const runs = useTraceStore.getState().runs;
      expect(runs).toHaveLength(10);
      expect(runs[0].context?.jobId).toBe("job-10");
      expect(runs.some((run) => run.context?.jobId === "job-0")).toBe(false);
    });
  });

  describe("append", () => {
    it("does nothing when not recording", () => {
      useTraceStore.getState().append(makeEvent());
      expect(useTraceStore.getState().events).toEqual([]);
    });

    it("appends events when recording", () => {
      useTraceStore.getState().startRun("2024-01-01T00:00:00Z");

      const event1 = makeEvent({ summary: "first" });
      const event2 = makeEvent({ summary: "second" });
      useTraceStore.getState().append(event1);
      useTraceStore.getState().append(event2);

      const events = useTraceStore.getState().events;
      expect(events).toHaveLength(2);
      expect(events[0].summary).toBe("first");
      expect(events[1].summary).toBe("second");
    });
  });

  describe("clear", () => {
    it("resets events, runStartTime, and isRecording", () => {
      useTraceStore.getState().startRun("2024-01-01T00:00:00Z");
      useTraceStore.getState().append(makeEvent());

      useTraceStore.getState().clear();

      const state = useTraceStore.getState();
      expect(state.runs).toEqual([]);
      expect(state.activeRunId).toBeNull();
      expect(state.selectedRunId).toBeNull();
      expect(state.events).toEqual([]);
      expect(state.runStartTime).toBeNull();
      expect(state.runContext).toBeNull();
      expect(state.isRecording).toBe(false);
    });
  });

  describe("exportJSON", () => {
    it("returns valid JSON with events and runStartTime", () => {
      useTraceStore.getState().startRun("2024-01-01T00:00:00Z", {
        workflowId: "workflow-1",
        workflowName: "Image workflow",
        jobId: "job-1"
      });
      useTraceStore.getState().append(
        makeEvent({ summary: "export test" })
      );

      const json = useTraceStore.getState().exportJSON();
      const parsed = JSON.parse(json);

      expect(parsed.runStartTime).toBe("2024-01-01T00:00:00Z");
      expect(parsed.runContext).toEqual({
        workflowId: "workflow-1",
        workflowName: "Image workflow",
        jobId: "job-1"
      });
      expect(parsed.events).toHaveLength(1);
      expect(parsed.events[0].summary).toBe("export test");
    });

    it("returns valid JSON when empty", () => {
      const json = useTraceStore.getState().exportJSON();
      const parsed = JSON.parse(json);

      expect(parsed.runStartTime).toBeNull();
      expect(parsed.events).toEqual([]);
    });
  });
});
