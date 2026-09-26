import { afterEach, describe, expect, it, vi } from "vitest";
import { UseapiProvider } from "../../src/providers/useapi-provider.js";

vi.mock("../../src/generation-receipt.js", () => ({
  recordGenerationReceiptAsync: vi.fn(async () => {})
}));
vi.mock("../../src/providers/safe-url.js", () => ({
  safeFetch: vi.fn(async () => new Response(new Uint8Array([1, 2, 3])))
}));

const provider = () => new UseapiProvider({
  USEAPI_API_TOKEN: "test-token",
  USEAPI_DREAMINA_ACCOUNT: "US:user@example.com"
});

function reply(body: object): Response {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("UseapiProvider", () => {
  it("advertises Google Flow and Dreamina image and video models", async () => {
    const images = await provider().getAvailableImageModels();
    const videos = await provider().getAvailableVideoModels();
    expect(images.some((entry) => entry.id === "google-flow/nano-banana-2")).toBe(true);
    expect(images.some((entry) => entry.id === "dreamina/seedream-4.6")).toBe(true);
    expect(videos.some((entry) => entry.id === "google-flow/veo-3.1-fast")).toBe(true);
    expect(videos.some((entry) => entry.id === "dreamina/seedance-2.0")).toBe(true);
  });

  it("decodes a Google Flow image returned inline", async () => {
    const fetchMock = vi.fn(async () => reply({
      media: [{ image: { generatedImage: { encodedImage: "AQID" } } }]
    }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await provider().textToImage({
      model: { id: "google-flow/nano-banana-2", name: "Nano Banana", provider: "useapi" },
      prompt: "mountains",
      aspectRatio: "16:9"
    });
    expect(Array.from(result)).toEqual([1, 2, 3]);
    expect(fetchMock).toHaveBeenCalledWith("https://api.useapi.net/v1/google-flow/images", expect.objectContaining({
      body: JSON.stringify({ model: "nano-banana-2", prompt: "mountains", aspectRatio: "16:9", count: 1 })
    }));
  });

  it("polls a Dreamina video and downloads the result", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply({ jobid: "job-1", status: "created" }))
      .mockResolvedValueOnce(reply({ jobid: "job-1", status: "completed", response: { videoUrl: "https://cdn.example.com/video.mp4" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    try {
      const resultPromise = provider().textToVideo({
        model: { id: "dreamina/seedance-2.0", name: "Seedance", provider: "useapi" },
        prompt: "a running dog",
        durationSeconds: 5,
        aspectRatio: "16:9"
      });
      await vi.runAllTimersAsync();
      expect(Array.from(await resultPromise)).toEqual([1, 2, 3]);
      expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.useapi.net/v1/dreamina/videos/job-1", expect.any(Object));
    } finally {
      vi.useRealTimers();
    }
  });

  it("polls an asynchronous Google Flow video job", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply({ jobid: "flow-job", status: "created" }))
      .mockResolvedValueOnce(reply({ jobid: "flow-job", status: "completed", response: { media: [{ videoUrl: "https://cdn.example.com/flow.mp4" }] } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    try {
      const resultPromise = provider().textToVideo({
        model: { id: "google-flow/veo-3.1-fast", name: "Veo", provider: "useapi" },
        prompt: "a waterfall"
      });
      await vi.runAllTimersAsync();
      expect(Array.from(await resultPromise)).toEqual([1, 2, 3]);
      expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.useapi.net/v1/google-flow/jobs/flow-job", expect.any(Object));
    } finally {
      vi.useRealTimers();
    }
  });

  it("uploads a reference image for Google Flow video", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply({ mediaGenerationId: { mediaGenerationId: "image-ref" } }))
      .mockResolvedValueOnce(reply({ media: [{ videoUrl: "https://cdn.example.com/video.mp4" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await provider().imageToVideo(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), {
      model: { id: "google-flow/veo-3.1-fast", name: "Veo", provider: "useapi" },
      prompt: "a moving scene"
    });
    expect(Array.from(result)).toEqual([1, 2, 3]);
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.useapi.net/v1/google-flow/videos", expect.objectContaining({
      body: JSON.stringify({ model: "veo-3.1-fast", prompt: "a moving scene", startImage: "image-ref", async: true })
    }));
  });

  it("requires an account for Dreamina reference uploads", async () => {
    const noAccount = new UseapiProvider({ USEAPI_API_TOKEN: "test-token" });
    await expect(noAccount.imageToImage([new Uint8Array([1])], {
      model: { id: "dreamina/seedream-4.6", name: "Seedream", provider: "useapi" },
      prompt: "edit"
    })).rejects.toThrow("USEAPI_DREAMINA_ACCOUNT");
  });
});
