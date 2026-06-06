import { outputOf, type Generation } from "../nodeGenerations";

const gen = (outputs: Record<string, unknown>): Generation => ({
  id: "g1",
  jobId: "j1",
  createdAt: 1,
  outputs,
  status: "completed"
});

describe("outputOf", () => {
  it("returns the named handle when present", () => {
    expect(outputOf(gen({ image: "A", mask: "B" }), "image")).toBe("A");
  });
  it("falls through to the sole output when the handle does not match", () => {
    // single-output node whose edge handle differs from the stored key
    expect(outputOf(gen({ output: "X" }), "image")).toBe("X");
  });
  it("returns the whole record for a handle miss on a multi-output node", () => {
    expect(outputOf(gen({ a: 1, b: 2 }), "c")).toEqual({ a: 1, b: 2 });
  });
  it("returns undefined outputs as undefined", () => {
    expect(outputOf(gen({}), "x")).toBeUndefined();
  });
});
