import { describe, expect, it } from "vitest";
import {
  LOOP_NODE_TYPE,
  isLoopBackEdge,
  isLoopFeedbackHandle,
  loopRootId,
  wouldCreateLoopUnsafeCycle
} from "../src/loop.js";

const types: Record<string, string> = {
  loop: LOOP_NODE_TYPE,
  a: "test.A",
  b: "test.B"
};
const typeOf = (id: string) => types[id];

describe("loop back edges", () => {
  it("recognises only next/condition on a Loop node", () => {
    expect(isLoopFeedbackHandle(LOOP_NODE_TYPE, "next")).toBe(true);
    expect(isLoopFeedbackHandle(LOOP_NODE_TYPE, "condition")).toBe(true);
    expect(isLoopFeedbackHandle(LOOP_NODE_TYPE, "initial")).toBe(false);
    expect(isLoopFeedbackHandle("test.A", "next")).toBe(false);
    expect(isLoopFeedbackHandle(LOOP_NODE_TYPE, null)).toBe(false);
  });

  it("never treats a control edge as a back edge", () => {
    expect(
      isLoopBackEdge(
        { source: "a", target: "loop", targetHandle: "next", edge_type: "control" },
        typeOf
      )
    ).toBe(false);
    expect(
      isLoopBackEdge({ source: "a", target: "loop", targetHandle: "next" }, typeOf)
    ).toBe(true);
  });

  it("names the loop root after the node id", () => {
    expect(loopRootId("n1")).toBe("n1:loop");
  });
});

describe("wouldCreateLoopUnsafeCycle", () => {
  const body = [
    { source: "loop", target: "a", targetHandle: "x" },
    { source: "a", target: "b", targetHandle: "x" }
  ];

  it("allows the edge that closes a loop through a feedback input", () => {
    expect(wouldCreateLoopUnsafeCycle(body, "b", "loop", "next", typeOf)).toBe(false);
  });

  it("rejects a cycle that closes on a non-feedback input", () => {
    expect(wouldCreateLoopUnsafeCycle(body, "b", "loop", "initial", typeOf)).toBe(true);
    expect(wouldCreateLoopUnsafeCycle(body, "b", "a", "y", typeOf)).toBe(true);
  });

  it("ignores existing back edges when checking a new forward edge", () => {
    const withBack = [...body, { source: "b", target: "loop", targetHandle: "next" }];
    // loop → a → b ⇢ loop: adding a → loop.initial must still be a cycle
    expect(wouldCreateLoopUnsafeCycle(withBack, "a", "loop", "initial", typeOf)).toBe(true);
    // b → a would be a cycle through a forward path a → b
    expect(wouldCreateLoopUnsafeCycle(withBack, "b", "a", "y", typeOf)).toBe(true);
    // a second edge loop → b is fine
    expect(wouldCreateLoopUnsafeCycle(withBack, "loop", "b", "y", typeOf)).toBe(false);
  });

  it("rejects self-loops even into a feedback input", () => {
    expect(wouldCreateLoopUnsafeCycle([], "loop", "loop", "next", typeOf)).toBe(true);
  });
});
