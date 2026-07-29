import { describe, expect, it } from "vitest";
import { createNodeToolSdkV1CapabilitiesProvider } from "../src/sdk/sdk-runtime-capabilities-service.js";

describe("NodeTool SDK v1 runtime capabilities", () => {
  it("reads changing authoritative runtime state for every snapshot", () => {
    const registry = { revision: 4 };
    let pythonBridge = "starting" as const | "ready";
    const getCapabilities = createNodeToolSdkV1CapabilitiesProvider({
      nodetoolVersion: "0.7.0-rc.32",
      registry,
      pythonBridge: () => pythonBridge,
      profiles: {
        discovery: "available",
        preflight: "disabled"
      },
      authModes: ["trusted_local"],
      assetUriSchemes: ["asset"],
      limits: {
        maxRpcBatch: 50,
        maxInlineBytes: 1024,
        maxQueuedJobs: 0,
        maxJobEventReplay: 0,
        requestTimeoutSeconds: 30
      },
      getConfiguredMaxUploadBytes: () => 4096,
      now: () => new Date("2026-07-25T10:00:00.000Z")
    });

    expect(getCapabilities()).toMatchObject({
      registry_revision: 4,
      python_bridge: "starting",
      limits: { max_upload_bytes: 4096 }
    });

    registry.revision = 5;
    pythonBridge = "ready";
    expect(getCapabilities()).toMatchObject({
      registry_revision: 5,
      python_bridge: "ready"
    });
  });

  it("uses an explicitly enforced upload limit instead of storage config", () => {
    const getCapabilities = createNodeToolSdkV1CapabilitiesProvider({
      nodetoolVersion: "test",
      registry: { revision: 0 },
      pythonBridge: "disabled",
      profiles: {},
      authModes: [],
      assetUriSchemes: ["asset"],
      limits: {
        maxRpcBatch: 1,
        maxInlineBytes: 0,
        maxUploadBytes: 123,
        maxQueuedJobs: 0,
        maxJobEventReplay: 0,
        requestTimeoutSeconds: 1
      },
      getConfiguredMaxUploadBytes: () => {
        throw new Error("must not be called");
      }
    });

    expect(getCapabilities().limits.max_upload_bytes).toBe(123);
  });
});
