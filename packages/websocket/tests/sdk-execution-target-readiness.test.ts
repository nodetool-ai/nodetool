import { describe, expect, it } from "vitest";
import { createSdkV1ExecutionTargetReadiness } from "../src/sdk/sdk-execution-target-readiness.js";

describe("SDK execution target readiness", () => {
  it("defaults omitted targets to the local server", async () => {
    const resolve = createSdkV1ExecutionTargetReadiness({
      getActiveWorker: () => null
    });

    await expect(resolve(undefined)).resolves.toEqual({
      id: "nodetool-server",
      name: "NodeTool server",
      ready: true,
      message: null
    });
  });

  it("accepts only the explicitly selected attached worker", async () => {
    const resolve = createSdkV1ExecutionTargetReadiness({
      getActiveWorker: () => ({ id: "worker-1" })
    });

    await expect(
      resolve({ kind: "worker", worker_id: "worker-1" })
    ).resolves.toMatchObject({ id: "worker-1", ready: true });
    await expect(
      resolve({ kind: "worker", worker_id: "worker-2" })
    ).resolves.toMatchObject({
      id: "worker-2",
      ready: false,
      message: "Selected execution worker is not attached."
    });
  });

  it("redacts worker lookup failures", async () => {
    const resolve = createSdkV1ExecutionTargetReadiness({
      getActiveWorker: async () => {
        throw new Error("secret provider address");
      }
    });

    const result = await resolve({
      kind: "worker",
      worker_id: "worker-1"
    });
    expect(result).toMatchObject({
      ready: false,
      message: "Selected execution worker readiness check failed."
    });
    expect(JSON.stringify(result)).not.toContain("secret provider address");
  });
});
