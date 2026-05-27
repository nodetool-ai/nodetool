import { describe, it, expect } from "vitest";
import { AtlasCloudProvider } from "../../src/providers/atlascloud-provider.js";

describe("AtlasCloudProvider — metadata", () => {
  it("reports provider id and required secrets", () => {
    const p = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    expect(p.provider).toBe("atlascloud");
    expect(AtlasCloudProvider.requiredSecrets()).toEqual(["ATLASCLOUD_API_KEY"]);
  });

  it("getContainerEnv exposes the API key", () => {
    const p = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    expect(p.getContainerEnv()).toEqual({ ATLASCLOUD_API_KEY: "k" });
  });

  it("chat generation throws (not supported)", async () => {
    const p = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    await expect(
      p.generateMessage({ messages: [], model: "x" } as never)
    ).rejects.toThrow("does not support chat generation");
    await expect(
      p.generateMessages({ messages: [], model: "x" } as never).next()
    ).rejects.toThrow("does not support chat generation");
  });
});

describe("AtlasCloudProvider — getAvailableImageModels", () => {
  it("returns an empty list when no API key is set", async () => {
    const p = new AtlasCloudProvider({});
    expect(await p.getAvailableImageModels()).toEqual([]);
  });

  it("exposes the 8 image entries from the manifest", async () => {
    const p = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    const models = await p.getAvailableImageModels();
    expect(models.length).toBe(8);
    for (const m of models) expect(m.provider).toBe("atlascloud");
    const ids = models.map((m) => m.id);
    expect(ids).toContain("openai/gpt-image-2/text-to-image");
    expect(ids).toContain("google/nano-banana-2/edit");
    expect(ids).toContain("google/nano-banana-pro/text-to-image-ultra");
  });
});

describe("AtlasCloudProvider — getAvailableVideoModels", () => {
  it("returns an empty list when no API key is set", async () => {
    const p = new AtlasCloudProvider({});
    expect(await p.getAvailableVideoModels()).toEqual([]);
  });

  it("exposes the 6 Seedance video entries with inferred tasks", async () => {
    const p = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    const models = await p.getAvailableVideoModels();
    expect(models.length).toBe(6);
    const byId = new Map(models.map((m) => [m.id, m]));
    expect(byId.get("bytedance/seedance-2.0/text-to-video")?.supportedTasks).toEqual([
      "text_to_video"
    ]);
    expect(byId.get("bytedance/seedance-2.0/image-to-video")?.supportedTasks).toEqual([
      "image_to_video"
    ]);
    // reference-to-video is multimodal: tagged both
    expect(
      byId.get("bytedance/seedance-2.0/reference-to-video")?.supportedTasks
    ).toEqual(["text_to_video", "image_to_video"]);
  });
});
