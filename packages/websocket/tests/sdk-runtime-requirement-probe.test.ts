import { describe, expect, it } from "vitest";
import type { SdkV1Requirement } from "@nodetool-ai/protocol/api-schemas/sdk-lifecycle-v1.js";
import { createNodeToolSdkV1RuntimeProbe } from "../src/sdk/sdk-runtime-requirement-probe.js";

function runtime(id: string): SdkV1Requirement {
  return {
    kind: "runtime",
    id,
    name: id,
    status: "unknown",
    blocking: true,
    message: null
  };
}

describe("NodeTool SDK v1 runtime requirement probe", () => {
  it("reports the server's own runtimes as available", async () => {
    const probe = createNodeToolSdkV1RuntimeProbe({ getPythonBridgeReady: () => false });
    // libav runs in process, so an older requirement naming ffmpeg is met.
    for (const id of ["typescript", "ffmpeg", "ffprobe"]) {
      await expect(probe(runtime(id))).resolves.toEqual({ status: "available", message: null });
    }
  });

  it("uses hydrated Python bridge readiness", async () => {
    let ready = false;
    const probe = createNodeToolSdkV1RuntimeProbe({
      getPythonBridgeReady: () => ready
    });

    await expect(probe(runtime("python"))).resolves.toMatchObject({
      status: "unavailable"
    });
    ready = true;
    await expect(probe(runtime("python"))).resolves.toEqual({
      status: "available",
      message: null
    });
  });

  it("does not claim to know any other runtime", async () => {
    const probe = createNodeToolSdkV1RuntimeProbe({ getPythonBridgeReady: () => false });
    await expect(probe(runtime("arbitrary-command"))).resolves.toMatchObject({
      status: "unknown"
    });
  });
});
