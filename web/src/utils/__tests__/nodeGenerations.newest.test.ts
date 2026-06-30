import type { Generation } from "../nodeGenerations";
import {
  newestCompletedGeneration,
  newestCompletedGenerationForSignature,
} from "../nodeGenerations";

function gen(
  id: string,
  status: Generation["status"],
  extra?: Partial<Generation>
): Generation {
  return {
    id,
    jobId: null,
    createdAt: 0,
    outputs: {},
    status,
    ...extra,
  };
}

describe("newestCompletedGeneration", () => {
  it("returns undefined for empty array", () => {
    expect(newestCompletedGeneration([])).toBeUndefined();
  });

  it("returns the last completed generation", () => {
    const gens = [gen("a", "completed"), gen("b", "running"), gen("c", "completed")];
    expect(newestCompletedGeneration(gens)?.id).toBe("c");
  });

  it("returns undefined when none are completed", () => {
    const gens = [gen("a", "running"), gen("b", "error")];
    expect(newestCompletedGeneration(gens)).toBeUndefined();
  });

  it("skips trailing non-completed entries", () => {
    const gens = [gen("a", "completed"), gen("b", "error"), gen("c", "running")];
    expect(newestCompletedGeneration(gens)?.id).toBe("a");
  });

  it("returns the only completed entry", () => {
    const gens = [gen("x", "completed")];
    expect(newestCompletedGeneration(gens)?.id).toBe("x");
  });
});

describe("newestCompletedGenerationForSignature", () => {
  it("returns undefined for empty array", () => {
    expect(newestCompletedGenerationForSignature([], "sig")).toBeUndefined();
  });

  it("returns the last completed with matching signature", () => {
    const gens = [
      gen("a", "completed", { inputSignature: "sig1" }),
      gen("b", "completed", { inputSignature: "sig2" }),
      gen("c", "completed", { inputSignature: "sig1" }),
    ];
    expect(newestCompletedGenerationForSignature(gens, "sig1")?.id).toBe("c");
  });

  it("ignores non-completed generations with matching signature", () => {
    const gens = [
      gen("a", "completed", { inputSignature: "sig" }),
      gen("b", "running", { inputSignature: "sig" }),
    ];
    expect(newestCompletedGenerationForSignature(gens, "sig")?.id).toBe("a");
  });

  it("returns undefined when no signature matches", () => {
    const gens = [gen("a", "completed", { inputSignature: "other" })];
    expect(newestCompletedGenerationForSignature(gens, "sig")).toBeUndefined();
  });

  it("returns undefined when signature matches but status is not completed", () => {
    const gens = [gen("a", "error", { inputSignature: "sig" })];
    expect(newestCompletedGenerationForSignature(gens, "sig")).toBeUndefined();
  });

  it("handles generations without inputSignature", () => {
    const gens = [gen("a", "completed")];
    expect(newestCompletedGenerationForSignature(gens, "sig")).toBeUndefined();
  });
});
