import { describe, expect, it } from "vitest";
import { MissingRuntimePackageError } from "@nodetool-ai/protocol";
import { WorkflowRunner } from "../src/runner.js";

describe("missing runtime package failure", () => {
  it.each(["whisper-cpp", "yt-dlp", "python"] as const)("retains %s details through node_update and the run result", async (runtimePackage) => {
    const error = new MissingRuntimePackageError("Runtime fixture is not installed", runtimePackage);
    const runner = new WorkflowRunner("missing-pkg", {
      resolveExecutor: () => ({
        process: async () => {
          throw error;
        }
      })
    });
    const result = await runner.run(
      { job_id: "missing-pkg" },
      { nodes: [{ id: "asr", type: "test.Asr" }], edges: [] }
    );

    expect(result.status).toBe("failed");
    const failed = result.messages.find(
      (m) =>
        m.type === "node_update" &&
        (m as { status?: string }).status === "error"
    ) as { error_detail?: unknown } | undefined;
    expect(failed?.error_detail).toEqual({
      code: "missing_runtime_package",
      runtime_package: runtimePackage,
      missing_runtime: error.details
    });
    expect(result.missingRuntime).toEqual(error.details);
  });
});
