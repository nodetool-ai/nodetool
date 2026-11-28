import { describe, it, expect, afterEach, vi } from "vitest";

import { NODETOOL_MODELS, resolveNodetoolDelegate } from "@nodetool-ai/protocol";

import { NodetoolProvider } from "../src/providers/nodetool-provider.js";
import { OpenRouterProvider } from "../src/providers/openrouter-provider.js";

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
    expect(
      videos.find((m) => m.id === "nodetool/kling-standard")?.supportedTasks
    ).toEqual(expect.arrayContaining(["text_to_video", "image_to_video"]));
    for (const model of [...images, ...videos]) {
      expect(model.provider).toBe("nodetool");
    }
    // The language model delegates to anthropic, which is not funded here.
    expect(await provider.getAvailableLanguageModels()).toEqual([]);
    expect(provider.getCapabilities()).toContain("text_to_image");
    expect(provider.getCapabilities()).toContain("image_to_video");
  });

  describe("the OpenRouter route", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("lists the free language model once the platform OpenRouter key is set", async () => {
      const provider = new NodetoolProvider({
        NODETOOL_PLATFORM_OPENROUTER_KEY: "platform-openrouter"
      });
      const models = await provider.getAvailableLanguageModels();
      expect(models.map((m) => m.id)).toEqual(["nodetool/free"]);
      expect(models[0].provider).toBe("nodetool");
      expect(resolveNodetoolDelegate("nodetool/free")).toEqual({
        provider: "openrouter",
        model: "openrouter/free"
      });
    });

    it("runs chat on OpenRouter with the platform key and the delegate model", async () => {
      const seen: { model: string; key: unknown }[] = [];
      vi.spyOn(OpenRouterProvider.prototype, "generateMessage").mockImplementation(
        async function (this: OpenRouterProvider, args) {
          seen.push({
            model: args.model,
            key: (this as unknown as { apiKey?: string }).apiKey
          });
          return { role: "assistant", content: "hi" };
        }
      );
      const provider = new NodetoolProvider({
        NODETOOL_PLATFORM_OPENROUTER_KEY: "platform-openrouter"
      });
      const reply = await provider.generateMessage({
        model: "nodetool/free",
        messages: [{ role: "user", content: "hello" }]
      });
      expect(reply.content).toBe("hi");
      expect(seen.map((s) => s.model)).toEqual(["openrouter/free"]);
      expect(seen[0].key).toBe("platform-openrouter");
    });

    it("refuses the free model when the platform OpenRouter key is missing", async () => {
      const provider = new NodetoolProvider({
        NODETOOL_PLATFORM_FAL_KEY: "platform-key"
      });
      await expect(
        provider.generateMessage({
          model: "nodetool/free",
          messages: [{ role: "user", content: "hello" }]
        })
      ).rejects.toThrow(/NODETOOL_PLATFORM_OPENROUTER_KEY/);
    });
  });

  it("lists the curated voices of a funded TTS model", async () => {
    const provider = new NodetoolProvider({
      NODETOOL_PLATFORM_FAL_KEY: "platform-key"
    });
    const [voiceModel] = await provider.getAvailableTTSModels();
    expect(voiceModel.provider).toBe("nodetool");
    expect(voiceModel.voices?.length).toBeGreaterThan(1);
    expect(provider.getCapabilities()).toContain("text_to_speech");
  });

  it("only claims image_to_image for models with an edit delegate", async () => {
    const provider = new NodetoolProvider({
      NODETOOL_PLATFORM_FAL_KEY: "platform-key"
    });
    const editable = NODETOOL_MODELS.filter(
      (def) => def.kind === "image" && def.editDelegate
    );
    expect(editable.length).toBeGreaterThan(0);
    const images = await provider.getAvailableImageModels();
    for (const model of images) {
      const def = NODETOOL_MODELS.find((d) => d.id === model.id);
      expect(model.supported_tasks?.includes("image_to_image")).toBe(
        Boolean(def?.editDelegate)
      );
    }
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

  it("routes image_to_image to the edit endpoint", () => {
    expect(resolveNodetoolDelegate("nodetool/nano-banana")?.model).toBe(
      "fal-ai/nano-banana"
    );
    expect(
      resolveNodetoolDelegate("nodetool/nano-banana", "image_to_image")?.model
    ).toBe("fal-ai/nano-banana/edit");
    // A model with no edit endpoint stays on its one delegate.
    expect(
      resolveNodetoolDelegate("nodetool/flux-schnell", "image_to_image")?.model
    ).toBe("fal-ai/flux-1/schnell");
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

  describe("the operator's model whitelist", () => {
    afterEach(() => {
      delete process.env.NODETOOL_CREDIT_MODELS;
    });

    const funded = () =>
      new NodetoolProvider({ NODETOOL_PLATFORM_FAL_KEY: "platform-key" });

    it("hides a funded model the whitelist leaves out", async () => {
      const before = await funded().getAvailableImageModels();
      expect(before.map((m) => m.id)).toContain("nodetool/seedream");

      process.env.NODETOOL_CREDIT_MODELS = "nodetool/flux-schnell";
      const after = await funded().getAvailableImageModels();
      expect(after.map((m) => m.id)).toEqual(["nodetool/flux-schnell"]);
      expect(await funded().getAvailableVideoModels()).toEqual([]);
      expect(await funded().getAvailableTTSModels()).toEqual([]);
      expect(funded().getCapabilities()).not.toContain("image_to_video");
    });

    it("refuses to serve a model the whitelist leaves out", async () => {
      process.env.NODETOOL_CREDIT_MODELS = "nodetool/flux-schnell";
      await expect(
        funded().textToImage({
          model: {
            type: "image_model",
            id: "nodetool/seedream",
            provider: "nodetool"
          },
          prompt: "a cat"
        } as Parameters<NodetoolProvider["textToImage"]>[0])
      ).rejects.toThrow(/not available on this server/);
    });
  });
});
