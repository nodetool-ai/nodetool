import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isSafeHttpUrl,
  resolveAssetBytes,
  resolveVideoDimensions,
  togetherGenerateImage,
  togetherGenerateVideo,
  togetherTextToSpeech,
  togetherTranscribe
} from "../src/together-base.js";

import { ProcessingContext, ScriptedProvider } from "@nodetool-ai/runtime";
import type { ScriptedEndpointReply } from "@nodetool-ai/runtime";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

/** A context whose `together` provider answers from scripted replies. */
function scripted(
  reply: ScriptedEndpointReply,
  downloads: Record<string, Uint8Array> = {}
): { provider: ScriptedProvider; context: ProcessingContext } {
  const provider = new ScriptedProvider([], {
    providerId: "together",
    endpoints: { "*": reply },
    downloads
  });
  const context = new ProcessingContext({ jobId: "job-1" });
  context.setProviderResolver(() => provider);
  return { provider, context };
}

// ---------------------------------------------------------------------------
// resolveAssetBytes
// ---------------------------------------------------------------------------
describe("resolveAssetBytes", () => {
  it("decodes inline base64 data", async () => {
    const out = await resolveAssetBytes({ data: "aGVsbG8=" }, undefined, "image");
    expect(Buffer.from(out!).toString()).toBe("hello");
  });

  it("decodes an inline data: URI", async () => {
    const out = await resolveAssetBytes(
      { data: "data:image/png;base64,aGVsbG8=" },
      undefined,
      "image"
    );
    expect(Buffer.from(out!).toString()).toBe("hello");
  });

  it("passes through inline Uint8Array data", async () => {
    const bytes = Uint8Array.from([1, 2, 3]);
    const out = await resolveAssetBytes({ data: bytes }, undefined, "audio");
    expect(out).toBe(bytes);
  });

  it("materializes internal URIs via context.storage", async () => {
    const bytes = Uint8Array.from([9, 9]);
    const storage = { retrieve: vi.fn().mockResolvedValue(bytes) };
    const out = await resolveAssetBytes(
      { uri: "/api/storage/x.png" },
      { storage } as never,
      "image"
    );
    expect(storage.retrieve).toHaveBeenCalledWith("/api/storage/x.png");
    expect(Array.from(out!)).toEqual([9, 9]);
  });

  it("resolves an asset:// uri via context.resolveAssetBytes", async () => {
    const pngBytes = Uint8Array.from([137, 80, 78, 71]);
    const storage = { retrieve: vi.fn().mockResolvedValue(null) };
    const resolve = vi.fn().mockResolvedValue({ bytes: pngBytes });
    const out = await resolveAssetBytes(
      { type: "image", uri: "asset://asset-123" },
      { storage, resolveAssetBytes: resolve } as never,
      "image"
    );
    expect(resolve).toHaveBeenCalledWith("asset://asset-123", { requireOwnedAsset: true });
    expect(Array.from(out!)).toEqual([137, 80, 78, 71]);
  });

  it.each(["file:///etc/passwd", "/etc/passwd", "C:\\secret.png", "/api/storage/../../etc/passwd", "/api/storage/%2e%2e%2fsecret"])(
    "denies local source %s before consulting permissive storage", async (uri) => {
      const retrieve = vi.fn().mockResolvedValue(new Uint8Array([1]));
      await expect(resolveAssetBytes({ uri }, { storage: { retrieve } }, "image"))
        .rejects.toThrow("Cannot resolve");
      expect(retrieve).not.toHaveBeenCalled();
    }
  );

  it.each([{ asset_id: "owned" }, { uri: "asset://owned" }, { uri: "package://core/test.png" }])(
    "routes reference %j through owned canonical resolution", async (ref) => {
      const resolve = vi.fn().mockResolvedValue({ bytes: new Uint8Array([8]) });
      expect(await resolveAssetBytes(ref, { resolveAssetBytes: resolve }, "image"))
        .toEqual(new Uint8Array([8]));
      expect(resolve).toHaveBeenCalledWith(ref.uri ?? "asset://owned", { requireOwnedAsset: true });
    }
  );

  it("does not bypass a foreign asset denial through storage", async () => {
    const retrieve = vi.fn().mockResolvedValue(new Uint8Array([1]));
    expect(await resolveAssetBytes({ asset_id: "foreign" }, {
      resolveAssetBytes: vi.fn().mockResolvedValue({ bytes: null }), storage: { retrieve }
    }, "image")).toBeNull();
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("uses canonical percent-encoded data URI decoding", async () => {
    expect(await resolveAssetBytes({ data: "data:text/plain,hello%20world" }, undefined, "audio"))
      .toEqual(new TextEncoder().encode("hello world"));
    expect(await resolveAssetBytes({ data: "data:text/plain,%invalid" }, undefined, "audio"))
      .toBeNull();
  });

  it.each(["owner/owned.wav", "owned.wav"])(
    "resolves stored layout %s through ProcessingContext", async (key) => {
      const storage = new InMemoryStorageAdapter();
      await storage.store(key, new Uint8Array([7]));
      const context = new ProcessingContext({
        jobId: "together-media", userId: "owner", storage,
        modelInterfaces: { getAssetInfo: async ({ assetId }) => assetId === "owned"
          ? { id: "owned", name: "tone.wav", content_type: "audio/wav", metadata: null }
          : null }
      });
      expect(await resolveAssetBytes({ asset_id: "owned" }, context, "audio"))
        .toEqual(new Uint8Array([7]));
    }
  );

  it("rejects a public URL redirecting to private HTTP", async () => {
    global.fetch = vi.fn(async () => new Response(null, {
      status: 302, headers: { location: "http://127.0.0.1/private" }
    }));
    await expect(resolveAssetBytes({ uri: "https://cdn.example.org/a.png" }, undefined, "image"))
      .rejects.toThrow();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("fetches a public https url ref", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => Uint8Array.from([0xaa]).buffer
    })) as unknown as typeof fetch;
    const out = await resolveAssetBytes(
      "https://cdn.example.org/a.png",
      undefined,
      "image"
    );
    expect(Array.from(out!)).toEqual([0xaa]);
  });

  it("returns null for empty / null refs", async () => {
    expect(await resolveAssetBytes(null, undefined, "image")).toBeNull();
    expect(await resolveAssetBytes("", undefined, "image")).toBeNull();
  });

  describe("SSRF guard — never fetches private / loopback / metadata hosts", () => {
    const blocked = [
      "http://localhost/a.png",
      "http://foo.localhost/a.png",
      "http://127.0.0.1/a.png",
      "http://127.1/a.png",
      "http://0177.0.0.1/a.png",
      "http://0x7f.0.0.1/a.png",
      "http://0.0.0.0/a.png",
      "http://10.0.0.5/a.png",
      "http://192.168.1.10/a.png",
      "http://172.16.0.1/a.png",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/a.png",
      "http://[::ffff:127.0.0.1]/a.png",
      "http://[fe80::1]/a.png",
      "http://[fe90::1]/a.png",
      "http://[64:ff9b::7f00:1]/a.png",
      "http://[fc00::1]/a.png"
    ];
    for (const uri of blocked) {
      it(`rejects ${uri}`, async () => {
        const fetchSpy = vi.fn();
        global.fetch = fetchSpy as unknown as typeof fetch;
        await expect(
          resolveAssetBytes({ uri }, undefined, "image")
        ).rejects.toThrow("Cannot resolve");
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(isSafeHttpUrl(uri)).toBe(false);
      });
    }
  });
});

// ---------------------------------------------------------------------------
// resolveVideoDimensions
// ---------------------------------------------------------------------------
describe("resolveVideoDimensions", () => {
  it("maps known aspect + resolution presets", () => {
    expect(resolveVideoDimensions("16:9", "720p")).toEqual({ width: 1280, height: 720 });
    expect(resolveVideoDimensions("9:16", "1080p")).toEqual({ width: 1080, height: 1920 });
  });
  it("falls back to the MiniMax default for unknown combos", () => {
    expect(resolveVideoDimensions("21:9", "8k")).toEqual({ width: 1366, height: 768 });
  });
});

// ---------------------------------------------------------------------------
// togetherGenerateImage
// ---------------------------------------------------------------------------
describe("togetherGenerateImage", () => {
  it("calls the images route and decodes b64_json", async () => {
    const { provider, context } = scripted({
      output: { data: [{ b64_json: "aGVsbG8=" }] }
    });

    const out = await togetherGenerateImage(
      context,
      "black-forest-labs/FLUX.1-schnell",
      { prompt: "a cat", width: 1024, height: 768, seed: 7 },
      "text_to_image",
      "node-1"
    );
    expect(Buffer.from(out).toString()).toBe("hello");
    expect(provider.endpointCalls[0]).toMatchObject({
      model: "black-forest-labs/FLUX.1-schnell",
      route: "images",
      input: {
        model: "black-forest-labs/FLUX.1-schnell",
        prompt: "a cat",
        width: 1024,
        height: 768,
        seed: 7,
        response_format: "b64_json"
      }
    });
    const prediction = context
      .getMessages()
      .filter((m) => m.type === "prediction")
      .at(-1);
    expect(prediction).toMatchObject({
      status: "completed",
      provider: "together",
      capability: "text_to_image",
      model: "black-forest-labs/FLUX.1-schnell",
      node_id: "node-1"
    });
  });

  it("downloads a URL result through the provider", async () => {
    const url = "https://cdn.together.ai/a.png";
    const { provider, context } = scripted(
      { output: { data: [{ url }] } },
      { [url]: Uint8Array.from([4, 2]) }
    );
    const out = await togetherGenerateImage(
      context,
      "m",
      { prompt: "x" },
      "text_to_image"
    );
    expect([...out]).toEqual([4, 2]);
    expect(provider.downloadCalls.map((call) => call.url)).toEqual([url]);
  });

  it("throws on a reply with no image", async () => {
    const { context } = scripted({ output: { data: [] } });
    await expect(
      togetherGenerateImage(context, "m", { prompt: "x" }, "text_to_image")
    ).rejects.toThrow("Together image generation returned no data.");
    const empty = scripted({ output: { data: [{}] } });
    await expect(
      togetherGenerateImage(empty.context, "m", { prompt: "x" }, "text_to_image")
    ).rejects.toThrow("Together image generation returned no image data.");
  });

  it("rejects an empty prompt before calling the provider", async () => {
    const { provider, context } = scripted({ output: {} });
    await expect(
      togetherGenerateImage(context, "m", { prompt: "" }, "text_to_image")
    ).rejects.toThrow("The input prompt cannot be empty.");
    expect(provider.endpointCalls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// togetherTextToSpeech
// ---------------------------------------------------------------------------
describe("togetherTextToSpeech", () => {
  it("returns the provider's audio bytes with the format's mime type", async () => {
    const { provider, context } = scripted({ output: Uint8Array.from([1, 2]) });
    const out = await togetherTextToSpeech(context, "hexgrad/Kokoro-82M", {
      text: "hi",
      format: "WAV"
    });
    expect(out).toEqual({ data: Uint8Array.from([1, 2]), mimeType: "audio/wav" });
    expect(provider.endpointCalls[0]).toMatchObject({
      route: "audio/speech",
      input: {
        model: "hexgrad/Kokoro-82M",
        input: "hi",
        voice: "tara",
        response_format: "wav"
      }
    });
  });
});

// ---------------------------------------------------------------------------
// togetherTranscribe
// ---------------------------------------------------------------------------
describe("togetherTranscribe", () => {
  it("sends the audio bytes as the file field and returns the text", async () => {
    const { provider, context } = scripted({ output: { text: "hello world" } });
    const audio = Uint8Array.from([1, 2, 3]);

    const text = await togetherTranscribe(context, "openai/whisper-large-v3", {
      audio,
      language: "en"
    });
    expect(text).toBe("hello world");
    expect(provider.endpointCalls[0]).toMatchObject({
      model: "openai/whisper-large-v3",
      route: "audio/transcriptions",
      input: { file: audio, response_format: "json", language: "en" }
    });
    const prediction = context
      .getMessages()
      .filter((m) => m.type === "prediction")
      .at(-1);
    expect(prediction).toMatchObject({
      capability: "automatic_speech_recognition",
      params: { file: { bytes: 3 } }
    });
  });

  it("rejects empty audio", async () => {
    const { context } = scripted({ output: {} });
    await expect(
      togetherTranscribe(context, "m", { audio: new Uint8Array(0) })
    ).rejects.toThrow("audio must not be empty");
  });
});

// ---------------------------------------------------------------------------
// togetherGenerateVideo
// ---------------------------------------------------------------------------
describe("togetherGenerateVideo", () => {
  const url = "https://cdn.together.ai/v.mp4";

  it("calls the videos route and downloads the result", async () => {
    const { provider, context } = scripted(
      {
        output: { id: "job-1", status: "completed", outputs: { video_url: url } },
        requestId: "job-1"
      },
      { [url]: Uint8Array.from([9]) }
    );
    const out = await togetherGenerateVideo(
      context,
      "minimax/video-01",
      { prompt: "a sunset", durationSeconds: 6, aspectRatio: "1:1" },
      "text_to_video"
    );
    expect([...out]).toEqual([9]);
    expect(provider.endpointCalls[0]).toMatchObject({
      route: "videos",
      input: {
        model: "minimax/video-01",
        prompt: "a sunset",
        width: 720,
        height: 720,
        seconds: "6"
      }
    });
    expect(provider.downloadCalls.map((call) => call.url)).toEqual([url]);
  });

  it("throws when the final status has no video URL", async () => {
    const { context } = scripted({ output: { status: "completed" } });
    await expect(
      togetherGenerateVideo(context, "m", { prompt: "x" }, "text_to_video")
    ).rejects.toThrow("Together video generation returned no video URL.");
  });

  it("stops a submitted job when the run is cancelled", async () => {
    const { provider, context } = scripted({ output: {} });
    const controller = new AbortController();
    context.signal = controller.signal;
    controller.abort(new Error("cancelled"));
    await expect(
      togetherGenerateVideo(context, "m", { prompt: "x" }, "text_to_video")
    ).rejects.toThrow("cancelled");
    expect(provider.endpointCalls[0].signal?.aborted).toBe(true);
  });
});
