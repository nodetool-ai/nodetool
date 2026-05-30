import { beforeEach, describe, expect, it, vi } from "vitest";

const falSubmit = vi.fn();

vi.mock("../src/fal-base.js", () => ({
  assetToFalUrl: vi.fn(async (_key: string, ref: Record<string, unknown>) =>
    ref?.data ? `falcdn:${ref.data as string}` : "https://fal.media/uploaded"
  ),
  falImageToRef: (image: Record<string, unknown>) => ({
    type: "image",
    uri: image.url
  }),
  falSubmit,
  getFalApiKey: () => "test-key",
  imageToDataUrl: vi.fn(async (ref: Record<string, unknown> | undefined) =>
    ref?.data ? `data:image/png;base64,${ref.data as string}` : null
  ),
  isRefSet: (ref: unknown) =>
    !!ref && typeof ref === "object" && Boolean((ref as Record<string, unknown>).data || (ref as Record<string, unknown>).uri),
  removeNulls: (obj: Record<string, unknown>) => {
    for (const k of Object.keys(obj)) {
      if (obj[k] == null || obj[k] === "") delete obj[k];
    }
  }
}));

const { createFalNodeClass } = await import("../src/fal-factory.js");

function makeI2INode() {
  return createFalNodeClass({
    endpointId: "fal-ai/flux/dev/image-to-image",
    className: "FluxDevI2I",
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
        name: "image_url",
        propType: "image",
        tsType: "object",
        default: {
          type: "image",
          uri: "",
          asset_id: null,
          data: null,
          metadata: null
        },
        description: "",
        fieldType: "input",
        required: false
      }
    ]
  });
}

const assetBytes = new Uint8Array([10, 20, 30, 40]);
const b64 = Buffer.from(assetBytes).toString("base64");
const ctx = { resolveAssetBytes: async () => ({ bytes: assetBytes }) };

describe("FAL prompt asset mapping", () => {
  beforeEach(() => {
    falSubmit.mockReset();
    falSubmit.mockResolvedValue({ images: [{ url: "out" }] });
  });

  it("routes an asset:// mention into the empty image input and strips it", async () => {
    const NodeClass = makeI2INode();
    const node = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    node.assign({ prompt: "make it pop asset://a.png please" });

    await node.process(ctx as never);

    const args = falSubmit.mock.calls[0][2] as Record<string, unknown>;
    expect(args.image_url).toBe(`data:image/png;base64,${b64}`);
    expect(args.prompt).toBe("make it pop image_url please");
  });

  it("leaves a wired image input untouched but strips the mention", async () => {
    const NodeClass = makeI2INode();
    const node = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    node.assign({
      prompt: "enhance asset://a.png now",
      image_url: {
        type: "image",
        uri: "",
        asset_id: null,
        data: "WIRED",
        metadata: null
      }
    });

    await node.process(ctx as never);

    const args = falSubmit.mock.calls[0][2] as Record<string, unknown>;
    expect(args.image_url).toBe("data:image/png;base64,WIRED");
    expect(args.prompt).toBe("enhance now");
  });
});

function imageField(name: string) {
  return {
    name,
    propType: "image",
    tsType: "object",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    description: "",
    fieldType: "input",
    required: false
  };
}

/** A video node with two single frame inputs + a list[image] reference input. */
function makeMultiFrameVideoNode() {
  return createFalNodeClass({
    endpointId: "fal-ai/kling/multi-frame",
    className: "KlingMultiFrame",
    moduleName: "video",
    docstring: "test",
    tags: [],
    useCases: [],
    outputType: "video",
    outputFields: [{ name: "video", propType: "video" }],
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
      imageField("image_url"),
      imageField("tail_image_url"),
      {
        ...imageField("reference_image_urls"),
        propType: "list[image]",
        default: []
      }
    ]
  });
}

describe("FAL multi-image video mapping", () => {
  beforeEach(() => {
    falSubmit.mockReset();
    falSubmit.mockResolvedValue({ video: { url: "out.mp4" } });
  });

  it("maps as many prompt mentions as there are image inputs", async () => {
    const NodeClass = makeMultiFrameVideoNode();
    const node = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    node.assign({
      prompt: "from asset://a.png to asset://b.jpg via asset://c.webp end"
    });

    await node.process(ctx as never);

    const args = falSubmit.mock.calls[0][2] as Record<string, unknown>;
    // First two single frame inputs take the first two mentions...
    expect(args.image_url).toBe(`data:image/png;base64,${b64}`);
    expect(args.tail_image_url).toBe(`data:image/png;base64,${b64}`);
    // ...and the list input absorbs the remainder (uploaded via the CDN path).
    expect(args.reference_image_urls).toEqual([`falcdn:${b64}`]);
    // Each mention is relabeled to the input slot it was routed into.
    expect(args.prompt).toBe(
      "from image_url to tail_image_url via reference_image_urls[0] end"
    );
  });

  it("fills only what it can when there are fewer mentions than inputs", async () => {
    const NodeClass = makeMultiFrameVideoNode();
    const node = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    node.assign({ prompt: "start from asset://a.png only" });

    await node.process(ctx as never);

    const args = falSubmit.mock.calls[0][2] as Record<string, unknown>;
    expect(args.image_url).toBe(`data:image/png;base64,${b64}`);
    // No second mention → tail frame and reference list stay empty (dropped by removeNulls).
    expect(args.tail_image_url).toBeUndefined();
    expect(args.reference_image_urls).toBeUndefined();
    expect(args.prompt).toBe("start from image_url only");
  });
});
