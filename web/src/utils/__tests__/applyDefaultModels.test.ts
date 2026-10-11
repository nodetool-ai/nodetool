import { applyDefaultModels } from "../applyDefaultModels";

jest.mock("../../stores/ModelPreferencesStore", () => {
  let state = { defaults: {} };
  const store = {
    getState: () => state,
    _setState: (s: typeof state) => { state = s; },
    subscribe: jest.fn()
  };
  return { __esModule: true, default: store };
});

import modelPreferencesStore from "../../stores/ModelPreferencesStore";

const setDefaults = (
  defaults: Record<
    string,
    { provider: string; id: string; name: string; supported_tasks?: string[] }
  >
) => {
  (modelPreferencesStore as any)._setState({ defaults });
};

afterEach(() => {
  setDefaults({});
});

describe("applyDefaultModels", () => {
  it("returns properties unchanged when no defaults are set", () => {
    setDefaults({});
    const props = { model: { type: "language_model", provider: "openai", id: "gpt-4", name: "GPT-4" } };
    const meta = [{ name: "model", type: { type: "language_model" } }];

    const result = applyDefaultModels(props, meta);
    expect(result.model).toEqual(props.model);
  });

  it("applies default when property is empty (provider is 'empty')", () => {
    setDefaults({
      language_model: { provider: "anthropic", id: "claude-sonnet", name: "Claude Sonnet" }
    });
    const props = { model: { type: "language_model", provider: "empty", id: "", name: "" } };
    const meta = [{ name: "model", type: { type: "language_model" } }];

    const result = applyDefaultModels(props, meta);
    expect(result.model).toEqual({
      type: "language_model",
      provider: "anthropic",
      id: "claude-sonnet",
      name: "Claude Sonnet"
    });
  });

  it("applies default when property is null", () => {
    setDefaults({
      image_model: { provider: "stability", id: "sdxl", name: "SDXL" }
    });
    const props = { model: null };
    const meta = [{ name: "model", type: { type: "image_model" } }];

    const result = applyDefaultModels(props, meta);
    expect(result.model).toEqual({
      type: "image_model",
      provider: "stability",
      id: "sdxl",
      name: "SDXL"
    });
  });

  it("does not override existing non-empty model", () => {
    setDefaults({
      language_model: { provider: "anthropic", id: "claude-sonnet", name: "Claude Sonnet" }
    });
    const props = { model: { type: "language_model", provider: "openai", id: "gpt-4", name: "GPT-4" } };
    const meta = [{ name: "model", type: { type: "language_model" } }];

    const result = applyDefaultModels(props, meta);
    expect((result.model as any).provider).toBe("openai");
  });

  it("ignores non-model-type properties", () => {
    setDefaults({
      language_model: { provider: "anthropic", id: "claude", name: "Claude" }
    });
    const props = { text: "hello" };
    const meta = [{ name: "text", type: { type: "string" } }];

    const result = applyDefaultModels(props, meta);
    expect(result.text).toBe("hello");
  });

  it("handles type as plain string", () => {
    setDefaults({
      tts_model: { provider: "elevenlabs", id: "voice-1", name: "Voice 1" }
    });
    const props = { voice: { type: "tts_model", provider: "", id: "", name: "" } };
    const meta = [{ name: "voice", type: "tts_model" }];

    const result = applyDefaultModels(props, meta);
    expect((result.voice as any).provider).toBe("elevenlabs");
  });

  it("handles multiple model properties", () => {
    setDefaults({
      language_model: { provider: "anthropic", id: "claude", name: "Claude" },
      image_model: { provider: "stability", id: "sdxl", name: "SDXL" }
    });
    const props = {
      llm: { type: "language_model", provider: "empty", id: "", name: "" },
      img: { type: "image_model", provider: "empty", id: "", name: "" }
    };
    const meta = [
      { name: "llm", type: { type: "language_model" } },
      { name: "img", type: { type: "image_model" } }
    ];

    const result = applyDefaultModels(props, meta);
    expect((result.llm as any).provider).toBe("anthropic");
    expect((result.img as any).provider).toBe("stability");
  });

  describe("image task defaults", () => {
    const blank = { type: "image_model", provider: "", id: "", name: "" };
    const meta = [{ name: "model", type: { type: "image_model" } }];
    const imageDefault = { provider: "fal_ai", id: "fal-ai/flux/schnell", name: "FLUX.1 Schnell" };
    const upscaleDefault = { provider: "fal_ai", id: "fal-ai/clarity-upscaler", name: "Clarity" };
    const cutoutDefault = { provider: "fal_ai", id: "fal-ai/bria/background/remove", name: "Bria" };

    it("fills Upscale and Remove Background from their own defaults", () => {
      setDefaults({
        image_model: imageDefault,
        "image_model:upscale": upscaleDefault,
        "image_model:remove_background": cutoutDefault
      });
      const upscaled = applyDefaultModels({ model: blank }, meta, "nodetool.image.Upscale");
      const cutout = applyDefaultModels({ model: blank }, meta, "nodetool.image.RemoveBackground");
      expect(upscaled.model).toEqual({ type: "image_model", ...upscaleDefault });
      expect(cutout.model).toEqual({ type: "image_model", ...cutoutDefault });
    });

    it("falls back to the image default when the task has none", () => {
      setDefaults({ image_model: imageDefault });
      const result = applyDefaultModels({ model: blank }, meta, "nodetool.image.Upscale");
      expect(result.model).toEqual({ type: "image_model", ...imageDefault });
    });

    it("keeps other image nodes on the image default", () => {
      setDefaults({
        image_model: imageDefault,
        "image_model:upscale": upscaleDefault
      });
      const result = applyDefaultModels({ model: blank }, meta, "nodetool.image.TextToImage");
      expect(result.model).toEqual({ type: "image_model", ...imageDefault });
    });
  });

  describe("task check", () => {
    const blank = { type: "video_model", provider: "", id: "", name: "" };
    const meta = [{ name: "model", type: { type: "video_model" } }];
    const textToVideo = {
      provider: "fal_ai",
      id: "kling-t2v",
      name: "Kling T2V",
      supported_tasks: ["text_to_video"]
    };

    it("skips a pinned model that does not support the node's task", () => {
      setDefaults({ video_model: textToVideo });
      const result = applyDefaultModels(
        { model: blank },
        meta,
        "nodetool.video.ReferenceToVideo"
      );
      expect(result.model).toEqual(blank);
    });

    it("applies a pinned model that supports the node's task", () => {
      setDefaults({ video_model: textToVideo });
      const result = applyDefaultModels(
        { model: blank },
        meta,
        "nodetool.video.TextToVideo"
      );
      expect((result.model as { id: string }).id).toBe("kling-t2v");
    });

    it("applies a pin saved without tasks, as before", () => {
      const { supported_tasks: _tasks, ...legacy } = textToVideo;
      setDefaults({ video_model: legacy });
      const result = applyDefaultModels(
        { model: blank },
        meta,
        "nodetool.video.ReferenceToVideo"
      );
      expect((result.model as { id: string }).id).toBe("kling-t2v");
    });
  });
});
