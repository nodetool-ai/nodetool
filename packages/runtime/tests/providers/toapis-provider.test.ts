import { afterEach, describe, expect, it, vi } from "vitest";
import { ToapisProvider } from "../../src/providers/toapis-provider.js";

vi.mock("../../src/generation-receipt.js", () => ({
  recordGenerationReceiptAsync: vi.fn(async () => {})
}));
vi.mock("../../src/providers/safe-url.js", () => ({
  safeFetch: vi.fn(async () => new Response(new Uint8Array([1, 2, 3])))
}));

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
const IMAGE_MODEL = { id: "gpt-image-2-vip", name: "GPT Image 2 VIP", provider: "toapis" as const };
const VIDEO_MODEL = { id: "seedance-2-mini", name: "Seedance 2 Mini", provider: "toapis" as const };
const API = "https://toapis.com/v1";

const provider = () => new ToapisProvider({ TOAPIS_API_KEY: "toapis_test" });

function reply(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function done(id: string, url = "https://files.toapis.com/out.bin"): Response {
  return reply({ id, status: "completed", result: { data: [{ url }] } });
}

function uploaded(n: number): Response {
  return reply({ success: true, data: { url: `https://files.toapis.com/uploads/${n}.png` } });
}

function callTo(fetchMock: ReturnType<typeof vi.fn>, url: string): RequestInit {
  const call = fetchMock.mock.calls.find(([target]) => target === url);
  if (!call) throw new Error(`no request to ${url}`);
  return call[1] as RequestInit;
}

function jsonTo(fetchMock: ReturnType<typeof vi.fn>, url: string): Record<string, unknown> {
  return JSON.parse(String(callTo(fetchMock, url).body)) as Record<string, unknown>;
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

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ToapisProvider", () => {
  it("requires an API key", () => {
    expect(() => new ToapisProvider({})).toThrow("TOAPIS_API_KEY");
  });

  it("advertises the GPT Image and Seedance 2 models with their option limits", async () => {
    const images = await provider().getAvailableImageModels();
    expect(images.map((model) => model.id)).toEqual([
      "gpt-image-2",
      "gpt-image-2-vip",
      "gpt-image-2.5-flare",
      "gpt-image-2.5-sunburst"
    ]);
    expect(images[0].resolutions).toEqual(["1K", "2K", "4K"]);
    expect(images[2].aspectRatios).not.toContain("2:1");

    const videos = await provider().getAvailableVideoModels();
    expect(videos.map((model) => model.id)).toEqual(["seedance-2", "seedance-2-fast", "seedance-2-mini"]);
    expect(videos[0].resolutions).toEqual(["480p", "720p", "1080p", "4k"]);
    expect(videos[2].resolutions).toEqual(["480p", "720p"]);
    expect(videos[2].durations).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it("creates an image task, polls it, and downloads the result", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply({ id: "img_1", status: "queued", progress: 0 }))
      .mockResolvedValueOnce(reply({ id: "img_1", status: "in_progress", progress: 50 }))
      .mockResolvedValueOnce(done("img_1"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await settle(provider().textToImage({
      model: IMAGE_MODEL,
      prompt: "a terracotta cup",
      aspectRatio: "16:9",
      resolution: "2K",
      quality: "low"
    }));

    expect(Array.from(result)).toEqual([1, 2, 3]);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/images/generations`);
    expect(callTo(fetchMock, `${API}/images/generations`).headers).toMatchObject({ Authorization: "Bearer toapis_test" });
    expect(jsonTo(fetchMock, `${API}/images/generations`)).toEqual({
      model: "gpt-image-2-vip",
      prompt: "a terracotta cup",
      n: 1,
      size: "16:9",
      resolution: "2k",
      quality: "low"
    });
    expect(fetchMock.mock.calls[1][0]).toBe(`${API}/images/generations/img_1`);
  });

  it("maps a pixel size to its ratio and drops options the model does not take", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(done("img_2"));
    vi.stubGlobal("fetch", fetchMock);
    await provider().textToImage({
      model: { ...IMAGE_MODEL, id: "gpt-image-2" },
      prompt: "x",
      width: 1536,
      height: 1024,
      quality: "low"
    });
    expect(jsonTo(fetchMock, `${API}/images/generations`)).toEqual({ model: "gpt-image-2", prompt: "x", n: 1, size: "3:2" });
  });

  it("uploads source images in order and sends them as reference URLs", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(uploaded(1))
      .mockResolvedValueOnce(uploaded(2))
      .mockResolvedValueOnce(done("img_3"));
    vi.stubGlobal("fetch", fetchMock);
    await provider().imageToImage([PNG, PNG], { model: IMAGE_MODEL, prompt: "make it blue" });

    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/uploads/images`);
    const form = (fetchMock.mock.calls[0][1] as RequestInit).body as FormData;
    expect((form.get("file") as File).type).toBe("image/png");
    expect(jsonTo(fetchMock, `${API}/images/generations`).reference_images).toEqual([
      "https://files.toapis.com/uploads/1.png",
      "https://files.toapis.com/uploads/2.png"
    ]);
  });

  it("rejects images ToAPIs cannot accept before uploading", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(provider().imageToImage([new Uint8Array([1, 2, 3])], { model: IMAGE_MODEL, prompt: "x" }))
      .rejects.toThrow("JPEG, PNG, WebP, or GIF");
    const oversized = new Uint8Array(10 * 1024 * 1024 + 1);
    oversized.set(PNG);
    await expect(provider().imageToImage([oversized], { model: IMAGE_MODEL, prompt: "x" }))
      .rejects.toThrow("10 MB");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates a text-to-video task with clamped duration and supported options", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply({ id: "vid_1", status: "queued" }))
      .mockResolvedValueOnce(done("vid_1"));
    vi.stubGlobal("fetch", fetchMock);
    await settle(provider().textToVideo({
      model: VIDEO_MODEL,
      prompt: "steam rises",
      durationSeconds: 30,
      resolution: "1080p",
      aspectRatio: "9:16",
      seed: 7
    }));
    expect(jsonTo(fetchMock, `${API}/videos/generations`)).toEqual({
      model: "seedance-2-mini",
      prompt: "steam rises",
      duration: 15,
      aspect_ratio: "9:16",
      seed: 7
    });
    expect(fetchMock.mock.calls[1][0]).toBe(`${API}/videos/generations/vid_1`);
  });

  it("sends the first and last frames with their roles", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(uploaded(1))
      .mockResolvedValueOnce(uploaded(2))
      .mockResolvedValueOnce(done("vid_2"));
    vi.stubGlobal("fetch", fetchMock);
    await provider().imageToVideo(PNG, { model: VIDEO_MODEL, prompt: "push in", endImage: PNG });
    expect(jsonTo(fetchMock, `${API}/videos/generations`).image_with_roles).toEqual([
      { url: "https://files.toapis.com/uploads/1.png", role: "first_frame" },
      { url: "https://files.toapis.com/uploads/2.png", role: "last_frame" }
    ]);
  });

  it("sends reference images and rejects reference videos and too many images", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(uploaded(1))
      .mockResolvedValueOnce(done("vid_3"));
    vi.stubGlobal("fetch", fetchMock);
    await provider().referenceToVideo({ images: [PNG], videos: [] }, { model: VIDEO_MODEL, prompt: "keep image 1" });
    expect(jsonTo(fetchMock, `${API}/videos/generations`).image_with_roles).toEqual([
      { url: "https://files.toapis.com/uploads/1.png", role: "reference_image" }
    ]);

    await expect(provider().referenceToVideo(
      { images: [PNG], videos: [new Uint8Array([1])] },
      { model: VIDEO_MODEL, prompt: "x" }
    )).rejects.toThrow("images only");
    await expect(provider().referenceToVideo(
      { images: Array.from({ length: 10 }, () => PNG), videos: [] },
      { model: VIDEO_MODEL, prompt: "x" }
    )).rejects.toThrow("at most 9");
  });

  it("reports a failed task with the API's reason", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply({ id: "vid_4", status: "queued" }))
      .mockResolvedValueOnce(reply({ id: "vid_4", status: "failed", error: { code: "generation_failed", message: "prompt rejected" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(settle(provider().textToVideo({ model: VIDEO_MODEL, prompt: "x" })))
      .rejects.toThrow("ToAPIs video task vid_4 failed: prompt rejected");
  });

  it("surfaces the API message when creation is refused and does not retry it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({ error: { message: "insufficient balance" } }, 402));
    vi.stubGlobal("fetch", fetchMock);
    await expect(provider().textToImage({ model: IMAGE_MODEL, prompt: "x" }))
      .rejects.toThrow("ToAPIs image creation failed: insufficient balance");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops waiting when polling runs past the timeout", async () => {
    const fetchMock = vi.fn(async () => reply({ id: "vid_5", status: "in_progress" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(settle(provider().textToVideo({ model: VIDEO_MODEL, prompt: "x", timeoutSeconds: 15 })))
      .rejects.toThrow("timed out while in_progress");
  });

  it("stops polling when the caller aborts", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async () => {
      controller.abort();
      return reply({ id: "vid_6", status: "queued" });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(settle(provider().textToVideo({ model: VIDEO_MODEL, prompt: "x", signal: controller.signal })))
      .rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an unknown model id", async () => {
    await expect(provider().textToImage({ model: { ...IMAGE_MODEL, id: "dall-e-3" }, prompt: "x" }))
      .rejects.toThrow("Unknown ToAPIs image model");
    await expect(provider().textToVideo({ model: { ...VIDEO_MODEL, id: "seedance-1" }, prompt: "x" }))
      .rejects.toThrow("Unknown ToAPIs video model");
  });

  it.each(["1:3", "7:4", "auto"])("preserves the VIP ratio %s", async (ratio) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(done("vip_ratio"));
    vi.stubGlobal("fetch", fetchMock);
    await provider().textToImage({ model: IMAGE_MODEL, prompt: "x", aspectRatio: ratio, resolution: "2K" });
    expect(jsonTo(fetchMock, `${API}/images/generations`).size).toBe(ratio);
  });

  it("maps VIP pixel dimensions to a supported custom ratio", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(done("vip_pixels"));
    vi.stubGlobal("fetch", fetchMock);
    await provider().textToImage({ model: IMAGE_MODEL, prompt: "x", width: 1344, height: 768 });
    expect(jsonTo(fetchMock, `${API}/images/generations`).size).toBe("7:4");
  });

  it("preserves a VIP custom ratio when editing an uploaded image", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(uploaded(1)).mockResolvedValueOnce(done("vip_edit"));
    vi.stubGlobal("fetch", fetchMock);
    await provider().imageToImage([PNG], { model: IMAGE_MODEL, prompt: "x", aspectRatio: "1:3", resolution: "2K" });
    expect(jsonTo(fetchMock, `${API}/images/generations`).size).toBe("1:3");
  });

  it.each(["0:1", "1:0", "4:1", "1:4", "not-a-ratio"])("rejects invalid VIP ratio %s before creating a task", async (ratio) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(provider().textToImage({ model: IMAGE_MODEL, prompt: "x", aspectRatio: ratio }))
      .rejects.toThrow("aspect ratio");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a non-VIP custom ratio before uploading or creating a task", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(provider().imageToImage([PNG], {
      model: { ...IMAGE_MODEL, id: "gpt-image-2" }, prompt: "x", aspectRatio: "1:3"
    })).rejects.toThrow("aspect ratio");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("times out during the polling sleep without querying past the deadline", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValueOnce(reply({ id: "sleep_timeout", status: "queued" })).mockResolvedValueOnce(done("sleep_timeout"));
    vi.stubGlobal("fetch", fetchMock);
    const result = provider().textToVideo({ model: VIDEO_MODEL, prompt: "x", timeoutSeconds: 1 })
      .then(() => "completed", (error: unknown) => String(error));
    await vi.advanceTimersByTimeAsync(1000);
    expect(vi.getTimerCount()).toBe(0);
    expect(await result).toContain("timed out");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts an in-flight poll at the deadline and clears its timer", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let pollSignal: AbortSignal | null | undefined;
    let outcome = "pending";
    const fetchMock = vi.fn().mockResolvedValueOnce(reply({ id: "http_timeout", status: "queued" }))
      .mockImplementation((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
        pollSignal = init.signal;
        pollSignal?.addEventListener("abort", () => reject(pollSignal?.reason), { once: true });
      }));
    vi.stubGlobal("fetch", fetchMock);
    const result = provider().textToVideo({ model: VIDEO_MODEL, prompt: "x", timeoutSeconds: 15, signal: controller.signal })
      .then(() => { outcome = "completed"; }, (error: unknown) => { outcome = String(error); });
    try {
      await vi.advanceTimersByTimeAsync(15000);
      expect(outcome).toContain("timed out");
      expect(pollSignal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      controller.abort();
      await result;
    }
  });

  it("bounds Retry-After waits by the polling deadline", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValueOnce(reply({ id: "retry_timeout", status: "queued" }))
      .mockResolvedValue(new Response("{}", { status: 429, headers: { "Retry-After": "120" } }));
    vi.stubGlobal("fetch", fetchMock);
    let outcome = "pending";
    const result = provider().textToVideo({ model: VIDEO_MODEL, prompt: "x", timeoutSeconds: 15 })
      .then(() => { outcome = "completed"; }, (error: unknown) => { outcome = String(error); });
    await vi.advanceTimersByTimeAsync(15000);
    expect(outcome).toContain("timed out");
    expect(vi.getTimerCount()).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.runAllTimersAsync();
    await result;
  });

  it("keeps the caller abort reason and clears the deadline timer", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const reason = new Error("caller stopped waiting");
    const fetchMock = vi.fn().mockResolvedValue(reply({ id: "caller_abort", status: "queued" }));
    vi.stubGlobal("fetch", fetchMock);
    const result = provider().textToVideo({ model: VIDEO_MODEL, prompt: "x", timeoutSeconds: 15, signal: controller.signal })
      .then(() => undefined, (error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(reason);
    expect(await result).toBe(reason);
    expect(vi.getTimerCount()).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clears the deadline timer after a successful poll", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply({ id: "poll_success", status: "queued" })).mockResolvedValueOnce(done("poll_success")));
    const result = provider().textToVideo({ model: VIDEO_MODEL, prompt: "x", timeoutSeconds: 15 });
    await vi.advanceTimersByTimeAsync(10000);
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });
});
