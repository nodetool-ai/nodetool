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
