import { describe, expect, it, vi } from "vitest";
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
  it("reports the server's Node runtime without spawning a process", async () => {
    const hasExecutable = vi.fn(async () => false);
    const probe = createNodeToolSdkV1RuntimeProbe({
      getPythonBridgeReady: () => false,
      hasExecutable
    });

    await expect(probe(runtime("typescript"))).resolves.toEqual({
      status: "available",
      message: null
    });
    expect(hasExecutable).not.toHaveBeenCalled();
  });

  it("uses hydrated Python bridge readiness", async () => {
    let ready = false;
    const probe = createNodeToolSdkV1RuntimeProbe({
      getPythonBridgeReady: () => ready,
      hasExecutable: async () => false
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

  it("checks only allow-listed external executables", async () => {
    const hasExecutable = vi.fn(
      async (command: string) => command === "ffmpeg"
    );
    const probe = createNodeToolSdkV1RuntimeProbe({
      getPythonBridgeReady: () => false,
      hasExecutable
    });

    await expect(probe(runtime("ffmpeg"))).resolves.toEqual({
      status: "available",
      message: null
    });
    await expect(probe(runtime("ffprobe"))).resolves.toMatchObject({
      status: "missing"
    });
    await expect(probe(runtime("arbitrary-command"))).resolves.toMatchObject({
      status: "unknown"
    });
    expect(hasExecutable.mock.calls).toEqual([["ffmpeg"], ["ffprobe"]]);
  });
});
