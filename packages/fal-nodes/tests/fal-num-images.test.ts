import { beforeEach, describe, expect, it, vi } from "vitest";

const falSubmit = vi.fn();

vi.mock("../src/fal-base.js", () => ({
  assetToFalUrl: vi.fn(),
  falImageToRef: (image: Record<string, unknown>) => ({
    type: "image",
    uri: image.url
  }),
  falSubmit,
  getFalApiKey: () => "test-key",
  imageToDataUrl: vi.fn(async () => null),
  isRefSet: () => false,
  removeNulls: (obj: Record<string, unknown>) => {
    for (const k of Object.keys(obj)) {
      if (obj[k] == null || obj[k] === "") delete obj[k];
    }
  }
}));

const { createFalNodeClass } = await import("../src/fal-factory.js");

function makeNode() {
  return createFalNodeClass({
    endpointId: "fal-ai/flux/schnell/redux",
    className: "FluxSchnellRedux",
    moduleName: "image",
    docstring: "test",
    tags: [],
    useCases: [],
    outputType: "image",
    outputFields: [{ name: "images", propType: "list[image]" }],
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
        name: "num_images",
        propType: "int",
        tsType: "number",
        default: 1,
        description: "",
        fieldType: "input",
        required: false,
        min: 1,
        max: 4
      }
    ]
  });
}

describe("FAL num_images", () => {
  beforeEach(() => {
    falSubmit.mockReset();
  });

  it("sends num_images to falSubmit", async () => {
    falSubmit.mockResolvedValue({ images: [{ url: "u1" }] });

    const NodeClass = makeNode();
    const instance = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    instance.assign({ prompt: "cat", num_images: 4 });

    for await (const _ of instance.genProcess()) {
      /* consume */
    }

    expect(falSubmit).toHaveBeenCalledTimes(1);
    const args = falSubmit.mock.calls[0][2] as Record<string, unknown>;
    expect(args.num_images).toBe(4);
  });

  it("yields one image per item in res.images", async () => {
    falSubmit.mockResolvedValue({
      images: [{ url: "u1" }, { url: "u2" }, { url: "u3" }, { url: "u4" }]
    });

    const NodeClass = makeNode();
    const instance = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    instance.assign({ prompt: "cat", num_images: 4 });

    const yields: unknown[] = [];
    for await (const out of instance.genProcess()) {
      yields.push(out);
    }
    expect(yields).toHaveLength(4);
  });

  it("marks each generated image as a correlated iteration item", () => {
    const NodeClass = makeNode();

    expect(NodeClass.outputCorrelation).toEqual({
      output: { kind: "iteration", source: "__execution__" }
    });
    expect(NodeClass.toDescriptor("fal").output_correlation).toEqual({
      output: { kind: "iteration", source: "__execution__" }
    });
  });
});
