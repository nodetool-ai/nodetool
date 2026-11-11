import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ProcessingContext,
  ScriptedProvider,
  type ScriptedEndpointReply
} from "@nodetool-ai/runtime";
import {
  cleanParams,
  hfChatCompletion,
  hfPipelineBinary,
  hfPipelineJson,
  imageRefFromBase64,
  imageRefFromBytes,
  isRefSet,
  refToBase64,
  refToBytes,
  videoRefFromBytes
} from "../src/huggingface-base.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("media ref helpers", () => {
  it("isRefSet detects data/uri presence", () => {
    expect(isRefSet(undefined)).toBe(false);
    expect(isRefSet({ type: "image" })).toBe(false);
    expect(isRefSet({ type: "image", uri: "http://x" })).toBe(true);
    expect(isRefSet({ type: "image", data: "abc" })).toBe(true);
  });

  it("refToBytes decodes a data URI", async () => {
    const bytes = await refToBytes({
      data: "data:image/png;base64," + Buffer.from("hello").toString("base64")
    });
    expect(Buffer.from(bytes).toString()).toBe("hello");
  });

  it("refToBytes decodes raw base64 in data", async () => {
    const bytes = await refToBytes({
      data: Buffer.from("world").toString("base64")
    });
    expect(Buffer.from(bytes).toString()).toBe("world");
  });

  it("refToBytes passes Uint8Array through", async () => {
    const src = new Uint8Array([1, 2, 3]);
    expect(await refToBytes({ data: src })).toBe(src);
  });

  it("refToBase64 round-trips bytes", async () => {
    const b64 = await refToBase64({ data: new Uint8Array([1, 2, 3]) });
    expect(Buffer.from(b64, "base64")).toEqual(Buffer.from([1, 2, 3]));
  });

  it("refToBytes falls through to uri when data is a zero-length buffer", async () => {
    const resolved = new Uint8Array([7, 8]);
    const resolveAssetBytes = vi.fn(async () => ({ bytes: resolved }));
    const bytes = await refToBytes(
      { data: new Uint8Array(0), uri: "asset://abc" },
      { resolveAssetBytes }
    );
    expect(bytes).toBe(resolved);
    expect(resolveAssetBytes).toHaveBeenCalledWith("asset://abc");
  });

  it("refToBytes throws on empty ref", async () => {
    await expect(refToBytes({})).rejects.toThrow(/empty/);
  });

  it("refToBytes resolves an asset:// uri via context, not fetch", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const ctx = {
      resolveAssetBytes: vi
        .fn()
        .mockResolvedValue({ bytes: Uint8Array.from([137, 80, 78, 71]) })
    };
    const bytes = await refToBytes({ type: "image", uri: "asset://asset-123" }, ctx);
    expect(Array.from(bytes)).toEqual([137, 80, 78, 71]);
    expect(ctx.resolveAssetBytes).toHaveBeenCalledWith("asset://asset-123");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refToBase64 resolves an asset:// uri via context", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const ctx = {
      resolveAssetBytes: vi
        .fn()
        .mockResolvedValue({ bytes: Uint8Array.from([137, 80, 78, 71]) })
    };
    const b64 = await refToBase64({ type: "image", uri: "asset://asset-123" }, ctx);
    expect(Buffer.from(b64, "base64")).toEqual(Buffer.from([137, 80, 78, 71]));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("output ref builders", () => {
  it("imageRefFromBytes emits raw base64 with content_type (no data: prefix)", () => {
    const ref = imageRefFromBytes(new Uint8Array([1, 2, 3]), "image/jpeg");
    expect(ref.type).toBe("image");
    expect(ref.content_type).toBe("image/jpeg");
    expect(String(ref.data)).not.toMatch(/^data:/);
    expect(ref.data).toBe(Buffer.from([1, 2, 3]).toString("base64"));
  });

  it("videoRefFromBytes emits raw base64 with content_type and format", () => {
    const ref = videoRefFromBytes(new Uint8Array([1]), "video/webm");
    expect(ref.type).toBe("video");
    expect(ref.content_type).toBe("video/webm");
    expect(ref.format).toBe("webm");
    expect(String(ref.data)).not.toMatch(/^data:/);
    expect(ref.data).toBe(Buffer.from([1]).toString("base64"));
  });

  it("imageRefFromBase64 strips an existing data prefix and stores raw base64", () => {
    const ref = imageRefFromBase64("data:image/png;base64,QUJD");
    expect(ref.data).toBe("QUJD");
    expect(ref.content_type).toBe("image/png");
  });
});

describe("cleanParams", () => {
  it("drops null/undefined/empty values", () => {
    expect(
      cleanParams({ a: 1, b: null, c: undefined, d: "", e: 0, f: false })
    ).toEqual({ a: 1, e: 0, f: false });
  });
});

function scripted(reply: ScriptedEndpointReply): { provider: ScriptedProvider; context: ProcessingContext } {
  const provider = new ScriptedProvider([], {
    providerId: "huggingface",
    endpoints: { "*": reply }
  });
  const context = new ProcessingContext({ jobId: "job-1" });
  context.setProviderResolver(async () => provider);
  return { provider, context };
}

describe("provider call helpers", () => {
  it("hfPipelineJson calls the task route and returns the JSON output", async () => {
    const { provider, context } = scripted({
      output: [{ label: "POSITIVE", score: 0.9 }]
    });

    const out = await hfPipelineJson({
      context,
      nodeId: "node-1",
      task: "text-classification",
      model: "some/model",
      body: { inputs: "hi" }
    });

    expect(out).toEqual([{ label: "POSITIVE", score: 0.9 }]);
    expect(provider.endpointCalls[0]).toMatchObject({
      model: "some/model",
      route: "text-classification",
      input: { inputs: "hi" }
    });
    const prediction = context
      .getMessages()
      .filter((message) => message.type === "prediction")
      .at(-1);
    expect(prediction).toMatchObject({
      status: "completed",
      provider: "huggingface",
      capability: "generate_message",
      model: "some/model",
      node_id: "node-1"
    });
  });

  it("hfPipelineJson surfaces provider errors", async () => {
    const { context } = scripted(
      new Error('Hugging Face inference failed for "bad/model" (404): model not found')
    );
    await expect(
      hfPipelineJson({
        context,
        task: "text-classification",
        model: "bad/model",
        body: { inputs: "hi" }
      })
    ).rejects.toThrow(/bad\/model.*404/);
  });

  it("the helpers need a processing context", async () => {
    await expect(
      hfPipelineJson({
        context: undefined,
        task: "fill-mask",
        model: "m",
        body: { inputs: "hi" }
      })
    ).rejects.toThrow(/processing context/);
  });

  it("hfPipelineBinary returns the provider's bytes and mime type", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const { context } = scripted({ output: { data: bytes, mimeType: "image/png" } });
    const result = await hfPipelineBinary({
      context,
      task: "text-to-image",
      model: "img/model",
      body: { inputs: "a cat" }
    });
    expect(result.mimeType).toBe("image/png");
    expect(Array.from(result.bytes)).toEqual([137, 80, 78, 71]);
  });

  it("hfPipelineBinary rejects an output without bytes", async () => {
    const { context } = scripted({ output: { image: "base64" } });
    await expect(
      hfPipelineBinary({
        context,
        task: "text-to-image",
        model: "img/model",
        body: { inputs: "a cat" }
      })
    ).rejects.toThrow(/no media for "img\/model"/);
  });

  it("hfChatCompletion calls the chat-completion route with the body's model", async () => {
    const { provider, context } = scripted({
      output: {
        choices: [{ message: { content: "Hello there" } }],
        usage: { prompt_tokens: 3, completion_tokens: 2 }
      }
    });
    const result = await hfChatCompletion({
      context,
      body: { model: "m", messages: [{ role: "user", content: "hi" }] }
    });
    expect(result.content).toBe("Hello there");
    expect(result.usage?.prompt_tokens).toBe(3);
    expect(provider.endpointCalls[0]).toMatchObject({
      model: "m",
      route: "chat-completion",
      input: { model: "m", messages: [{ role: "user", content: "hi" }] }
    });
  });
});
