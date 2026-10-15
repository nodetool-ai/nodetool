import { afterEach, describe, expect, it, vi } from "vitest";
import { MissingRuntimePackageError, missingRuntimePackageDetails, missingRuntimeText } from "@nodetool-ai/protocol";
import { commandFailureExitCode, commandMissingRuntime, printCommandError } from "../src/command-errors.js";
import { MissingPackError, type MissingPackDetails } from "@nodetool-ai/protocol";

afterEach(() => { vi.restoreAllMocks(); });
describe("CLI missing-runtime boundary", () => {
  it("returns exit3 and structured missing-pack JSON through wrapped and service results", () => {
    const details: MissingPackDetails = { error: "missing_pack", packs: [{ id: "fal", npm: "@nodetool-ai/fal-nodes", version: "1.2.3", installBytes: 0, requires: [] }],
      runtimeLibraries: [], nodeTypes: ["fal.Fixture"], install: { supported: true, reason: null, command: "nodetool packs add fal" }, restartRequired: false };
    const output = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(printCommandError(new Error("wrapped", { cause: new MissingPackError(details) }), true)).toBe(3);
    expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toEqual(details);
    expect(commandFailureExitCode({ missingPack: details })).toBe(3);
  });
  it.each(["ffmpeg", "python"] as const)("round trips %s details from a node error to CLI JSON with exit3", (runtimePackage) => {
    const details = missingRuntimePackageDetails(runtimePackage === "ffmpeg" ? "ffprobe" : "Python worker", runtimePackage, {}, { NODETOOL_HOST: "cli" });
    const error = new MissingRuntimePackageError(missingRuntimeText(details), runtimePackage, { details });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(printCommandError(new Error("wrapped", { cause: error }), true)).toBe(3);
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({ error: "missing_runtime_package", ...details });
    expect(commandFailureExitCode({ status: "failed", missingRuntime: details })).toBe(3);
    expect(commandMissingRuntime({ server: { missingRuntime: details } })).toEqual(details);
    expect(commandMissingRuntime({ missingRuntime: { runtimePackage: "invalid" }, server: { missingRuntime: details } })).toEqual(details);
    expect(commandMissingRuntime({ missingRuntime: details, server: false })).toEqual(details);
  });

  it("keeps ordinary failures on exit1 and rejects malformed runtime details", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(printCommandError(new Error("ordinary failure"), true)).toBe(1);
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({ error: "ordinary failure" });
    expect(commandFailureExitCode({ missingRuntime: { runtimePackage: "not-a-runtime" } })).toBe(1);
  });

  it.each([null, undefined, false, "failure", [], { server: "failure" }])("rejects a malformed command failure: %j", (failure) => {
    expect(commandMissingRuntime(failure)).toBeNull();
    expect(commandFailureExitCode(failure)).toBe(1);
  });
});
