import useTraceStore from "../TraceStore";

beforeEach(() => useTraceStore.getState().clear());

describe("durable run inspection selection", () => {
  it("starts with no selected run and keeps records out of the client store", () => {
    expect(useTraceStore.getState()).toMatchObject({ selectedRunId: null, focusedSpanId: null, view: "trace" });
    expect(useTraceStore.getState()).not.toHaveProperty("events");
    expect(useTraceStore.getState()).not.toHaveProperty("runs");
  });

  it("selects full run IDs and resets focus when switching active runs", () => {
    const first = "a".repeat(32);
    const second = "b".repeat(32);
    useTraceStore.getState().openInspection({ runId: first, spanId: "c".repeat(16) });
    useTraceStore.getState().selectRun(second);
    expect(useTraceStore.getState()).toMatchObject({ selectedRunId: second, focusedSpanId: null });
    useTraceStore.getState().selectRun(first);
    expect(useTraceStore.getState().selectedRunId).toBe(first);
  });

  it("opens a shared run and focused span in Logs without shortening OTel IDs", () => {
    const spanId = "1234567890abcdef";
    useTraceStore.getState().openInspection({ runId: "d".repeat(32), spanId, view: "logs" });
    expect(useTraceStore.getState()).toMatchObject({ focusedSpanId: spanId, view: "logs" });
    useTraceStore.getState().setView("trace");
    expect(useTraceStore.getState().focusedSpanId).toBe(spanId);
  });

  it("clears selection and focus together", () => {
    useTraceStore.getState().openInspection({ runId: "a".repeat(32), spanId: "b".repeat(16), view: "logs" });
    useTraceStore.getState().clear();
    expect(useTraceStore.getState()).toMatchObject({ selectedRunId: null, focusedSpanId: null, view: "trace" });
  });
});
