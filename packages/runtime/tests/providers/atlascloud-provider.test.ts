import { describe, it, expect, vi, afterEach } from "vitest";
import { AtlasCloudProvider } from "../../src/providers/atlascloud-provider.js";
import type {
  ImageModel,
  VideoModel
} from "../../src/providers/types.js";

const imageModel = (id: string): ImageModel => ({
  id,
  name: id,
  provider: "atlascloud"
});
const videoModel = (id: string): VideoModel => ({
  id,
  name: id,
  provider: "atlascloud"
});

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

interface MockFetchOptions {
  /** Body shape sent to the submit endpoint, captured for assertions. */
  capture?: { submitUrl?: string; submitBody?: unknown };
  outputUrl?: string;
  resultBytes?: Uint8Array;
  /** Predicate to make the poll loop iterate before completing. */
  pollsUntilDone?: number;
}

function mockAtlasFetch(opts: MockFetchOptions = {}): void {
  const outputUrl = opts.outputUrl ?? "https://cdn.atlas/result.bin";
  const resultBytes = opts.resultBytes ?? Uint8Array.from([1, 2, 3]);
  let pollCalls = 0;
  global.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/generateImage") || u.endsWith("/generateVideo")) {
      if (opts.capture) {
        opts.capture.submitUrl = u;
        opts.capture.submitBody = JSON.parse(init!.body as string);
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: { id: "pred-x" } })
      } as Response;
    }
    if (u.includes("/prediction/pred-x")) {
      pollCalls++;
      const pendingPolls = opts.pollsUntilDone ?? 0;
      const status = pollCalls > pendingPolls ? "completed" : "running";
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () =>
          JSON.stringify({
            data: { status, outputs: [outputUrl] }
          })
      } as Response;
    }
    if (u === outputUrl) {
      return {
        ok: true,
        arrayBuffer: async () => resultBytes.buffer
      } as Response;
    }
    throw new Error(`unexpected fetch: ${u}`);
  }) as unknown as typeof fetch;
}

describe("AtlasCloudProvider — metadata", () => {
  it("reports provider id and required secrets", () => {
    const p = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    expect(p.provider).toBe("atlascloud");
    expect(AtlasCloudProvider.requiredSecrets()).toEqual(["ATLASCLOUD_API_KEY"]);
  });

  it("getContainerEnv exposes the API key", () => {
    const p = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    expect(p.getContainerEnv()).toEqual({ ATLASCLOUD_API_KEY: "k" });
  });

  it("requires an API key", () => {
    expect(() => new AtlasCloudProvider({})).toThrow(
      "ATLASCLOUD_API_KEY is required"
    );
  });
});

describe("AtlasCloudProvider — language models", () => {
  function mockModelsFetch(rows: unknown[]): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ code: 200, msg: "succeed", data: rows })
    })) as unknown as ReturnType<typeof vi.fn>;
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  it("lists chat models from the OpenAI-compatible /v1/models endpoint", async () => {
    const fetchMock = mockModelsFetch([
      { id: "deepseek-ai/DeepSeek-V3.1", name: "DeepSeek-V3.1" },
      { id: "openai/gpt-5.2" }
    ]);
    const p = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    expect(await p.getAvailableLanguageModels()).toEqual([
      {
        id: "deepseek-ai/DeepSeek-V3.1",
        name: "DeepSeek-V3.1",
        provider: "atlascloud"
      },
      { id: "openai/gpt-5.2", name: "openai/gpt-5.2", provider: "atlascloud" }
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.atlascloud.ai/v1/models",
      { headers: { Authorization: "Bearer k" } }
    );
  });

  it("reads tool support from the model's supported_features", async () => {
    mockModelsFetch([
      { id: "with-tools", supported_features: ["json_mode", "tools"] },
      { id: "no-tools", supported_features: ["json_mode"] }
    ]);
    const p = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    expect(await p.hasToolSupport("with-tools")).toBe(true);
    expect(await p.hasToolSupport("no-tools")).toBe(false);
    // An id the listing doesn't cover gets the benefit of the doubt.
    expect(await p.hasToolSupport("unlisted")).toBe(true);
  });

  it("returns no models when the listing fails", async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 500
    })) as unknown as typeof fetch;
    const p = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    expect(await p.getAvailableLanguageModels()).toEqual([]);
  });

  it("does not advertise audio or embedding models", async () => {
    const p = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    expect(await p.getAvailableTTSModels()).toEqual([]);
    expect(await p.getAvailableASRModels()).toEqual([]);
    expect(await p.getAvailableEmbeddingModels()).toEqual([]);
  });
});

describe("AtlasCloudProvider — getAvailableImageModels", () => {
  it("exposes the expected image entries from the manifest", async () => {
    const p = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    const models = await p.getAvailableImageModels();
    // Don't pin the count — the manifest grows over time, and pinning makes
    // every new model a brittle test failure. Pin known ids + invariants.
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) expect(m.provider).toBe("atlascloud");
    const ids = models.map((m) => m.id);
    expect(ids).toContain("openai/gpt-image-2/text-to-image");
    expect(ids).toContain("google/nano-banana-2/edit");
    expect(ids).toContain("google/nano-banana-pro/text-to-image-ultra");
  });
});

describe("AtlasCloudProvider — getAvailableVideoModels", () => {
  it("exposes Seedance video entries with the right inferred tasks", async () => {
    const p = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    const models = await p.getAvailableVideoModels();
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) expect(m.provider).toBe("atlascloud");
    const byId = new Map(models.map((m) => [m.id, m]));
    expect(byId.get("bytedance/seedance-2.0/text-to-video")?.supportedTasks).toEqual([
      "text_to_video"
    ]);
    expect(byId.get("bytedance/seedance-2.0/image-to-video")?.supportedTasks).toEqual([
      "image_to_video"
    ]);
    // reference-to-video is image-conditioned: it needs the reference stills,
    // so it is not an answer to a text_to_video search.
    expect(
      byId.get("bytedance/seedance-2.0/reference-to-video")?.supportedTasks
    ).toEqual(["image_to_video"]);
  });
});

describe("AtlasCloudProvider — textToImage", () => {
  it("rejects empty prompts", async () => {
    const p = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    await expect(
      p.textToImage({
        model: imageModel("openai/gpt-image-2/text-to-image"),
        prompt: ""
      })
    ).rejects.toThrow("Prompt is required");
  });

  it("rejects unknown models", async () => {
    const p = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    await expect(
      p.textToImage({
        model: imageModel("fictional/never/exists"),
        prompt: "x"
      })
    ).rejects.toThrow("Unknown AtlasCloud model");
  });

  it("rejects a video model used for textToImage", async () => {
    const p = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    await expect(
      p.textToImage({
        model: imageModel("bytedance/seedance-2.0/text-to-video"),
        prompt: "x"
      })
    ).rejects.toThrow("is a video model, not image");
  });

  it("maps width+height to `size` for gpt-image-2", async () => {
    const capture: { submitBody?: unknown } = {};
    mockAtlasFetch({ capture, resultBytes: Uint8Array.from([0xff, 0xd8, 1]) });
    const p = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    const out = await p.textToImage({
      model: imageModel("openai/gpt-image-2/text-to-image"),
      prompt: "a cat",
      width: 1024,
      height: 1536,
      quality: "high"
    });
    expect([...out]).toEqual([0xff, 0xd8, 1]);
    expect(capture.submitBody).toEqual({
      model: "openai/gpt-image-2/text-to-image",
      prompt: "a cat",
      quality: "high",
      size: "1024x1536"
    });
  });

  it("maps aspectRatio to `aspect_ratio` for nano-banana models", async () => {
    const capture: { submitBody?: unknown; submitUrl?: string } = {};
    mockAtlasFetch({ capture });
    const p = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    await p.textToImage({
      model: imageModel("google/nano-banana-2/text-to-image"),
      prompt: "a cat",
      aspectRatio: "16:9",
      resolution: "2k"
    });
    expect(capture.submitUrl).toBe(
      "https://api.atlascloud.ai/api/v1/model/generateImage"
    );
    expect(capture.submitBody).toEqual({
      model: "google/nano-banana-2/text-to-image",
      prompt: "a cat",
      aspect_ratio: "16:9",
      resolution: "2k"
    });
  });

  it("renders `size` with the separator the model's own default uses", async () => {
    const capture: { submitBody?: Record<string, unknown> } = {};
    mockAtlasFetch({ capture });
    const p = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    // Qwen declares a free-form `size` defaulting to "1024*1024" — asterisk,
    // not the "x" GPT Image uses.
    await p.textToImage({
      model: imageModel("qwen/qwen-image-2.0/text-to-image"),
      prompt: "a cat",
      width: 1280,
      height: 720
    });
    expect(capture.submitBody!.size).toBe("1280*720");
  });

  it("snaps `size` to the nearest declared option on enum models", async () => {
    const capture: { submitBody?: Record<string, unknown> } = {};
    mockAtlasFetch({ capture });
    const p = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    // Seedream only accepts a fixed list; 1600x1200 (4:3) is not on it.
    await p.textToImage({
      model: imageModel("bytedance/seedream-v5.0-pro/text-to-image"),
      prompt: "a cat",
      width: 1600,
      height: 1200
    });
    expect(capture.submitBody!.size).toBe("2304*1728");
  });

  it("drops a `size` request the model can't express", async () => {
    const capture: { submitBody?: Record<string, unknown> } = {};
    mockAtlasFetch({ capture });
    const p = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    // Wan's `size` is a 1K/2K tier enum — pixel dimensions have no mapping, so
    // the model default stands rather than a body the API would reject.
    await p.textToImage({
      model: imageModel("alibaba/wan-2.7/text-to-image"),
      prompt: "a cat",
      width: 1024,
      height: 1024
    });
    expect(capture.submitBody!.size).toBeUndefined();
  });

  it("routes a resolution tier onto Wan's `size` enum", async () => {
    const capture: { submitBody?: Record<string, unknown> } = {};
    mockAtlasFetch({ capture });
    const p = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    await p.textToImage({
      model: imageModel("alibaba/wan-2.7/text-to-image"),
      prompt: "a cat",
      resolution: "1K"
    });
    expect(capture.submitBody!.size).toBe("1K");
  });

  it("drops an aspect ratio the model does not declare", async () => {
    const capture: { submitBody?: Record<string, unknown> } = {};
    mockAtlasFetch({ capture });
    const p = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    await p.textToImage({
      model: imageModel("google/nano-banana-2/text-to-image"),
      prompt: "a cat",
      aspectRatio: "7:3"
    });
    expect(capture.submitBody!.aspect_ratio).toBeUndefined();
  });
});

describe("AtlasCloudProvider — imageToImage", () => {
  it("wraps bytes into a data: URI under `images: [...]` for /edit endpoints", async () => {
    const capture: { submitBody?: Record<string, unknown> } = {};
    mockAtlasFetch({ capture });
    const p = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    // PNG magic bytes so the mime detector picks image/png.
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2]);
    await p.imageToImage([png], {
      model: imageModel("google/nano-banana-2/edit"),
      prompt: "make it pink",
      aspectRatio: "1:1"
    });
    const body = capture.submitBody!;
    expect(body.model).toBe("google/nano-banana-2/edit");
    expect(body.prompt).toBe("make it pink");
    expect(body.aspect_ratio).toBe("1:1");
    expect(Array.isArray(body.images)).toBe(true);
    expect((body.images as string[])[0]).toMatch(
      /^data:image\/png;base64,/
    );
  });

  it("rejects empty input bytes", async () => {
    const p = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    await expect(
      p.imageToImage([new Uint8Array()], {
        model: imageModel("google/nano-banana-2/edit"),
        prompt: "x"
      })
    ).rejects.toThrow("image must not be empty");
  });
});

describe("AtlasCloudProvider — textToVideo", () => {
  it("maps aspectRatio to `ratio` and clamps durationSeconds to int", async () => {
    const capture: { submitBody?: unknown; submitUrl?: string } = {};
    mockAtlasFetch({ capture });
    const p = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    await p.textToVideo({
      model: videoModel("bytedance/seedance-2.0/text-to-video"),
      prompt: "a flying cat",
      aspectRatio: "9:16",
      resolution: "1080p",
      durationSeconds: 6.7
    });
    expect(capture.submitUrl).toBe(
      "https://api.atlascloud.ai/api/v1/model/generateVideo"
    );
    expect(capture.submitBody).toEqual({
      model: "bytedance/seedance-2.0/text-to-video",
      prompt: "a flying cat",
      ratio: "9:16",
      resolution: "1080p",
      duration: 6
    });
  });

  it("snaps a duration the model does not offer to the nearest one it does", async () => {
    const capture: { submitBody?: Record<string, unknown> } = {};
    mockAtlasFetch({ capture });
    const p = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    // Veo 3.1 only accepts 4, 6 or 8 seconds.
    await p.textToVideo({
      model: videoModel("google/veo3.1/text-to-video"),
      prompt: "a flying cat",
      durationSeconds: 10,
      seed: 42
    });
    expect(capture.submitBody!.duration).toBe(8);
    expect(capture.submitBody!.seed).toBe(42);
  });

  it("rejects an image model used for textToVideo", async () => {
    const p = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    await expect(
      p.textToVideo({
        model: videoModel("google/nano-banana-2/text-to-image"),
        prompt: "x"
      })
    ).rejects.toThrow("is a image model, not video");
  });
});

describe("AtlasCloudProvider — imageToVideo", () => {
  it("sets `image` (singular) on the Seedance i2v endpoint", async () => {
    const capture: { submitBody?: Record<string, unknown> } = {};
    mockAtlasFetch({ capture });
    const p = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    await p.imageToVideo(
      [Uint8Array.from([0xff, 0xd8, 0xff])], // JPEG magic
      {
        model: videoModel("bytedance/seedance-2.0/image-to-video"),
        prompt: "drift forward"
      }
    );
    const body = capture.submitBody!;
    expect(body.model).toBe("bytedance/seedance-2.0/image-to-video");
    expect(body.image).toMatch(/^data:image\/jpeg;base64,/);
    expect(body.images).toBeUndefined();
  });

  it("rejects models without an input image field (e.g. text-to-video)", async () => {
    const p = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    await expect(
      p.imageToVideo([Uint8Array.from([1])], {
        model: videoModel("bytedance/seedance-2.0/text-to-video"),
        prompt: "x"
      })
    ).rejects.toThrow("does not accept an input image");
  });

  it("falls back to `reference_images` on reference-to-video", async () => {
    const capture: { submitBody?: Record<string, unknown> } = {};
    mockAtlasFetch({ capture });
    const p = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    await p.imageToVideo([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])], {
      model: videoModel("bytedance/seedance-2.0/reference-to-video"),
      prompt: "spin it"
    });
    const body = capture.submitBody!;
    expect(Array.isArray(body.reference_images)).toBe(true);
    expect((body.reference_images as string[])[0]).toMatch(
      /^data:image\/png;base64,/
    );
  });
});
