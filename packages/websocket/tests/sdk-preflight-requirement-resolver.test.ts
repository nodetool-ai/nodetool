import { describe, expect, it, vi } from "vitest";
import type { SdkV1Requirement } from "@nodetool-ai/protocol/api-schemas/sdk-lifecycle-v1.js";
import { createNodeToolSdkV1RequirementResolver } from "../src/sdk/sdk-preflight-requirement-resolver.js";

function requirement(
  kind: SdkV1Requirement["kind"],
  id: string
): SdkV1Requirement {
  return {
    kind,
    id,
    name: id,
    status: "unknown",
    blocking: true,
    message: null
  };
}

describe("NodeTool SDK v1 requirement resolver", () => {
  it("checks credentials in the authenticated user's scope", async () => {
    const getCredential = vi.fn(async () => "configured");
    const resolve = createNodeToolSdkV1RequirementResolver({
      userId: "alice",
      getCredential,
      findAsset: async () => null,
      listProviderIds: () => [],
      isProviderReady: async () => false
    });

    await expect(
      resolve(requirement("credential", "API_KEY"))
    ).resolves.toEqual({ status: "available", message: null });
    expect(getCredential).toHaveBeenCalledWith("alice", "API_KEY");
  });

  it("does not reveal whether a missing asset belongs to another user", async () => {
    const findAsset = vi.fn(async () => null);
    const resolve = createNodeToolSdkV1RequirementResolver({
      userId: "alice",
      getCredential: async () => null,
      findAsset,
      listProviderIds: () => [],
      isProviderReady: async () => false
    });

    await expect(resolve(requirement("asset", "asset-1"))).resolves.toEqual({
      status: "missing",
      message: "Required asset was not found."
    });
    expect(findAsset).toHaveBeenCalledWith("alice", "asset-1");
  });

  it("distinguishes unregistered and unconfigured providers safely", async () => {
    const resolve = createNodeToolSdkV1RequirementResolver({
      userId: "alice",
      getCredential: async () => null,
      findAsset: async () => null,
      listProviderIds: () => ["openai"],
      isProviderReady: async (_userId, id) => id === "openai"
    });

    await expect(resolve(requirement("provider", "unknown"))).resolves.toEqual({
      status: "unavailable",
      message: "Required provider is not registered."
    });
    await expect(resolve(requirement("provider", "openai"))).resolves.toEqual({
      status: "available",
      message: null
    });
  });

  it("uses explicit read-only probes and otherwise stays conservative", async () => {
    const resolve = createNodeToolSdkV1RequirementResolver({
      userId: "alice",
      getCredential: async () => null,
      findAsset: async () => null,
      listProviderIds: () => [],
      isProviderReady: async () => false,
      probes: {
        runtime: async (item) => ({
          status: item.id === "python" ? "available" : "missing",
          message: null
        })
      }
    });

    await expect(resolve(requirement("runtime", "python"))).resolves.toEqual({
      status: "available",
      message: null
    });
    await expect(resolve(requirement("model", "model-1"))).resolves.toEqual({
      status: "unknown",
      message: "Model availability has not been checked."
    });
  });

  it("passes model-provider context to an authoritative inventory probe", async () => {
    const modelProbe = vi.fn(async () => ({
      status: "available" as const,
      message: null
    }));
    const resolve = createNodeToolSdkV1RequirementResolver({
      userId: "alice",
      getCredential: async () => null,
      findAsset: async () => null,
      listProviderIds: () => [],
      isProviderReady: async () => false,
      probes: { model: modelProbe }
    });
    const model = {
      ...requirement("model", "model-1"),
      details: { provider_ids: ["openai"], node_ids: ["node-1"] }
    };

    await expect(resolve(model)).resolves.toEqual({
      status: "available",
      message: null
    });
    expect(modelProbe).toHaveBeenCalledWith(model);
  });
});
