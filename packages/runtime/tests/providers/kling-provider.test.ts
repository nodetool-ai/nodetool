import { afterEach, describe, expect, it, vi } from "vitest";
import { KlingProvider } from "../../src/providers/kling-provider.js";
import { safeFetch } from "../../src/providers/safe-url.js";

vi.mock("../../src/generation-receipt.js", () => ({
  recordGenerationReceiptAsync: vi.fn(async () => {})
}));
vi.mock("../../src/providers/safe-url.js", () => ({
  safeFetch: vi.fn(async () => new Response(new Uint8Array([1, 2, 3])))
}));

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
const PNG_B64 = Buffer.from(PNG).toString("base64");
const API = "https://api-singapore.klingai.com";
const RESULT_URL = "https://cdn.klingai.com/out.bin";

const provider = () => new KlingProvider({ KLING_API_KEY: "kling_test" });
const video = (id: string) => ({ id, name: id, provider: "kling" as const });
const image = (id: string) => ({ id, name: id, provider: "kling" as const });

function reply(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Shapes from https://kling.ai/document-api/api/video/3-0-omni/text-to-video.md
function videoCreated(id: string): Response {
  return reply({
    code: 0,
    message: "SUCCEED",
    request_id: "req-1",
    data: { id, status: "submitted", create_time: 1781080778802, update_time: 1781080778802, external_id: "" }
  });
}

function videoTask(id: string, status: string, extra: Record<string, unknown> = {}): Response {
  return reply({
    code: 0,
    message: "SUCCEED",
    request_id: "req-2",
    data: [{ id, status, create_time: 1781080778802, update_time: 1781080794151, external_id: "", ...extra }]
  });
}

function videoDone(id: string): Response {
  return videoTask(id, "succeeded", {
    outputs: [{ type: "video", id: "out-1", url: RESULT_URL, watermark_url: "https://cdn.klingai.com/wm.mp4", duration: "5" }],
    billing: []
  });
}

// Shapes from https://kling.ai/document-api/api/image/3-0-omni/image-generation.md
function imageCreated(id: string): Response {
  return reply({
    code: 0,
    message: "SUCCEED",
    request_id: "req-3",
    data: { task_id: id, task_status: "submitted", task_info: { external_task_id: "" }, created_at: 1, updated_at: 1 }
  });
}

function imageTask(id: string, status: string, extra: Record<string, unknown> = {}): Response {
  return reply({
    code: 0,
    message: "SUCCEED",
    request_id: "req-4",
    data: { task_id: id, task_status: status, task_info: {}, created_at: 1, updated_at: 2, ...extra }
  });
}

function callTo(fetchMock: ReturnType<typeof vi.fn>, url: string): RequestInit {
  const call = fetchMock.mock.calls.find(([target]) => target === url);
  if (!call) throw new Error(`no request to ${url}`);
  return call[1] as RequestInit;
}

function jsonTo(fetchMock: ReturnType<typeof vi.fn>, url: string): Record<string, unknown> {
  return JSON.parse(String(callTo(fetchMock, url).body)) as Record<string, unknown>;
}

function stubFetch(...responses: Response[]): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
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
  vi.mocked(safeFetch).mockClear();
});

describe("KlingProvider", () => {
  it("requires an API key", () => {
    expect(() => new KlingProvider({})).toThrow("KLING_API_KEY");
    expect(KlingProvider.requiredSecrets()).toEqual(["KLING_API_KEY"]);
  });

  it("lists the hand-maintained video and image models", async () => {
    const videos = await provider().getAvailableVideoModels();
    expect(videos.map((model) => model.id)).toEqual([
      "kling-4.0",
      "kling-4.0-flash",
      "kling-3.0-turbo",
      "kling-3.0",
      "kling-3.0-omni",
      "kling-o1",
      "kling-2.6"
    ]);
    expect(videos.find((model) => model.id === "kling-2.6")?.durations).toEqual([5, 10]);
    expect(videos.find((model) => model.id === "kling-4.0-flash")?.endFrame).toBe("none");
    const images = await provider().getAvailableImageModels();
    expect(images.map((model) => model.id)).toEqual(["kling-v3", "kling-v3-omni", "kling-image-o1"]);
    expect(images[1].resolutions).toEqual(["1k", "2k", "4k"]);
  });

  it("refuses chat", async () => {
    await expect(provider().generateMessage({ messages: [], model: "x" } as never)).rejects.toThrow("chat");
  });

  it("creates a text-to-video task, polls GET /tasks, and downloads the result", async () => {
    const fetchMock = stubFetch(videoCreated("t1"), videoTask("t1", "processing"), videoDone("t1"));
    const bytes = await settle(
      provider().textToVideo({
        model: video("kling-3.0"),
        prompt: "a fox in snow",
        negativePrompt: "blur",
        durationSeconds: 7,
        resolution: "1080p",
        aspectRatio: "9:16"
      })
    );
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
    const create = callTo(fetchMock, `${API}/text-to-video/kling-3.0`);
    expect(create.method).toBe("POST");
    expect(create.headers).toEqual({ Authorization: "Bearer kling_test", "Content-Type": "application/json" });
    expect(jsonTo(fetchMock, `${API}/text-to-video/kling-3.0`)).toEqual({
      prompt: "a fox in snow\n\nDo not include: blur",
      settings: { resolution: "1080p", duration: 7, aspect_ratio: "9:16" }
    });
    const pollUrl = `${API}/tasks?task_ids=t1`;
    expect(fetchMock.mock.calls.filter(([url]) => url === pollUrl)).toHaveLength(2);
    expect(callTo(fetchMock, pollUrl).headers).toEqual({ Authorization: "Bearer kling_test" });
    expect(vi.mocked(safeFetch)).toHaveBeenCalledWith(RESULT_URL, expect.anything());
  });

  it("sends omni text-to-video as contents with a default aspect ratio", async () => {
    const fetchMock = stubFetch(videoCreated("t2"), videoDone("t2"));
    await settle(provider().textToVideo({ model: video("kling-3.0-omni"), prompt: "a city at dusk" }));
    expect(jsonTo(fetchMock, `${API}/omni-video/kling-3.0-omni`)).toEqual({
      contents: [{ type: "prompt", text: "a city at dusk" }],
      settings: { aspect_ratio: "16:9" }
    });
  });

  it("snaps durations to the model's allowed values", async () => {
    const fetchMock = stubFetch(videoCreated("t3"), videoDone("t3"));
    await settle(provider().textToVideo({ model: video("kling-2.6"), prompt: "waves", durationSeconds: 8 }));
    expect(jsonTo(fetchMock, `${API}/text-to-video/kling-2.6`).settings).toEqual({ duration: 10, aspect_ratio: "16:9" });
  });

  it("rejects unsupported resolutions and aspect ratios before creating a task", async () => {
    const fetchMock = stubFetch();
    await expect(
      provider().textToVideo({ model: video("kling-4.0-flash"), prompt: "x", resolution: "1080p" })
    ).rejects.toThrow("720p");
    await expect(provider().textToVideo({ model: video("kling-2.6"), prompt: "x", aspectRatio: "21:9" })).rejects.toThrow(
      "aspect ratios"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends image-to-video frames as raw base64 contents", async () => {
    const fetchMock = stubFetch(videoCreated("t4"), videoDone("t4"));
    await settle(
      provider().imageToVideo(PNG, { model: video("kling-4.0"), prompt: "she turns", endImage: PNG, durationSeconds: 12 })
    );
    expect(jsonTo(fetchMock, `${API}/image-to-video/kling-4.0`)).toEqual({
      contents: [
        { type: "prompt", text: "she turns" },
        { type: "first_frame", url: PNG_B64 },
        { type: "last_frame", url: PNG_B64 }
      ],
      settings: { duration: 12 }
    });
  });

  it("forces 1080p for Kling 2.6 first and last frame generation", async () => {
    const fetchMock = stubFetch(videoCreated("t5"), videoDone("t5"));
    await settle(provider().imageToVideo(PNG, { model: video("kling-2.6"), endImage: PNG }));
    const body = jsonTo(fetchMock, `${API}/image-to-video/kling-2.6`);
    expect(body.settings).toEqual({ resolution: "1080p" });
    expect(body.contents).toEqual([
      { type: "first_frame", url: PNG_B64 },
      { type: "last_frame", url: PNG_B64 }
    ]);
    await expect(
      provider().imageToVideo(PNG, { model: video("kling-2.6"), endImage: PNG, resolution: "720p" })
    ).rejects.toThrow("1080p");
  });

  it("routes O1 image-to-video to the omni endpoint and limits first-frame-only durations", async () => {
    const fetchMock = stubFetch(videoCreated("t6"), videoDone("t6"));
    await settle(provider().imageToVideo(PNG, { model: video("kling-o1"), prompt: "go", durationSeconds: 8 }));
    expect(jsonTo(fetchMock, `${API}/omni-video/kling-o1`).settings).toEqual({ duration: 10 });
  });

  it("rejects a last frame on first-frame-only models and non-JPEG/PNG input", async () => {
    stubFetch();
    await expect(
      provider().imageToVideo(PNG, { model: video("kling-3.0-turbo"), endImage: PNG })
    ).rejects.toThrow("last frame");
    await expect(
      provider().imageToVideo(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), { model: video("kling-3.0") })
    ).rejects.toThrow("JPEG or PNG");
  });

  it("reports a failed video task with Kling's reason", async () => {
    stubFetch(videoCreated("t7"), videoTask("t7", "failed", { message: "content policy" }));
    await expect(settle(provider().textToVideo({ model: video("kling-3.0"), prompt: "x" }))).rejects.toThrow(
      "Kling video task t7 failed: content policy"
    );
  });

  it("surfaces the envelope error code on a rejected create", async () => {
    const fetchMock = stubFetch(reply({ code: 1102, message: "resource pack exhausted", request_id: "r" }, 429));
    await expect(provider().textToVideo({ model: video("kling-3.0"), prompt: "x" })).rejects.toThrow(
      "Kling video creation failed (code 1102): resource pack exhausted"
    );
    // A billed create is never retried.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a non-zero code in a 200 response as an error", async () => {
    stubFetch(reply({ code: 1201, message: "bad duration", request_id: "r" }));
    await expect(provider().textToVideo({ model: video("kling-3.0"), prompt: "x" })).rejects.toThrow("code 1201");
  });

  it("fails when a succeeded video task has no video output", async () => {
    stubFetch(videoCreated("t8"), videoTask("t8", "succeeded", { outputs: [] }));
    await expect(settle(provider().textToVideo({ model: video("kling-3.0"), prompt: "x" }))).rejects.toThrow(
      "without a video URL"
    );
  });

  it("times out a video task that never finishes", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("/tasks") ? videoTask("t9", "processing") : videoCreated("t9")
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      settle(provider().textToVideo({ model: video("kling-3.0"), prompt: "x", timeoutSeconds: 30 }))
    ).rejects.toThrow("timed out while processing");
  });

  it("generates an Image 3.0 image through /v1/images/generations", async () => {
    const fetchMock = stubFetch(imageCreated("i1"), imageTask("i1", "processing"), imageTask("i1", "succeed", {
      task_result: { images: [{ index: 0, url: RESULT_URL, watermark_url: "https://cdn.klingai.com/wm.png" }] }
    }));
    const bytes = await settle(
      provider().textToImage({
        model: image("kling-v3"),
        prompt: "a red bicycle",
        negativePrompt: "people",
        width: 1920,
        height: 1080,
        resolution: "2K"
      })
    );
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
    expect(jsonTo(fetchMock, `${API}/v1/images/generations`)).toEqual({
      model_name: "kling-v3",
      prompt: "a red bicycle",
      n: 1,
      resolution: "2k",
      aspect_ratio: "16:9",
      negative_prompt: "people"
    });
    expect(fetchMock.mock.calls.filter(([url]) => url === `${API}/v1/images/generations/i1`)).toHaveLength(2);
  });

  it("defaults Image 3.0 Omni text-to-image to 1:1, since it rejects auto", async () => {
    const fetchMock = stubFetch(imageCreated("i2"), imageTask("i2", "succeed", {
      task_result: { result_type: "single", images: [{ index: 0, url: RESULT_URL }] }
    }));
    await settle(provider().textToImage({ model: image("kling-v3-omni"), prompt: "a lighthouse", resolution: "4k" }));
    expect(jsonTo(fetchMock, `${API}/v1/images/omni-image`)).toEqual({
      model_name: "kling-v3-omni",
      prompt: "a lighthouse",
      n: 1,
      resolution: "4k",
      aspect_ratio: "1:1"
    });
    expect(callTo(fetchMock, `${API}/v1/images/omni-image/i2`).headers).toEqual({ Authorization: "Bearer kling_test" });
  });

  it("sends omni image-to-image references as image_list", async () => {
    const fetchMock = stubFetch(imageCreated("i3"), imageTask("i3", "succeed", {
      task_result: { images: [{ index: 0, url: RESULT_URL }] }
    }));
    await settle(
      provider().imageToImage([PNG, PNG], { model: image("kling-image-o1"), prompt: "merge <<<image_1>>> and <<<image_2>>>", aspectRatio: "3:2" })
    );
    expect(jsonTo(fetchMock, `${API}/v1/images/omni-image`)).toEqual({
      model_name: "kling-image-o1",
      prompt: "merge <<<image_1>>> and <<<image_2>>>",
      n: 1,
      aspect_ratio: "3:2",
      image_list: [{ image: PNG_B64 }, { image: PNG_B64 }]
    });
  });

  it("sends one Image 3.0 reference as image and rejects more", async () => {
    const fetchMock = stubFetch(imageCreated("i4"), imageTask("i4", "succeed", {
      task_result: { images: [{ index: 0, url: RESULT_URL }] }
    }));
    await settle(provider().imageToImage([PNG], { model: image("kling-v3"), prompt: "paint it", negativePrompt: "text" }));
    expect(jsonTo(fetchMock, `${API}/v1/images/generations`)).toEqual({
      model_name: "kling-v3",
      prompt: "paint it\n\nDo not include: text",
      n: 1,
      image: PNG_B64
    });
    await expect(provider().imageToImage([PNG, PNG], { model: image("kling-v3"), prompt: "x" })).rejects.toThrow(
      "at most 1 reference image"
    );
  });

  it("reports a failed image task with task_status_msg", async () => {
    stubFetch(imageCreated("i5"), imageTask("i5", "failed", { task_status_msg: "sensitive content" }));
    await expect(settle(provider().textToImage({ model: image("kling-v3"), prompt: "x" }))).rejects.toThrow(
      "Kling image task i5 failed: sensitive content"
    );
  });

  it("stops polling when the caller aborts", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("/tasks") ? videoTask("t10", "processing") : videoCreated("t10")
    );
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const run = provider().textToVideo({ model: video("kling-3.0"), prompt: "x", signal: controller.signal });
    controller.abort(new Error("stopped"));
    await expect(settle(run)).rejects.toThrow("stopped");
  });
});
