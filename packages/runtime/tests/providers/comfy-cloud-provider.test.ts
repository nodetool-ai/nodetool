import { describe, it, expect } from "vitest";
import { ComfyCloudProvider } from "../../src/providers/comfy-cloud-provider.js";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";

async function drain(gen: AsyncGenerator<unknown>): Promise<unknown[]> {
  const items: unknown[] = [];
  for await (const item of gen) items.push(item);
  return items;
}

describe("ComfyCloudProvider — metadata", () => {
  it("reports provider id and required secrets", () => {
    const p = new ComfyCloudProvider({ COMFY_API_KEY: "k" });
    expect(p.provider).toBe(PROVIDER_IDS.COMFY_CLOUD);
    expect(p.provider).toBe("comfy_cloud");
    expect(ComfyCloudProvider.requiredSecrets()).toEqual(["COMFY_API_KEY"]);
  });

  it("getContainerEnv exposes the API key", () => {
    const p = new ComfyCloudProvider({ COMFY_API_KEY: "k" });
    expect(p.getContainerEnv()).toEqual({ COMFY_API_KEY: "k" });
  });

  it("constructs without a key", () => {
    const p = new ComfyCloudProvider();
    expect(p.getContainerEnv()).toEqual({ COMFY_API_KEY: "" });
  });
});

describe("ComfyCloudProvider — capabilities", () => {
  // The Comfy API v2 enumerates no models, so nothing derives a media
  // capability. Only chat's two entries are present, and both throw — a
  // capability appearing here means a getAvailable*Models override was added
  // without a model list behind it.
  it("declares no media capabilities", () => {
    const p = new ComfyCloudProvider({ COMFY_API_KEY: "k" });
    expect(p.getCapabilities().sort()).toEqual([
      "generate_message",
      "generate_messages"
    ]);
  });

  it("lists no models of any modality", async () => {
    const p = new ComfyCloudProvider({ COMFY_API_KEY: "k" });
    expect(await p.getAvailableLanguageModels()).toEqual([]);
    expect(await p.getAvailableImageModels()).toEqual([]);
    expect(await p.getAvailableVideoModels()).toEqual([]);
  });
});

describe("ComfyCloudProvider — chat", () => {
  it("generateMessage rejects", async () => {
    const p = new ComfyCloudProvider({ COMFY_API_KEY: "k" });
    await expect(
      p.generateMessage({ messages: [], model: "x" } as never)
    ).rejects.toThrow("does not support chat generation");
  });

  it("generateMessages rejects", async () => {
    const p = new ComfyCloudProvider({ COMFY_API_KEY: "k" });
    await expect(
      drain(p.generateMessages({ messages: [], model: "x" } as never))
    ).rejects.toThrow("does not support chat generation");
  });
});
