import { markJobSilent, unmarkJobSilent, isSilentJob } from "../previewJobs";

describe("previewJobs", () => {
  afterEach(() => {
    unmarkJobSilent("job-1");
    unmarkJobSilent("job-2");
  });

  it("isSilentJob returns false for unknown jobs", () => {
    expect(isSilentJob("unknown")).toBe(false);
  });

  it("isSilentJob returns false for null/undefined", () => {
    expect(isSilentJob(null)).toBe(false);
    expect(isSilentJob(undefined)).toBe(false);
  });

  it("isSilentJob returns false for empty string", () => {
    expect(isSilentJob("")).toBe(false);
  });

  it("markJobSilent makes the job silent", () => {
    markJobSilent("job-1");
    expect(isSilentJob("job-1")).toBe(true);
  });

  it("unmarkJobSilent removes the silent flag", () => {
    markJobSilent("job-1");
    unmarkJobSilent("job-1");
    expect(isSilentJob("job-1")).toBe(false);
  });

  it("unmarkJobSilent is safe on non-existent jobs", () => {
    expect(() => unmarkJobSilent("nonexistent")).not.toThrow();
  });

  it("tracks multiple jobs independently", () => {
    markJobSilent("job-1");
    markJobSilent("job-2");
    expect(isSilentJob("job-1")).toBe(true);
    expect(isSilentJob("job-2")).toBe(true);
    unmarkJobSilent("job-1");
    expect(isSilentJob("job-1")).toBe(false);
    expect(isSilentJob("job-2")).toBe(true);
  });

  it("markJobSilent is idempotent", () => {
    markJobSilent("job-1");
    markJobSilent("job-1");
    expect(isSilentJob("job-1")).toBe(true);
    unmarkJobSilent("job-1");
    expect(isSilentJob("job-1")).toBe(false);
  });
});
