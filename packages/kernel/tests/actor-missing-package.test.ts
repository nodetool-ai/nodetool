import { describe, expect, it } from "vitest";
import { MissingRuntimePackageError } from "@nodetool-ai/protocol";
import { WorkflowRunner } from "../src/runner.js";

describe("missing runtime package failure", () => {
  it("names the package to install on the failed node_update", async () => {
    const runner = new WorkflowRunner("missing-pkg", {
      resolveExecutor: () => ({
        process: async () => {
          throw new MissingRuntimePackageError(
            "whisper.cpp is not installed",
            "whisper-cpp"
          );
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
      runtime_package: "whisper-cpp"
    });
  });
});
