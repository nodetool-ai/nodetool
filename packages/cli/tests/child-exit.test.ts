import { describe, expect, it } from "vitest";
import { childExitCode } from "../src/child-exit.js";

describe("childExitCode", () => {
  it("passes a child's own exit status through", () => {
    expect(childExitCode({ status: 0, signal: null, error: undefined })).toBe(0);
    expect(childExitCode({ status: 3, signal: null, error: undefined })).toBe(3);
  });

  it("reports a child killed by a signal as 128 + n, not success", () => {
    expect(
      childExitCode({ status: null, signal: "SIGKILL", error: undefined })
    ).toBe(137);
  });

  it("reports a child that never started as a failure", () => {
    expect(
      childExitCode({
        status: null,
        signal: null,
        error: Object.assign(new Error("spawn node ENOENT"), { code: "ENOENT" })
      })
    ).toBe(1);
  });
});
