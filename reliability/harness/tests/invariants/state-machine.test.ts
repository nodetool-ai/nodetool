import { describe, expect, it } from "vitest";
import { checkStateMachine } from "../../src/core/invariants/state-machine.js";
import type { RecordedTransition, RunRecord } from "../../src/core/record.js";

function baseRecord(transitions?: RecordedTransition[]): RunRecord {
  return {
    surface: "ws-server",
    jobId: "job-1",
    workflowId: "wf-1",
    startedAt: 0,
    finishedAt: 10,
    durationMs: 10,
    status: "completed",
    error: null,
    params: {},
    frames: [],
    transitions
  };
}

describe("checkStateMachine: passing fixtures", () => {
  it("reports nothing when no transitions were recorded", () => {
    expect(checkStateMachine(baseRecord())).toEqual([]);
  });

  it("reports nothing for a valid connect -> connected -> disconnect -> disconnected chain", () => {
    const record = baseRecord([
      { at: 0, action: "connect", from: "disconnected", to: "connecting" },
      { at: 1, action: "connected", from: "connecting", to: "connected" },
      { at: 2, action: "disconnect", from: "connected", to: "disconnecting" },
      { at: 3, action: "disconnected", from: "disconnecting", to: "disconnected" }
    ]);

    expect(checkStateMachine(record)).toEqual([]);
  });
});

describe("checkStateMachine: failing fixtures", () => {
  it("flags an unknown action", () => {
    const record = baseRecord([
      { at: 0, action: "teleport", from: "disconnected", to: "connected" }
    ]);

    expect(checkStateMachine(record)).toEqual([
      expect.objectContaining({ invariant: "state-machine.unknown-action" })
    ]);
  });

  it("flags a transition attempted from a state the machine doesn't allow", () => {
    // "connected" (the `connected` action) is only declared from
    // connecting/reconnecting — not directly from "disconnected".
    const record = baseRecord([
      { at: 0, action: "connected", from: "disconnected", to: "connected" }
    ]);

    const violations = checkStateMachine(record);
    expect(violations).toEqual([
      expect.objectContaining({ invariant: "state-machine.invalid-from" })
    ]);
  });

  it("flags a chain gap between two otherwise-valid transitions", () => {
    const record = baseRecord([
      { at: 0, action: "connect", from: "disconnected", to: "connecting" },
      // Should start from "connecting" (what the previous transition ended
      // in) — starting from "reconnecting" instead is a gap, even though
      // "connected" is declared valid from "reconnecting" in isolation.
      { at: 1, action: "connected", from: "reconnecting", to: "connected" }
    ]);

    const violations = checkStateMachine(record);
    expect(violations).toEqual([
      expect.objectContaining({ invariant: "state-machine.chain-gap" })
    ]);
  });
});
