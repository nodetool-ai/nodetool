import { describe, it, expect, vi } from "vitest";
import { ProcessingContext, ScriptedProvider } from "@nodetool-ai/runtime";
import {
  refToBytes,
  sourceContainerFromRef,
  topazExecuteImageTask,
  topazExecuteVideoTask,
  topazImageFields,
  type TopazVideoMetadata
} from "../src/topaz-base.js";

function contextWith(provider: ScriptedProvider): ProcessingContext {
  const ctx = new ProcessingContext({ jobId: "job-1" });
  ctx.setProviderResolver(() => provider);
  return ctx;
}

function predictions(ctx: ProcessingContext) {
  return ctx.getMessages().filter((m) => m.type === "prediction");
}

// ---------------------------------------------------------------------------
// refToBytes
// ---------------------------------------------------------------------------
describe("refToBytes", () => {
  it("decodes base64 string data", async () => {
    const bytes = await refToBytes({ data: Buffer.from("hi").toString("base64") });
    expect(Buffer.from(bytes).toString()).toBe("hi");
  });

  it("returns Uint8Array data as-is", async () => {
    const src = Uint8Array.from([1, 2, 3]);
    const bytes = await refToBytes({ data: src });
    expect([...bytes]).toEqual([1, 2, 3]);
  });

  it("decodes a data: URI", async () => {
    const uri = `data:image/png;base64,${Buffer.from("png").toString("base64")}`;
    const bytes = await refToBytes({ uri });
    expect(Buffer.from(bytes).toString()).toBe("png");
  });

  it("retrieves bytes from storage by URI", async () => {
    const storage = {
      retrieve: vi.fn().mockResolvedValue(Uint8Array.from([9, 8, 7]))
    };
    const bytes = await refToBytes(
      { uri: "/api/storage/x.png" },
      { storage } as never
    );
    expect(storage.retrieve).toHaveBeenCalledWith("/api/storage/x.png");
    expect([...bytes]).toEqual([9, 8, 7]);
  });

  it("resolves an asset:// ref via context.resolveAssetBytes", async () => {
    const png = Uint8Array.from([137, 80, 78, 71]);
    const ctx = {
      storage: { retrieve: vi.fn().mockResolvedValue(null) },
      resolveAssetBytes: vi.fn().mockResolvedValue({ bytes: png })
    };
    const bytes = await refToBytes(
      { type: "image", uri: "asset://asset-123" },
      ctx as never
    );
    expect(ctx.resolveAssetBytes).toHaveBeenCalledWith("asset://asset-123", {
      requireOwnedAsset: true
    });
    expect([...bytes]).toEqual([137, 80, 78, 71]);
  });

  it("falls through a zero-length data buffer to the uri", async () => {
    // `if (r.data)` was truthy for an empty Uint8Array, so a ref carrying an
    // empty buffer alongside a good uri resolved to zero bytes.
    const uri = `data:image/png;base64,${Buffer.from("png").toString("base64")}`;
    const bytes = await refToBytes({ data: new Uint8Array(0), uri });
    expect(Buffer.from(bytes).toString()).toBe("png");
  });

  it("throws when neither data nor uri is set", async () => {
    await expect(refToBytes({})).rejects.toThrow("Asset has no data or URI");
  });
});

// ---------------------------------------------------------------------------
// topazExecuteImageTask
// ---------------------------------------------------------------------------
describe("topazExecuteImageTask", () => {
  it("calls the image route with the bytes and pruned fields, then downloads the result", async () => {
    const provider = new ScriptedProvider([], {
      providerId: "topaz",
      endpoints: {
        "topaz/image/enhance": {
          output: { download_url: "https://cdn.topaz/result.png", head_url: "https://cdn.topaz/result.png?head", expiry: 0 },
          requestId: "pid-1"
        }
      },
      downloads: { "https://cdn.topaz/result.png": Uint8Array.from([42, 43]) }
    });
    const ctx = contextWith(provider);
    const image = Uint8Array.from([1, 2, 3]);

    const out = await topazExecuteImageTask(
      ctx,
      { modelId: "topaz/image/enhance", nodeId: "node-1" },
      { model: "Standard V2", output_width: 0, output_height: 512, prompt: "", sharpen: null },
      image
    );

    expect([...out]).toEqual([42, 43]);
    expect(provider.endpointCalls[0]).toMatchObject({
      model: "topaz/image/enhance",
      route: "image",
      input: { image, model: "Standard V2", output_height: 512 }
    });
    expect(Object.keys(provider.endpointCalls[0]?.input ?? {})).toEqual(["image", "model", "output_height"]);
    expect(provider.downloadCalls.map((call) => call.url)).toEqual(["https://cdn.topaz/result.png"]);
    expect(predictions(ctx).at(-1)).toMatchObject({
      status: "completed",
      provider: "topaz",
      capability: "upscale_image",
      model: "topaz/image/enhance",
      node_id: "node-1"
    });
  });

  it("throws when the download lookup names no URL", async () => {
    const provider = new ScriptedProvider([], { providerId: "topaz", endpoints: { "*": { output: { expiry: 0 } } } });

    await expect(
      topazExecuteImageTask(contextWith(provider), { modelId: "topaz/image/enhance" }, {}, Uint8Array.from([1]))
    ).rejects.toThrow("No download URL in response");
  });
});

describe("topazImageFields", () => {
  it("drops empty values and zero output dimensions, and keeps the rest typed", () => {
    expect(
      topazImageFields({ a: "", b: null, c: undefined, output_width: 0, output_height: 0, sharpen: 0, crop: false, model: "x" })
    ).toEqual({ sharpen: 0, crop: false, model: "x" });
  });
});

// ---------------------------------------------------------------------------
// sourceContainerFromRef
// ---------------------------------------------------------------------------
describe("sourceContainerFromRef", () => {
  it("prefers explicit format field", () => {
    expect(sourceContainerFromRef({ format: "mov", uri: "/tmp/x.mp4" })).toBe(
      "mov"
    );
  });

  it("strips a leading dot from format", () => {
    expect(sourceContainerFromRef({ format: ".MKV" })).toBe("mkv");
  });

  it("derives from URI extension when format is missing", () => {
    expect(sourceContainerFromRef({ uri: "/tmp/clip.MOV" })).toBe("mov");
    expect(sourceContainerFromRef({ uri: "https://x/y.webm?token=z" })).toBe(
      "webm"
    );
  });

  it("falls back to mp4 when nothing matches", () => {
    expect(sourceContainerFromRef({})).toBe("mp4");
    expect(sourceContainerFromRef({ uri: "/no/ext" })).toBe("mp4");
    expect(sourceContainerFromRef(null)).toBe("mp4");
  });
});

// ---------------------------------------------------------------------------
// topazExecuteVideoTask
// ---------------------------------------------------------------------------
describe("topazExecuteVideoTask", () => {
  const sourceMeta: TopazVideoMetadata = {
    resolution: { width: 1920, height: 1080 },
    container: "mov",
    size: 1024,
    duration: 1,
    frameRate: 30,
    frameCount: 30
  };

  it("sends the create body and source bytes on the video route, then downloads download.url", async () => {
    const provider = new ScriptedProvider([], {
      providerId: "topaz",
      endpoints: {
        "topaz/video/enhance": {
          output: { status: "complete", download: { url: "https://cdn.topaz/result.mov" } },
          requestId: "req-1"
        }
      },
      downloads: { "https://cdn.topaz/result.mov": Uint8Array.from([7, 7, 7]) }
    });
    const ctx = contextWith(provider);
    const video = Uint8Array.from(new Array(16).fill(1));

    const out = await topazExecuteVideoTask(
      ctx,
      { modelId: "topaz/video/enhance", videoKind: "upscale" },
      { model: "prob-4", output_container: "mp4", audio_mode: "copy" },
      video,
      sourceMeta
    );

    expect([...out]).toEqual([7, 7, 7]);
    const call = provider.endpointCalls[0];
    expect(call).toMatchObject({ model: "topaz/video/enhance", route: "video" });
    // The create body sends the *source* container, not the output container.
    expect(call?.input).toEqual({
      source: sourceMeta,
      output: {
        resolution: { width: 1920, height: 1080 },
        frameRate: 30,
        container: "mp4",
        videoEncoder: "H264",
        dynamicCompressionLevel: "Mid",
        audioTransfer: "Copy",
        audioCodec: "AAC"
      },
      filters: [{ model: "prob-4" }],
      video
    });
    expect(predictions(ctx).at(-1)).toMatchObject({
      status: "completed",
      provider: "topaz",
      capability: "upscale_video",
      model: "topaz/video/enhance"
    });
  });

  it("builds an interpolation filter and records the interpolation capability", async () => {
    const provider = new ScriptedProvider([], {
      providerId: "topaz",
      endpoints: { "*": { output: { status: "complete", download_url: "https://cdn.topaz/i.mp4" } } },
      downloads: { "https://cdn.topaz/i.mp4": Uint8Array.from([1]) }
    });
    const ctx = contextWith(provider);

    await topazExecuteVideoTask(
      ctx,
      { modelId: "topaz/video/interpolate", videoKind: "interpolate" },
      { model: "apo-8", slowmo: 2, fps: 60, duplicate: true, duplicate_threshold: 0.1 },
      Uint8Array.from([1, 2]),
      sourceMeta
    );

    expect(provider.endpointCalls[0]?.input.filters).toEqual([
      { model: "apo-8", slowmo: 2, fps: 60, duplicate: true, duplicateThreshold: 0.1 }
    ]);
    expect(predictions(ctx).at(-1)).toMatchObject({ capability: "interpolate_video" });
  });

  it("throws when the final status names no download URL", async () => {
    const provider = new ScriptedProvider([], { providerId: "topaz", endpoints: { "*": { output: { status: "complete" } } } });

    await expect(
      topazExecuteVideoTask(
        contextWith(provider),
        { modelId: "topaz/video/enhance", videoKind: "upscale" },
        { model: "prob-4" },
        Uint8Array.from([1]),
        sourceMeta
      )
    ).rejects.toThrow("No download URL in final status");
  });

  it("propagates a provider failure without downloading anything", async () => {
    const provider = new ScriptedProvider([], {
      providerId: "topaz",
      endpoints: { "*": new Error("Topaz create failed: 503 overloaded") }
    });

    await expect(
      topazExecuteVideoTask(
        contextWith(provider),
        { modelId: "topaz/video/enhance", videoKind: "upscale" },
        { model: "prob-4" },
        Uint8Array.from([1]),
        sourceMeta
      )
    ).rejects.toThrow("Topaz create failed: 503");
    expect(provider.downloadCalls).toEqual([]);
  });
});
