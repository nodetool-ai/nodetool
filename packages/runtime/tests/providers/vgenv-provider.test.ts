import { afterEach, describe, expect, it, vi } from "vitest";
import { VgenvProvider } from "../../src/providers/vgenv-provider.js";

vi.mock("../../src/generation-receipt.js", () => ({
  recordGenerationReceiptAsync: vi.fn(async () => {})
}));
vi.mock("../../src/providers/safe-url.js", () => ({
  safeFetch: vi.fn(async () => new Response(new Uint8Array([1, 2, 3])))
}));

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
const PNG_DATA_URL = `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`;
const MODEL = { id: "minimax/h3-fast", name: "MiniMax H3 Fast", provider: "vgenv" as const };

const provider = () => new VgenvProvider({ VGENV_API_KEY: "vgenv_test" });

function reply(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>, call = 0): Record<string, unknown> {
  const init = fetchMock.mock.calls[call][1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

async function settle<T>(promise: Promise<T>): Promise<T> {
  vi.useFakeTimers();
  try {
    const settled = promise.then(
      (value) => ({ value }),
      (error: unknown) => ({ error })
    );
    await vi.runAllTimersAsync();
    const result = await settled;
    if ("error" in result) throw result.error;
    return result.value;
  } finally {
    vi.useRealTimers();
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("VgenvProvider", () => {
  it("requires an API key", () => {
    expect(() => new VgenvProvider({})).toThrow("VGENV_API_KEY");
  });

  it("advertises one model per MiniMax H3 tier with its option limits", async () => {
    const models = await provider().getAvailableVideoModels();
    expect(models.map((model) => model.id)).toEqual([
      "minimax/h3-fast",
      "minimax/h3-standard",
      "minimax/h3-enhanced",
      "minimax/h3-quality"
    ]);
    expect(models[0].durations).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(models[0].resolutions).toEqual(["480p", "768p"]);
    expect(models[0].supportedTasks).toEqual(["text_to_video", "image_to_video", "reference_to_video"]);
  });

  it("creates a text-to-video job, polls it, and downloads the signed result", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply({ id: "vid_1", status: "queued", queue_position: 2 }))
      .mockResolvedValueOnce(reply({ id: "vid_1", status: "running", progress: 40 }))
      .mockResolvedValueOnce(reply({ id: "vid_1", status: "succeeded", output: { url: "https://cdn.vgenv.com/vid_1.mp4" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await settle(provider().textToVideo({
      model: MODEL,
      prompt: "a paper city at sunrise",
      durationSeconds: 5,
      resolution: "480p",
      aspectRatio: "9:16"
    }));

    expect(Array.from(result)).toEqual([1, 2, 3]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.vgenv.com/v2/videos");
    expect(init.headers).toMatchObject({ Authorization: "Bearer vgenv_test", "Idempotency-Key": expect.any(String) });
    expect(requestBody(fetchMock)).toEqual({
      model: "minimax/h3",
      tier: "fast",
      prompt: "a paper city at sunrise",
      prompt_optimization: { mode: "raw" },
      duration: 5,
      resolution: "480p",
      aspect_ratio: "9:16"
    });
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.vgenv.com/v2/videos/vid_1");
  });

  it("clamps the duration to the 4 to 15 second range", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply({ id: "vid_2", status: "succeeded", output: { url: "https://cdn.vgenv.com/v.mp4" } }));
    vi.stubGlobal("fetch", fetchMock);
    await provider().textToVideo({ model: MODEL, prompt: "x", durationSeconds: 30 });
    expect(requestBody(fetchMock).duration).toBe(15);
  });

  it("sends the first and last frames as data URLs", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply({ id: "vid_3", status: "succeeded", output: { url: "https://cdn.vgenv.com/v.mp4" } }));
    vi.stubGlobal("fetch", fetchMock);
    await provider().imageToVideo(PNG, {
      model: { ...MODEL, id: "minimax/h3-quality" },
      prompt: "the bird takes flight",
      endImage: PNG
    });
    const body = requestBody(fetchMock);
    expect(body.tier).toBe("quality");
    expect(body.frame_images).toEqual([
      { type: "image_url", image_url: { url: PNG_DATA_URL }, frame_type: "first_frame" },
      { type: "image_url", image_url: { url: PNG_DATA_URL }, frame_type: "last_frame" }
    ]);
    expect(body).not.toHaveProperty("reference_images");
  });

  it("sends ordered reference images and rejects reference videos", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply({ id: "vid_4", status: "succeeded", output: { url: "https://cdn.vgenv.com/v.mp4" } }));
    vi.stubGlobal("fetch", fetchMock);
    await provider().referenceToVideo({ images: [PNG, PNG], videos: [] }, { model: MODEL, prompt: "keep image one" });
    expect(requestBody(fetchMock).reference_images).toEqual([
      { type: "image_url", image_url: { url: PNG_DATA_URL } },
      { type: "image_url", image_url: { url: PNG_DATA_URL } }
    ]);

    await expect(provider().referenceToVideo(
      { images: [PNG], videos: [new Uint8Array([1])] },
      { model: MODEL, prompt: "x" }
    )).rejects.toThrow("images only");
    await expect(provider().referenceToVideo(
      { images: Array.from({ length: 10 }, () => PNG), videos: [] },
      { model: MODEL, prompt: "x" }
    )).rejects.toThrow("at most 9");
  });

  it("rejects images vgenv cannot accept before submitting", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(provider().imageToVideo(new Uint8Array([1, 2, 3]), { model: MODEL, prompt: "x" }))
      .rejects.toThrow("JPEG, PNG, or WebP");
    const oversized = new Uint8Array(5 * 1024 * 1024 + 1);
    oversized.set(PNG);
    await expect(provider().imageToVideo(oversized, { model: MODEL, prompt: "x" }))
      .rejects.toThrow("5 MiB");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a failed job with the API's reason", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply({ id: "vid_5", status: "queued" }))
      .mockResolvedValueOnce(reply({ id: "vid_5", status: "failed", error: { code: "content_policy", message: "prompt rejected" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(settle(provider().textToVideo({ model: MODEL, prompt: "x" })))
      .rejects.toThrow("vgenv video vid_5 failed: prompt rejected");
  });

  it("surfaces the API message when creation is refused", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply({ message: "insufficient balance" }, 402)));
    await expect(provider().textToVideo({ model: MODEL, prompt: "x" }))
      .rejects.toThrow("vgenv video creation failed: insufficient balance");
  });

  it("cancels the job when the caller aborts while it waits between polls", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return reply({ id: "vid_6", status: "cancelled" });
      controller.abort();
      return reply({ id: "vid_6", status: "queued" });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(settle(provider().textToVideo({ model: MODEL, prompt: "x", signal: controller.signal })))
      .rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://api.vgenv.com/v2/videos/vid_6",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("cancels the job when the abort lands during the status request", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return reply({ id: "vid_7", status: "cancelled" });
      if (init?.method === "POST") return reply({ id: "vid_7", status: "queued" });
      controller.abort();
      throw new DOMException("The operation was aborted.", "AbortError");
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(settle(provider().textToVideo({ model: MODEL, prompt: "x", signal: controller.signal })))
      .rejects.toThrow("aborted");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://api.vgenv.com/v2/videos/vid_7",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("cancels the job when polling runs past the timeout", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return reply({ id: "vid_8", status: "cancelled" });
      return reply({ id: "vid_8", status: "queued" });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(settle(provider().textToVideo({ model: MODEL, prompt: "x", timeoutSeconds: 10 })))
      .rejects.toThrow("timed out while queued");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://api.vgenv.com/v2/videos/vid_8",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("does not cancel when a status request fails without an abort", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply({ id: "vid_9", status: "queued" }))
      .mockResolvedValueOnce(reply({ message: "video not found" }, 404));
    vi.stubGlobal("fetch", fetchMock);
    await expect(settle(provider().textToVideo({ model: MODEL, prompt: "x" })))
      .rejects.toThrow("vgenv video status failed: video not found");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects an unknown model id", async () => {
    await expect(provider().textToVideo({ model: { ...MODEL, id: "minimax/h3" }, prompt: "x" }))
      .rejects.toThrow("Unknown vgenv video model");
  });
});
