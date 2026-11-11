import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProcessingContext, ScriptedProvider } from "@nodetool-ai/runtime";

const assetToUrl = vi.fn(async (ref: Record<string, unknown>) =>
  ref.data
    ? `data:image/png;base64,${ref.data as string}`
    : `uploaded:${String(ref.uri)}`
);

vi.mock("../src/replicate-base.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/replicate-base.js")>()),
  assetToUrl
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

describe("Replicate prompt asset mapping", () => {
  let provider: ScriptedProvider;
  let ctx: ProcessingContext;

  /** The input of the one endpoint call the node made. */
  function sentInput(): Record<string, unknown> {
    expect(provider.endpointCalls).toHaveLength(1);
    return provider.endpointCalls[0]!.input;
  }

  beforeEach(() => {
    assetToUrl.mockClear();
    provider = new ScriptedProvider([], {
      providerId: "replicate",
      endpoints: { "*": { output: "out" } }
    });
    ctx = new ProcessingContext({ jobId: "job-1" });
    ctx.setProviderResolver(() => provider);
    vi.spyOn(ctx, "resolveAssetBytes").mockResolvedValue({
      bytes: assetBytes,
      attempts: []
    });
  });

  it("routes an asset:// mention into the empty image input and strips it", async () => {
    const NodeClass = makeI2INode();
    const instance = new NodeClass({});
    instance.assign({ prompt: "restyle asset://a.png now" });

    await instance.process(ctx);

    const args = sentInput();
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

    await instance.process(ctx);

    const args = sentInput();
    expect(args.image).toBe("uploaded:https://example.com/wired.png");
    expect(args.prompt).toBe("enhance now");
  });

  it("routes video and audio mentions into their respective inputs", async () => {
    const NodeClass = makeOmniNode();
    const instance = new NodeClass({});
    instance.assign({
      prompt: "drive asset://clip.mp4 with asset://track.wav"
    });

    await instance.process(ctx);

    const args = sentInput();
    expect(args.video).toContain(b64);
    expect(args.audio).toContain(b64);
    expect(args.prompt).toBe("drive video with audio");
  });
});
