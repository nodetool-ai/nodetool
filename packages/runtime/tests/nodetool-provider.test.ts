import { describe, it, expect } from "vitest";

import { NodetoolProvider } from "../src/providers/nodetool-provider.js";

describe("NodetoolProvider", () => {
  it("lists no models when no platform key is set", async () => {
    const provider = new NodetoolProvider({});
    expect(await provider.getAvailableImageModels()).toEqual([]);
    expect(await provider.getAvailableVideoModels()).toEqual([]);
    expect(await provider.getAvailableLanguageModels()).toEqual([]);
    // The base class always advertises chat; media capabilities appear only
    // once a platform key funds them.
    expect(provider.getCapabilities().sort()).toEqual([
      "generate_message",
      "generate_messages"
    ]);
  });

  it("lists only the models whose delegate is funded, stamped nodetool", async () => {
    const provider = new NodetoolProvider({
      NODETOOL_PLATFORM_FAL_KEY: "platform-key"
    });
    const images = await provider.getAvailableImageModels();
    const videos = await provider.getAvailableVideoModels();
    expect(images.map((m) => m.id)).toContain("nodetool/flux-schnell");
    expect(videos.map((m) => m.id)).toContain("nodetool/kling-standard");
    for (const model of [...images, ...videos]) {
      expect(model.provider).toBe("nodetool");
    }
    // The language model delegates to anthropic, which is not funded here.
    expect(await provider.getAvailableLanguageModels()).toEqual([]);
    expect(provider.getCapabilities()).toContain("text_to_image");
    expect(provider.getCapabilities()).toContain("image_to_video");
  });

  it("refuses a call for an unfunded model with the platform key named", async () => {
    const provider = new NodetoolProvider({});
    await expect(
      provider.textToImage({
        model: {
          type: "image_model",
          id: "nodetool/flux-schnell",
          name: "x",
          provider: "nodetool"
        },
        prompt: "a fox"
      })
    ).rejects.toThrow(/NODETOOL_PLATFORM_FAL_KEY/);
  });

  it("rejects an unknown model id", async () => {
    const provider = new NodetoolProvider({
      NODETOOL_PLATFORM_FAL_KEY: "platform-key"
    });
    await expect(
      provider.textToImage({
        model: {
          type: "image_model",
          id: "nodetool/not-a-model",
          name: "x",
          provider: "nodetool"
        },
        prompt: "a fox"
      })
    ).rejects.toThrow(/Unknown NodeTool model/);
  });
});
