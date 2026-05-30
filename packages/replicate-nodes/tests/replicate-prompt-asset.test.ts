import { beforeEach, describe, expect, it, vi } from "vitest";

const assetToUrl = vi.fn(async (ref: Record<string, unknown>) =>
  ref.data
    ? `data:image/png;base64,${ref.data as string}`
    : `uploaded:${String(ref.uri)}`
);
const replicateSubmit = vi.fn(async () => ({ output: "out" }));

vi.mock("../src/replicate-base.js", () => ({
  assetToUrl,
  getReplicateApiKey: () => "test-key",
  isRefSet: (ref: unknown) => {
    if (!ref || typeof ref !== "object") return false;
    const r = ref as Record<string, unknown>;
    return Boolean(r.data || r.uri);
  },
  outputToAudioRef: (output: unknown) => ({ type: "audio", uri: output }),
  outputToImageRef: (output: unknown) => ({ type: "image", uri: output }),
  outputToString: (output: unknown) => String(output ?? ""),
  outputToVideoRef: (output: unknown) => ({ type: "video", uri: output }),
  removeNulls: (obj: Record<string, unknown>) => {
    for (const key of Object.keys(obj)) {
      if (obj[key] == null || obj[key] === "") delete obj[key];
    }
  },
  replicateSubmit
}));

const { createReplicateNodeClass } = await import("../src/replicate-factory.js");

function makeI2INode() {
  return createReplicateNodeClass({
    endpointId: "owner/i2i",
    className: "I2IModel",
    moduleName: "image.generate",
    docstring: "test",
    tags: [],
    useCases: [],
    outputType: "image",
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
    ],
    outputFields: [],
    enums: []
  });
}

function makeOmniNode() {
  return createReplicateNodeClass({
    endpointId: "owner/omni",
    className: "OmniModel",
    moduleName: "video.generate",
    docstring: "test",
    tags: [],
    useCases: [],
    outputType: "video",
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
        name: "video",
        propType: "video",
        tsType: "object",
        default: {
          type: "video",
          uri: "",
          asset_id: null,
          data: null,
          metadata: null,
          duration: null,
          format: null
        },
        description: "",
        fieldType: "input",
        required: false
      },
      {
        name: "audio",
        propType: "audio",
        tsType: "object",
        default: {
          type: "audio",
          uri: "",
          asset_id: null,
          data: null,
          metadata: null
        },
        description: "",
        fieldType: "input",
        required: false
      }
    ],
    outputFields: [],
    enums: []
  });
}

const assetBytes = new Uint8Array([7, 8, 9]);
const b64 = Buffer.from(assetBytes).toString("base64");
const ctx = { resolveAssetBytes: async () => ({ bytes: assetBytes }) };

describe("Replicate prompt asset mapping", () => {
  beforeEach(() => {
    assetToUrl.mockClear();
    replicateSubmit.mockClear();
  });

  it("routes an asset:// mention into the empty image input and strips it", async () => {
    const NodeClass = makeI2INode();
    const instance = new NodeClass({});
    instance.assign({ prompt: "restyle asset://a.png now" });

    await instance.process(ctx as never);

    const args = replicateSubmit.mock.calls[0][2] as Record<string, unknown>;
    expect(args.image).toBe(`data:image/png;base64,${b64}`);
    expect(args.prompt).toBe("restyle image now");
  });

  it("keeps a wired image input but strips the mention", async () => {
    const NodeClass = makeI2INode();
    const instance = new NodeClass({});
    instance.assign({
      prompt: "enhance asset://a.png now",
      image: { type: "image", uri: "https://example.com/wired.png" }
    });

    await instance.process(ctx as never);

    const args = replicateSubmit.mock.calls[0][2] as Record<string, unknown>;
    expect(args.image).toBe("uploaded:https://example.com/wired.png");
    expect(args.prompt).toBe("enhance now");
  });

  it("routes video and audio mentions into their respective inputs", async () => {
    const NodeClass = makeOmniNode();
    const instance = new NodeClass({});
    instance.assign({
      prompt: "drive asset://clip.mp4 with asset://track.wav"
    });

    await instance.process(ctx as never);

    const args = replicateSubmit.mock.calls[0][2] as Record<string, unknown>;
    expect(args.video).toContain(b64);
    expect(args.audio).toContain(b64);
    expect(args.prompt).toBe("drive video with audio");
  });
});
