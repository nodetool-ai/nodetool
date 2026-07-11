import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FalProvider } from "../../src/providers/fal-provider.js";
import type {
  TextToImageParams,
  ImageToImageParams,
  InpaintingParams,
  TextToVideoParams,
  ImageToVideoParams,
  VideoToVideoParams,
  UpscaleImageParams,
  RemoveBackgroundParams,
  RelightImageParams,
  VectorizeImageParams,
  LipSyncParams
} from "../../src/providers/types.js";

// Mock the @fal-ai/client SDK — the shipped manifest that drives model
// discovery and request shaping is the REAL one.
const createFalClientMock = vi.fn((_opts: { credentials: string }) => ({
  subscribe: vi.fn(),
  storage: { upload: vi.fn() }
}));
vi.mock("@fal-ai/client", () => ({
  createFalClient: createFalClientMock
}));

function createProvider(apiKey = "test-key"): FalProvider {
  return new FalProvider({ FAL_API_KEY: apiKey });
}

/** A fetch that returns the given bytes with ok=true. */
function okFetch(bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers(),
    arrayBuffer: () => Promise.resolve(bytes.buffer)
  });
}

const IMG_MODEL = {
  id: "fal-ai/flux/dev",
  name: "FLUX",
  provider: "fal_ai" as const
};

describe("FalProvider — construction & metadata", () => {
  beforeEach(() => vi.clearAllMocks());

  it("declares FAL_API_KEY as a required secret", () => {
    expect(FalProvider.requiredSecrets()).toEqual(["FAL_API_KEY"]);
  });

  it("defaults apiKey to empty string when no secret provided", () => {
    const p = new FalProvider();
    expect((p as any).apiKey).toBe("");
  });

  it("lazily creates the fal client with credentials and caches it", async () => {
    const p = createProvider("secret-abc");
    const client1 = await (p as any).getClient();
    const client2 = await (p as any).getClient();
    expect(client1).toBe(client2);
    expect(createFalClientMock).toHaveBeenCalledTimes(1);
    expect(createFalClientMock).toHaveBeenCalledWith({
      credentials: "secret-abc"
    });
  });

  it("discovers video models from the manifest", async () => {
    const models = await createProvider().getAvailableVideoModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => m.provider === "fal_ai")).toBe(true);
  });

  it("discovers music models from the manifest", async () => {
    const models = await createProvider().getAvailableMusicModels();
    expect(models.length).toBeGreaterThan(0);
  });
});

describe("FalProvider — progress callback", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("emits a node_progress message per log line on IN_PROGRESS updates", async () => {
    const emitted: any[] = [];
    const subscribeMock = vi.fn(async (_id: string, opts: any) => {
      // Simulate fal queue events driving the handler.
      opts.onQueueUpdate({ status: "QUEUED" });
      opts.onQueueUpdate({
        status: "IN_PROGRESS",
        logs: [{ message: "step 1" }, { message: "step 2" }]
      });
      return { data: { images: [{ url: "https://fal.ai/r.png" }] } };
    });
    vi.stubGlobal("fetch", okFetch());

    const p = createProvider();
    p.setMessageEmitter((m) => emitted.push(m));
    (p as any)._client = { subscribe: subscribeMock };

    await p.textToImage({ prompt: "x", model: IMG_MODEL });

    const progress = emitted.filter((m) => m.type === "node_progress");
    expect(progress.map((m) => m.chunk)).toEqual(["step 1", "step 2"]);
    // tick increments per IN_PROGRESS event.
    expect(progress.every((m) => m.progress === 1)).toBe(true);
  });

  it("emits a heartbeat tick when IN_PROGRESS has no logs", async () => {
    const emitted: any[] = [];
    const subscribeMock = vi.fn(async (_id: string, opts: any) => {
      opts.onQueueUpdate({ status: "IN_PROGRESS" });
      opts.onQueueUpdate({ status: "IN_PROGRESS", logs: [] });
      return { data: { images: [{ url: "https://fal.ai/r.png" }] } };
    });
    vi.stubGlobal("fetch", okFetch());

    const p = createProvider();
    p.setMessageEmitter((m) => emitted.push(m));
    (p as any)._client = { subscribe: subscribeMock };

    await p.textToImage({ prompt: "x", model: IMG_MODEL });

    const progress = emitted.filter((m) => m.type === "node_progress");
    expect(progress).toHaveLength(2);
    expect(progress[0].chunk).toBe("");
    expect(progress[0].progress).toBe(1);
    expect(progress[1].progress).toBe(2);
  });
});

describe("FalProvider — textToImage arg shaping", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("maps aspectRatio to the flux image_size enum", async () => {
    let captured: any;
    const subscribeMock = vi.fn(async (_id: string, opts: any) => {
      captured = opts.input;
      return { data: { images: [{ url: "https://fal.ai/r.png" }] } };
    });
    vi.stubGlobal("fetch", okFetch());
    const p = createProvider();
    (p as any)._client = { subscribe: subscribeMock };

    await p.textToImage({
      prompt: "cat",
      model: IMG_MODEL,
      aspectRatio: "1:1"
    });
    expect(captured.image_size).toBe("square_hd");
    expect(captured.output_format).toBe("png");
    expect(captured.prompt).toBe("cat");
  });

  it("includes seed when a positive value is given", async () => {
    let captured: any;
    const subscribeMock = vi.fn(async (_id: string, opts: any) => {
      captured = opts.input;
      return { data: { images: [{ url: "https://fal.ai/r.png" }] } };
    });
    vi.stubGlobal("fetch", okFetch());
    const p = createProvider();
    (p as any)._client = { subscribe: subscribeMock };

    await p.textToImage({ prompt: "x", model: IMG_MODEL, seed: 99 });
    expect(captured.seed).toBe(99);
  });
});

describe("FalProvider — multi-image variants", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("textToImages returns a single image when numImages <= 1", async () => {
    const subscribeMock = vi
      .fn()
      .mockResolvedValue({ data: { images: [{ url: "https://fal.ai/a.png" }] } });
    vi.stubGlobal("fetch", okFetch());
    const p = createProvider();
    (p as any)._client = { subscribe: subscribeMock };

    const out = await p.textToImages({ prompt: "x", model: IMG_MODEL }, 1);
    expect(out).toHaveLength(1);
    expect(out[0]).toBeInstanceOf(Uint8Array);
    expect(subscribeMock).toHaveBeenCalledTimes(1);
  });

  it("textToImages sends num_images and downloads every returned url", async () => {
    let captured: any;
    const subscribeMock = vi.fn(async (_id: string, opts: any) => {
      captured = opts.input;
      return {
        data: {
          images: [
            { url: "https://fal.ai/a.png" },
            { url: "https://fal.ai/b.png" }
          ]
        }
      };
    });
    vi.stubGlobal("fetch", okFetch());
    const p = createProvider();
    (p as any)._client = { subscribe: subscribeMock };

    // flux/dev declares num_images.
    const out = await p.textToImages({ prompt: "x", model: IMG_MODEL }, 2);
    expect(out).toHaveLength(2);
    expect(captured.num_images).toBe(2);
  });

  it("imageToImages returns single result for numImages <= 1", async () => {
    const uploadMock = vi.fn().mockResolvedValue("https://fal.media/u.png");
    const subscribeMock = vi
      .fn()
      .mockResolvedValue({ data: { image: { url: "https://fal.ai/r.png" } } });
    vi.stubGlobal("fetch", okFetch());
    const p = createProvider();
    (p as any)._client = {
      subscribe: subscribeMock,
      storage: { upload: uploadMock }
    };
    const params: ImageToImageParams = {
      prompt: "e",
      model: {
        id: "fal-ai/kolors/image-to-image",
        name: "Kolors",
        provider: "fal_ai"
      }
    };
    const out = await p.imageToImages([new Uint8Array([1, 2])], params, 1);
    expect(out).toHaveLength(1);
  });

  it("imageToImages sends num_images and returns multiple images", async () => {
    let captured: any;
    const uploadMock = vi.fn().mockResolvedValue("https://fal.media/u.png");
    const subscribeMock = vi.fn(async (_id: string, opts: any) => {
      captured = opts.input;
      return {
        data: {
          images: [
            { url: "https://fal.ai/a.png" },
            { url: "https://fal.ai/b.png" }
          ]
        }
      };
    });
    vi.stubGlobal("fetch", okFetch());
    const p = createProvider();
    (p as any)._client = {
      subscribe: subscribeMock,
      storage: { upload: uploadMock }
    };
    const params: ImageToImageParams = {
      prompt: "e",
      model: {
        id: "fal-ai/flux/dev/image-to-image",
        name: "FLUX i2i",
        provider: "fal_ai"
      }
    };
    const out = await p.imageToImages([new Uint8Array([1, 2])], params, 2);
    expect(out).toHaveLength(2);
    expect(captured.num_images).toBe(2);
  });
});

describe("FalProvider — inpaint variants", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  const inpaintParams = (): InpaintingParams => ({
    prompt: "fill",
    model: {
      id: "fal-ai/ideogram/v2/edit",
      name: "Ideogram Edit",
      provider: "fal_ai"
    },
    mask: new Uint8Array([5, 6, 7, 8])
  });

  it("inpaintImages returns single result for numImages <= 1", async () => {
    const uploadMock = vi
      .fn()
      .mockResolvedValueOnce("https://fal.media/src.png")
      .mockResolvedValueOnce("https://fal.media/mask.png");
    const subscribeMock = vi
      .fn()
      .mockResolvedValue({ data: { image: { url: "https://fal.ai/r.png" } } });
    vi.stubGlobal("fetch", okFetch());
    const p = createProvider();
    (p as any)._client = {
      subscribe: subscribeMock,
      storage: { upload: uploadMock }
    };
    const out = await p.inpaintImages(
      [new Uint8Array([1, 2, 3, 4])],
      inpaintParams(),
      1
    );
    expect(out).toHaveLength(1);
    expect(subscribeMock).toHaveBeenCalledTimes(1);
  });

  it("inpaintImages requests multiple and returns each url", async () => {
    const uploadMock = vi.fn().mockResolvedValue("https://fal.media/x.png");
    const subscribeMock = vi.fn().mockResolvedValue({
      data: {
        images: [
          { url: "https://fal.ai/a.png" },
          { url: "https://fal.ai/b.png" }
        ]
      }
    });
    vi.stubGlobal("fetch", okFetch());
    const p = createProvider();
    (p as any)._client = {
      subscribe: subscribeMock,
      storage: { upload: uploadMock }
    };
    const out = await p.inpaintImages(
      [new Uint8Array([1, 2, 3, 4])],
      inpaintParams(),
      2
    );
    expect(out).toHaveLength(2);
  });
});

describe("FalProvider — video endpoints", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("textToVideo shapes prompt and extracts { video: { url } }", async () => {
    let captured: any;
    const subscribeMock = vi.fn(async (_id: string, opts: any) => {
      captured = opts.input;
      return { data: { video: { url: "https://fal.ai/v.mp4" } } };
    });
    vi.stubGlobal("fetch", okFetch());
    const p = createProvider();
    (p as any)._client = { subscribe: subscribeMock };
    const params: TextToVideoParams = {
      prompt: "a dog running",
      model: {
        id: "fal-ai/unknown-video-model",
        name: "V",
        provider: "fal_ai"
      },
      seed: 7
    };
    const out = await p.textToVideo(params);
    expect(out).toBeInstanceOf(Uint8Array);
    expect(captured.prompt).toBe("a dog running");
    expect(captured.seed).toBe(7);
  });

  it("imageToVideo uploads the image and extracts a bare { url }", async () => {
    const uploadMock = vi.fn().mockResolvedValue("https://fal.media/img.png");
    let captured: any;
    const subscribeMock = vi.fn(async (_id: string, opts: any) => {
      captured = opts.input;
      return { data: { url: "https://fal.ai/v.mp4" } };
    });
    vi.stubGlobal("fetch", okFetch());
    const p = createProvider();
    (p as any)._client = {
      subscribe: subscribeMock,
      storage: { upload: uploadMock }
    };
    const params: ImageToVideoParams = {
      prompt: "animate",
      model: {
        id: "fal-ai/unknown-i2v-model",
        name: "I2V",
        provider: "fal_ai"
      }
    };
    const out = await p.imageToVideo([new Uint8Array([1, 2, 3])], params);
    expect(out).toBeInstanceOf(Uint8Array);
    expect(uploadMock).toHaveBeenCalledTimes(1);
    // Unknown endpoint falls back to image_url.
    expect(captured.image_url).toBe("https://fal.media/img.png");
  });

  it("videoToVideo uploads video/mp4 and extracts { video_url }", async () => {
    const uploadMock = vi.fn().mockResolvedValue("https://fal.media/in.mp4");
    let captured: any;
    const subscribeMock = vi.fn(async (_id: string, opts: any) => {
      captured = opts.input;
      return { data: { video_url: "https://fal.ai/out.mp4" } };
    });
    vi.stubGlobal("fetch", okFetch());
    const p = createProvider();
    (p as any)._client = {
      subscribe: subscribeMock,
      storage: { upload: uploadMock }
    };
    const params: VideoToVideoParams = {
      prompt: "restyle",
      model: {
        id: "fal-ai/unknown-v2v-model",
        name: "V2V",
        provider: "fal_ai"
      }
    };
    const out = await p.videoToVideo(new Uint8Array([9, 9]), params);
    expect(out).toBeInstanceOf(Uint8Array);
    const blob = uploadMock.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("video/mp4");
    expect(captured.video_url).toBe("https://fal.media/in.mp4");
  });

  it("lipSync uploads both video and audio", async () => {
    const uploadMock = vi
      .fn()
      .mockResolvedValueOnce("https://fal.media/v.mp4")
      .mockResolvedValueOnce("https://fal.media/a.mp3");
    let captured: any;
    const subscribeMock = vi.fn(async (_id: string, opts: any) => {
      captured = opts.input;
      return { data: { videos: [{ url: "https://fal.ai/out.mp4" }] } };
    });
    vi.stubGlobal("fetch", okFetch());
    const p = createProvider();
    (p as any)._client = {
      subscribe: subscribeMock,
      storage: { upload: uploadMock }
    };
    const params: LipSyncParams = {
      model: {
        id: "fal-ai/unknown-lipsync",
        name: "LS",
        provider: "fal_ai"
      },
      audio: new Uint8Array([1, 2, 3])
    };
    const out = await p.lipSync(new Uint8Array([4, 5, 6]), params);
    expect(out).toBeInstanceOf(Uint8Array);
    expect(uploadMock).toHaveBeenCalledTimes(2);
    // Falls back to *_url for unknown endpoints.
    expect(captured.video_url).toBe("https://fal.media/v.mp4");
    expect(captured.audio_url).toBe("https://fal.media/a.mp3");
  });
});

describe("FalProvider — single-image editing endpoints", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  function clientWith(response: any) {
    const uploadMock = vi.fn().mockResolvedValue("https://fal.media/u.png");
    let captured: any = null;
    const subscribeMock = vi.fn(async (_id: string, opts: any) => {
      captured = opts.input;
      return { data: response };
    });
    return {
      client: { subscribe: subscribeMock, storage: { upload: uploadMock } },
      uploadMock,
      get captured() {
        return captured;
      }
    };
  }

  it("upscaleImage uploads the source and returns bytes", async () => {
    const ctx = clientWith({ image: { url: "https://fal.ai/up.png" } });
    vi.stubGlobal("fetch", okFetch());
    const p = createProvider();
    (p as any)._client = ctx.client;
    const params: UpscaleImageParams = {
      model: { id: "fal-ai/unknown-upscale", name: "U", provider: "fal_ai" },
      scale: 4
    };
    const out = await p.upscaleImage(new Uint8Array([1, 2]), params);
    expect(out).toBeInstanceOf(Uint8Array);
    expect(ctx.uploadMock).toHaveBeenCalledTimes(1);
    expect(ctx.captured.image_url).toBe("https://fal.media/u.png");
  });

  it("removeBackground sets output_format png", async () => {
    const ctx = clientWith({ image: { url: "https://fal.ai/rb.png" } });
    vi.stubGlobal("fetch", okFetch());
    const p = createProvider();
    (p as any)._client = ctx.client;
    const params: RemoveBackgroundParams = {
      model: { id: "fal-ai/unknown-rembg", name: "RB", provider: "fal_ai" }
    };
    await p.removeBackground(new Uint8Array([1, 2]), params);
    expect(ctx.captured.output_format).toBe("png");
  });

  it("relightImage forces the prompt", async () => {
    const ctx = clientWith({ image: { url: "https://fal.ai/rl.png" } });
    vi.stubGlobal("fetch", okFetch());
    const p = createProvider();
    (p as any)._client = ctx.client;
    const params: RelightImageParams = {
      model: { id: "fal-ai/unknown-relight", name: "RL", provider: "fal_ai" },
      prompt: "sunset lighting"
    };
    await p.relightImage(new Uint8Array([1, 2]), params);
    expect(ctx.captured.prompt).toBe("sunset lighting");
  });

  it("vectorizeImage only attaches the image", async () => {
    const ctx = clientWith({ image: { url: "https://fal.ai/vec.svg" } });
    vi.stubGlobal("fetch", okFetch());
    const p = createProvider();
    (p as any)._client = ctx.client;
    const params: VectorizeImageParams = {
      model: { id: "fal-ai/unknown-vectorize", name: "VEC", provider: "fal_ai" }
    };
    await p.vectorizeImage(new Uint8Array([1, 2]), params);
    expect(ctx.captured.image_url).toBe("https://fal.media/u.png");
  });
});

describe("FalProvider — response extraction error paths", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("textToVideo throws on unexpected video response", async () => {
    const subscribeMock = vi.fn().mockResolvedValue({ data: { nope: 1 } });
    const p = createProvider();
    (p as any)._client = { subscribe: subscribeMock };
    await expect(
      p.textToVideo({
        prompt: "x",
        model: { id: "fal-ai/unknown-vid", name: "V", provider: "fal_ai" }
      })
    ).rejects.toThrow("Unexpected FAL video response");
  });

  it("textToMusic throws on empty prompt before hitting the client", async () => {
    const subscribeMock = vi.fn();
    const p = createProvider();
    (p as any)._client = { subscribe: subscribeMock };
    await expect(
      p.textToMusic({
        prompt: "",
        model: {
          id: "cassetteai/music-generator",
          name: "C",
          provider: "fal_ai"
        }
      })
    ).rejects.toThrow("prompt must not be empty");
    expect(subscribeMock).not.toHaveBeenCalled();
  });

  it("textToSpeechEncoded throws on empty text", async () => {
    const p = createProvider();
    (p as any)._client = { subscribe: vi.fn() };
    await expect(
      p.textToSpeechEncoded({ text: "", model: "fal-ai/dia-tts" })
    ).rejects.toThrow("text must not be empty");
  });

  it("textToMusic throws on unexpected audio response", async () => {
    const subscribeMock = vi.fn().mockResolvedValue({ data: { nope: 1 } });
    const p = createProvider();
    (p as any)._client = { subscribe: subscribeMock };
    await expect(
      p.textToMusic({
        prompt: "song",
        model: {
          id: "cassetteai/music-generator",
          name: "C",
          provider: "fal_ai"
        }
      })
    ).rejects.toThrow("Unexpected FAL audio response");
  });

  it("uses result itself when subscribe returns no .data wrapper", async () => {
    // result.data is undefined → falls back to `result` as the data object.
    const subscribeMock = vi
      .fn()
      .mockResolvedValue({ images: [{ url: "https://fal.ai/r.png" }] });
    vi.stubGlobal("fetch", okFetch());
    const p = createProvider();
    (p as any)._client = { subscribe: subscribeMock };
    const out = await p.textToImage({ prompt: "x", model: IMG_MODEL });
    expect(out).toBeInstanceOf(Uint8Array);
  });
});

describe("FalProvider — TTS arg shaping fallbacks", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("extracts audio from a bare string audio field", async () => {
    const subscribeMock = vi
      .fn()
      .mockResolvedValue({ data: { audio: "https://fal.ai/s.mp3" } });
    vi.stubGlobal("fetch", okFetch(new Uint8Array([0xff, 0xfb, 0x90, 0x00])));
    const p = createProvider();
    (p as any)._client = { subscribe: subscribeMock };
    const res = await p.textToSpeechEncoded({
      text: "hi",
      model: "fal-ai/dia-tts"
    });
    expect(res?.mimeType).toBe("audio/mpeg");
  });

  it("textToMusic passes lyrics and duration for a lyric-capable model", async () => {
    let captured: any;
    const subscribeMock = vi.fn(async (_id: string, opts: any) => {
      captured = opts.input;
      return { data: { audio: { url: "https://fal.ai/song.mp3" } } };
    });
    vi.stubGlobal("fetch", okFetch(new Uint8Array([0xff, 0xfb])));
    const p = createProvider();
    (p as any)._client = { subscribe: subscribeMock };
    await p.textToMusic({
      model: {
        id: "fal-ai/unknown-music",
        name: "M",
        provider: "fal_ai"
      },
      prompt: "jazz",
      lyrics: "la la la",
      durationSeconds: 30,
      seed: 5
    });
    // Unknown endpoint is permissive, so canonical keys land.
    expect(captured.prompt).toBe("jazz");
    expect(captured.lyrics).toBe("la la la");
    expect(captured.duration).toBe(30);
    expect(captured.seed).toBe(5);
  });
});
