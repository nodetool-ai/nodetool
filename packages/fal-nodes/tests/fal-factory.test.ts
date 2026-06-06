import { beforeEach, describe, expect, it, vi } from "vitest";

const assetToFalUrl = vi.fn(
  async (_apiKey: string, ref: Record<string, unknown>) =>
    `uploaded:${String(ref.uri)}`
);
const falSubmit = vi.fn(async () => ({ output: "ok" }));
const imageToDataUrl = vi.fn(async () => null);

vi.mock("../src/fal-base.js", () => ({
  assetToFalUrl,
  falImageToRef: (image: Record<string, unknown>) => ({
    type: "image",
    uri: image.url
  }),
  falSubmit,
  falSubmitWithMeta: async (...args) => ({ data: await falSubmit(...args), requestId: "req-test" }),
  getFalApiKey: () => "test-key",
  imageToDataUrl,
  isRefSet: (ref: unknown) => {
    if (!ref || typeof ref !== "object") return false;
    const r = ref as Record<string, unknown>;
    return Boolean(r.data || r.uri);
  },
  removeNulls: (obj: Record<string, unknown>) => {
    for (const key of Object.keys(obj)) {
      if (obj[key] == null || obj[key] === "") {
        delete obj[key];
      } else if (typeof obj[key] === "object" && !Array.isArray(obj[key])) {
        for (const nestedKey of Object.keys(obj[key] as Record<string, unknown>)) {
          const nested = obj[key] as Record<string, unknown>;
          if (nested[nestedKey] == null || nested[nestedKey] === "") {
            delete nested[nestedKey];
          }
        }
      }
    }
  }
}));

const { createFalNodeClass } = await import("../src/fal-factory.js");

describe("FAL factory argument building", () => {
  beforeEach(() => {
    assetToFalUrl.mockClear();
    falSubmit.mockClear();
    imageToDataUrl.mockClear();
    imageToDataUrl.mockResolvedValue(null);
  });

  it("builds nested asset objects from nestedAssetKey fields", async () => {
    const NodeClass = createFalNodeClass({
      endpointId: "fal-ai/test",
      className: "NestedAssetModel",
      moduleName: "image_to_image",
      docstring: "test",
      tags: [],
      useCases: [],
      outputType: "str",
      outputFields: [],
      enums: [],
      inputFields: [
        {
          name: "controlnet",
          propType: "image",
          tsType: "image",
          default: null,
          description: "",
          fieldType: "input",
          required: false,
          nestedAssetKey: "control_image_url"
        },
        {
          name: "strength",
          propType: "float",
          tsType: "number",
          default: 0.5,
          description: "",
          fieldType: "input",
          required: false,
          parentField: "controlnet"
        }
      ]
    });

    const instance = new NodeClass({});
    (instance as unknown as Record<string, unknown>).controlnet = {
      type: "image",
      uri: "https://example.com/control.png"
    };
    (instance as unknown as Record<string, unknown>).strength = 0.75;

    await instance.process();

    expect(falSubmit).toHaveBeenCalledWith("test-key", "fal-ai/test", {
      controlnet: {
        control_image_url: "uploaded:https://example.com/control.png",
        strength: 0.75
      }
    });
  });

  it("wraps a list[image] field with nestedAssetKey into [{ image_url }]", async () => {
    const NodeClass = createFalNodeClass({
      endpointId: "fal-ai/test",
      className: "WrapperListModel",
      moduleName: "image_to_image",
      docstring: "test",
      tags: [],
      useCases: [],
      outputType: "str",
      outputFields: [],
      enums: [],
      inputFields: [
        {
          name: "inputs",
          propType: "list[image]",
          tsType: "image[]",
          default: [],
          description: "",
          fieldType: "input",
          required: false,
          nestedAssetKey: "image_url"
        }
      ]
    });

    const instance = new NodeClass({});
    (instance as unknown as Record<string, unknown>).inputs = [
      { type: "image", uri: "https://example.com/a.png" },
      { type: "image", uri: "https://example.com/b.png" }
    ];

    await instance.process();

    expect(falSubmit).toHaveBeenCalledWith("test-key", "fal-ai/test", {
      inputs: [
        { image_url: "uploaded:https://example.com/a.png" },
        { image_url: "uploaded:https://example.com/b.png" }
      ]
    });
  });

  it("leaves a plain list[image] field (no nestedAssetKey) as bare URLs", async () => {
    const NodeClass = createFalNodeClass({
      endpointId: "fal-ai/test",
      className: "PlainListModel",
      moduleName: "image_to_image",
      docstring: "test",
      tags: [],
      useCases: [],
      outputType: "str",
      outputFields: [],
      enums: [],
      inputFields: [
        {
          name: "image_urls",
          propType: "list[image]",
          tsType: "image[]",
          default: [],
          description: "",
          fieldType: "input",
          required: false
        }
      ]
    });

    const instance = new NodeClass({});
    (instance as unknown as Record<string, unknown>).image_urls = [
      { type: "image", uri: "https://example.com/a.png" }
    ];

    await instance.process();

    expect(falSubmit).toHaveBeenCalledWith("test-key", "fal-ai/test", {
      image_urls: ["uploaded:https://example.com/a.png"]
    });
  });

  it("sends mask assets under mask_url api param", async () => {
    imageToDataUrl.mockResolvedValueOnce(null);
    imageToDataUrl.mockResolvedValueOnce("data:image/png;base64,abc");
    const NodeClass = createFalNodeClass({
      endpointId: "fal-ai/flux-pro/v1/fill",
      className: "FluxProFill",
      moduleName: "image_to_image",
      docstring: "test",
      tags: [],
      useCases: [],
      outputType: "image",
      outputFields: [],
      enums: [],
      inputFields: [
        {
          name: "prompt",
          propType: "str",
          tsType: "string",
          default: "",
          description: "",
          fieldType: "input",
          required: true
        },
        {
          name: "image",
          propType: "image",
          tsType: "image",
          default: null,
          description: "",
          fieldType: "input",
          required: true,
          apiParamName: "image_url"
        },
        {
          name: "mask",
          propType: "image",
          tsType: "image",
          default: null,
          description: "",
          fieldType: "input",
          required: true,
          apiParamName: "mask_url"
        }
      ]
    });

    const instance = new NodeClass({});
    (instance as unknown as Record<string, unknown>).prompt = "fill sky";
    (instance as unknown as Record<string, unknown>).image = {
      type: "image",
      uri: "https://example.com/base.png"
    };
    (instance as unknown as Record<string, unknown>).mask = {
      type: "image",
      data: "abc"
    };

    await instance.process();

    expect(falSubmit).toHaveBeenCalledWith(
      "test-key",
      "fal-ai/flux-pro/v1/fill",
      expect.objectContaining({
        image_url: "uploaded:https://example.com/base.png",
        mask_url: "data:image/png;base64,abc"
      })
    );
  });

  it("reads legacy apiParamName property when mask field is renamed", async () => {
    imageToDataUrl.mockResolvedValueOnce("data:image/png;base64,legacy");
    const NodeClass = createFalNodeClass({
      endpointId: "fal-ai/flux-pro/v1/fill",
      className: "FluxProFill",
      moduleName: "image_to_image",
      docstring: "test",
      tags: [],
      useCases: [],
      outputType: "str",
      outputFields: [],
      enums: [],
      inputFields: [
        {
          name: "mask",
          propType: "image",
          tsType: "image",
          default: null,
          description: "",
          fieldType: "input",
          required: true,
          apiParamName: "static_mask_url"
        }
      ]
    });

    const instance = new NodeClass({});
    (instance as unknown as Record<string, unknown>).static_mask_url = {
      type: "image",
      data: "legacy"
    };

    await instance.process();

    expect(falSubmit).toHaveBeenCalledWith("test-key", "fal-ai/flux-pro/v1/fill", {
      static_mask_url: "data:image/png;base64,legacy"
    });
  });

  it("throws a clear error when a required mask asset is missing", async () => {
    const NodeClass = createFalNodeClass({
      endpointId: "fal-ai/flux-pro/v1/fill",
      className: "FluxProFill",
      moduleName: "image_to_image",
      docstring: "test",
      tags: [],
      useCases: [],
      outputType: "str",
      outputFields: [],
      enums: [],
      inputFields: [
        {
          name: "mask",
          propType: "image",
          tsType: "image",
          default: null,
          description: "",
          fieldType: "input",
          required: true,
          apiParamName: "mask_url"
        }
      ]
    });

    await expect(new NodeClass({}).process()).rejects.toThrow(
      "Flux Pro Fill: Mask must be connected and match image dimensions"
    );
    expect(falSubmit).not.toHaveBeenCalled();
  });

  const makeNode = (overrides: Partial<Parameters<typeof createFalNodeClass>[0]>) =>
    createFalNodeClass({
      endpointId: "fal-ai/test",
      className: "OutModel",
      moduleName: "x",
      docstring: "test",
      tags: [],
      useCases: [],
      outputType: "str",
      outputFields: [],
      enums: [],
      inputFields: [],
      ...overrides
    });

  it("maps a singular `image` object output onto the `output` slot", async () => {
    falSubmit.mockResolvedValueOnce({
      image: { url: "https://fal.media/out.png", width: 64, height: 32 }
    });
    const NodeClass = makeNode({
      outputType: "image",
      outputFields: [
        { name: "image", propType: "image", tsType: "image", default: null, description: "", fieldType: "output", required: true }
      ]
    });
    const result = await new NodeClass({}).process();
    expect(result).toEqual({
      output: { type: "image", uri: "https://fal.media/out.png" }
    });
  });

  it("maps a `video_url` string output onto the `output` slot", async () => {
    falSubmit.mockResolvedValueOnce({ video_url: "https://fal.media/clip.mp4" });
    const NodeClass = makeNode({
      outputType: "video",
      outputFields: [
        { name: "video_url", propType: "video", tsType: "video", default: null, description: "", fieldType: "output", required: true }
      ]
    });
    const result = await new NodeClass({}).process();
    expect(result).toEqual({
      output: { type: "video", uri: "https://fal.media/clip.mp4" }
    });
  });

  it("maps an `audio_file` object output onto the `output` slot", async () => {
    falSubmit.mockResolvedValueOnce({
      audio_file: { url: "https://fal.media/sound.wav" }
    });
    const NodeClass = makeNode({
      outputType: "audio",
      outputFields: [
        { name: "audio_file", propType: "str", tsType: "string", default: null, description: "", fieldType: "output", required: true }
      ]
    });
    const result = await new NodeClass({}).process();
    expect(result).toEqual({
      output: { type: "audio", uri: "https://fal.media/sound.wav" }
    });
  });

  it("reads a `str` output from its declared field name (not `output`)", async () => {
    falSubmit.mockResolvedValueOnce({ voice_id: "abc-123" });
    const NodeClass = makeNode({
      outputType: "str",
      outputFields: [
        { name: "voice_id", propType: "str", tsType: "string", default: "", description: "", fieldType: "output", required: true }
      ]
    });
    const result = await new NodeClass({}).process();
    expect(result).toEqual({ output: "abc-123" });
  });

  it("forwards ProcessingContext to asset upload resolution", async () => {
    const NodeClass = createFalNodeClass({
      endpointId: "fal-ai/test",
      className: "ContextAssetModel",
      moduleName: "image_to_image",
      docstring: "test",
      tags: [],
      useCases: [],
      outputType: "str",
      outputFields: [],
      enums: [],
      inputFields: [
        {
          name: "image",
          propType: "image",
          tsType: "image",
          default: null,
          description: "",
          fieldType: "input",
          required: true
        }
      ]
    });

    const context = {
      storage: {
        retrieve: vi.fn()
      }
    };
    const instance = new NodeClass({});
    (instance as unknown as Record<string, unknown>).image = {
      type: "image",
      uri: "/api/storage/local.png"
    };

    await instance.process(context as never);

    expect(assetToFalUrl).toHaveBeenCalledWith(
      "test-key",
      { type: "image", uri: "/api/storage/local.png" },
      context
    );
  });
});
