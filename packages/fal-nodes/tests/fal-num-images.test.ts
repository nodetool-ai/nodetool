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

describe("FAL single-output image generation", () => {
  beforeEach(() => {
    falSubmit.mockReset();
  });

  it("does not register num_images as a declared property", () => {
    const NodeClass = makeNode();
    const props = NodeClass.getDeclaredProperties();
    expect(props.find((p) => p.name === "num_images")).toBeUndefined();
  });

  it("forces num_images=1 even when an instance value is set", async () => {
    falSubmit.mockResolvedValue({ images: [{ url: "u1" }] });

    const NodeClass = makeNode();
    const instance = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    instance.assign({ prompt: "cat", num_images: 4 });

    await instance.process();

    expect(falSubmit).toHaveBeenCalledTimes(1);
    const args = falSubmit.mock.calls[0][2] as Record<string, unknown>;
    expect(args.num_images).toBe(1);
  });

  it("process() returns the first image even when the API returns several", async () => {
    falSubmit.mockResolvedValue({
      images: [{ url: "u1" }, { url: "u2" }, { url: "u3" }, { url: "u4" }]
    });

    const NodeClass = makeNode();
    const instance = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    instance.assign({ prompt: "cat" });

    const result = await instance.process();
    expect(result).toEqual({ output: { type: "image", uri: "u1" } });
  });

  it("does not declare streaming output or iteration correlation", () => {
    const NodeClass = makeNode();
    expect(
      (NodeClass as unknown as { isStreamingOutput?: boolean })
        .isStreamingOutput
    ).toBeFalsy();
    expect(NodeClass.outputCorrelation).toBeUndefined();
  });
});
