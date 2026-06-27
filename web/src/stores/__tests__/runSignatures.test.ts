import {
  recordRunSignatures,
  getRunSignature,
  clearRunSignatures
} from "../runSignatures";

describe("runSignatures registry", () => {
  afterEach(() => {
    // Keep the module-level Map clean between cases.
    clearRunSignatures("job-1");
    clearRunSignatures("job-2");
  });

  it("records and reads back a node's signature for a job", () => {
    recordRunSignatures("job-1", { a: "sig-a", b: "sig-b" });
    expect(getRunSignature("job-1", "a")).toBe("sig-a");
    expect(getRunSignature("job-1", "b")).toBe("sig-b");
  });

  it("returns undefined for an unknown jobId", () => {
    expect(getRunSignature("nope", "a")).toBeUndefined();
  });

  it("returns undefined for an unknown nodeId within a known job", () => {
    recordRunSignatures("job-1", { a: "sig-a" });
    expect(getRunSignature("job-1", "missing")).toBeUndefined();
  });

  it("clear removes one job's signatures and isolates other jobs", () => {
    recordRunSignatures("job-1", { a: "sig-a" });
    recordRunSignatures("job-2", { a: "sig-a2" });
    clearRunSignatures("job-1");
    expect(getRunSignature("job-1", "a")).toBeUndefined();
    expect(getRunSignature("job-2", "a")).toBe("sig-a2");
  });

  it("recording the same jobId again replaces the prior map", () => {
    recordRunSignatures("job-1", { a: "sig-a", b: "sig-b" });
    recordRunSignatures("job-1", { a: "sig-a2" });
    expect(getRunSignature("job-1", "a")).toBe("sig-a2");
    expect(getRunSignature("job-1", "b")).toBeUndefined();
  });

  it("clearing an unknown job is a no-op", () => {
    expect(() => clearRunSignatures("never")).not.toThrow();
  });
});
