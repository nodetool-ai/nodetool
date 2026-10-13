import { afterEach, describe, expect, it, vi } from "vitest";
import { MissingRuntimePackageError, missingRuntimePackageDetails, missingRuntimeText } from "@nodetool-ai/protocol";
import { commandFailureExitCode, commandMissingRuntime, printCommandError } from "../src/command-errors.js";

afterEach(() => { vi.restoreAllMocks(); });
describe("CLI missing-runtime boundary", () => {
  it.each(["ffmpeg", "python"] as const)("round trips %s details from a node error to CLI JSON with exit3", (runtimePackage) => {
    const details = missingRuntimePackageDetails(runtimePackage === "ffmpeg" ? "ffprobe" : "Python worker", runtimePackage, {}, { NODETOOL_HOST: "cli" });
    const error = new MissingRuntimePackageError(missingRuntimeText(details), runtimePackage, { details });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(printCommandError(new Error("wrapped", { cause: error }), true)).toBe(3);
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({ error: "missing_runtime_package", ...details });
    expect(commandFailureExitCode({ status: "failed", missingRuntime: details })).toBe(3);
    expect(commandMissingRuntime({ server: { missingRuntime: details } })).toEqual(details);
  });

  it("keeps ordinary failures on exit1 and rejects malformed runtime details", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(printCommandError(new Error("ordinary failure"), true)).toBe(1);
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({ error: "ordinary failure" });
    expect(commandFailureExitCode({ missingRuntime: { runtimePackage: "not-a-runtime" } })).toBe(1);
  });
});
