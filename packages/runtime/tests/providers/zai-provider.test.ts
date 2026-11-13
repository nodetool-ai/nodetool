import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { recordGenerationReceiptAsync } from "../../src/generation-receipt.js";
import { safeFetch } from "../../src/providers/safe-url.js";
import {
  ZaiProvider,
  chooseCogVideoSize,
  chooseGlmImageSize,
  resolveZaiBaseURL
} from "../../src/providers/zai-provider.js";
import type { ImageModel, VideoModel } from "../../src/providers/types.js";
import { chatJsonResponse, chatSSEResponse } from "./helpers/compat-fetch.js";

vi.mock("../../src/generation-receipt.js", () => ({
  recordGenerationReceiptAsync: vi.fn(async () => {})
}));
// Route result downloads through the provider's injected fetch so one mock
// sees every request, while still asserting the download went via safeFetch.
vi.mock("../../src/providers/safe-url.js", () => ({
  safeFetch: vi.fn(
    async (url: string, init: RequestInit | undefined, _redirects: number, impl: typeof fetch) =>
      impl(url, init)
  )
}));

const BASE = "https://api.z.ai/api/paas/v4";
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]);
const WAV = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20
]);
const IMAGE_MODEL: ImageModel = { id: "glm-image", name: "GLM-Image", provider: "zai" };
const VIDEO_MODEL: VideoModel = { id: "cogvideox-3", name: "CogVideoX-3", provider: "zai" };

type Handler = (url: string, init: RequestInit | undefined) => Response | Promise<Response>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

/** A fetch mock that answers each call with the next handler in order. */
function sequence(...handlers: Handler[]): Mock<typeof fetch> {
  let index = 0;
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const handler = handlers[index++];
    if (!handler) throw new Error(`unexpected fetch #${index}: ${String(input)}`);
    return handler(String(input), init);
  }) as unknown as Mock<typeof fetch>;
}

function make(fetchFn: Mock<typeof fetch>, region?: string): ZaiProvider {
  return new ZaiProvider(
    { ZAI_API_KEY: "zai-test", ZAI_REGION: region },
    { fetchFn: fetchFn as unknown as typeof fetch }
  );
}

function callOf(fetchFn: Mock<typeof fetch>, index: number): { url: string; init: RequestInit } {
  const [url, init] = fetchFn.mock.calls[index] as [string, RequestInit];
  return { url: String(url), init: init ?? {} };
}

function bodyOf(fetchFn: Mock<typeof fetch>, index: number): Record<string, unknown> {
  return JSON.parse(String(callOf(fetchFn, index).init.body)) as Record<string, unknown>;
}

afterEach(() => {
  vi.useRealTimers();
  vi.mocked(recordGenerationReceiptAsync).mockClear();
  vi.mocked(safeFetch).mockClear();
});

describe("ZaiProvider configuration", () => {
  it("requires ZAI_API_KEY and reports it", () => {
    expect(() => new ZaiProvider({})).toThrow("ZAI_API_KEY is not configured");
    expect(() => new ZaiProvider({ ZAI_API_KEY: "  " })).toThrow("ZAI_API_KEY");
    const provider = new ZaiProvider({ ZAI_API_KEY: " k " });
    expect(ZaiProvider.requiredSecrets()).toEqual(["ZAI_API_KEY"]);
    expect(provider.getContainerEnv()).toEqual({ ZAI_API_KEY: "k" });
    expect(provider.provider).toBe("zai");
  });

  it("resolves the international host by default and the China host on request", () => {
    expect(resolveZaiBaseURL(undefined)).toBe(BASE);
    expect(resolveZaiBaseURL("")).toBe(BASE);
    expect(resolveZaiBaseURL("international")).toBe(BASE);
    expect(resolveZaiBaseURL("China")).toBe("https://open.bigmodel.cn/api/paas/v4");
    expect(resolveZaiBaseURL("contract-test-ZAI_REGION")).toBe(BASE);
  });

  it("declares media capabilities beyond chat", () => {
    const caps = new ZaiProvider({ ZAI_API_KEY: "k" }).getCapabilities();
    expect(caps).toEqual(
      expect.arrayContaining([
        "generate_message",
        "text_to_image",
        "text_to_video",
        "image_to_video",
        "automatic_speech_recognition"
      ])
    );
    expect(caps).not.toContain("text_to_speech");
    expect(caps).not.toContain("generate_embedding");
  });

  it("lists the documented model ids without a network call", async () => {
    const fetchFn = sequence();
    const provider = make(fetchFn);
    const chat = await provider.getAvailableLanguageModels();
    expect(chat.map((m) => m.id)).toEqual([
      "glm-5.3",
      "glm-5.2",
      "glm-5.1",
      "glm-5",
      "glm-4.7",
      "glm-4.6",
      "glm-5.3-flash",
      "glm-5.3-flashx",
      "glm-5.3-flashx-legal"
    ]);
    expect(chat.every((m) => m.provider === "zai")).toBe(true);
    expect((await provider.getAvailableImageModels()).map((m) => m.id)).toEqual(["glm-image"]);
    const [video] = await provider.getAvailableVideoModels();
    expect(video).toMatchObject({
      id: "cogvideox-3",
      supportedTasks: ["text_to_video", "image_to_video"],
      durations: [5, 10],
      endFrame: "optional"
    });
    expect((await provider.getAvailableASRModels()).map((m) => m.id)).toEqual(["glm-asr-2512"]);
    expect(await provider.getAvailableTTSModels()).toEqual([]);
    expect(await provider.getAvailableEmbeddingModels()).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("ZaiProvider chat", () => {
  it("posts a documented chat request and decodes tool calls with object arguments", async () => {
    const fetchFn = sequence(() =>
      chatJsonResponse({
        id: "chatcmpl-1",
        request_id: "req-1",
        created: 1,
        model: "glm-5.1",
        choices: [
          {
            index: 0,
            finish_reason: "tool_calls",
            message: {
              role: "assistant",
              content: "",
              // The response schema types arguments as an object.
              tool_calls: [
                { id: "call_1", type: "function", function: { name: "get_weather", arguments: { city: "Berlin" } } }
              ]
            }
          }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      })
    );
    const provider = make(fetchFn);
    const message = await provider.generateMessage({
      model: "glm-5.1",
      messages: [{ role: "user", content: "weather?" }],
      tools: [
        {
          name: "get_weather",
          description: "Weather",
          inputSchema: { type: "object", properties: { city: { type: "string" } } }
        }
      ],
      toolChoice: "get_weather",
      maxTokens: 1000,
      temperature: 1.5,
      presencePenalty: 0.5
    });

    const { url, init } = callOf(fetchFn, 0);
    expect(url).toBe(`${BASE}/chat/completions`);
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer zai-test");
    const body = bodyOf(fetchFn, 0);
    expect(body).toMatchObject({ model: "glm-5.1", stream: false, max_tokens: 1000, temperature: 1 });
    expect(body).not.toHaveProperty("max_completion_tokens");
    expect(body).not.toHaveProperty("presence_penalty");
    // Only "auto" is documented, so a forced tool is dropped rather than refused.
    expect(body).not.toHaveProperty("tool_choice");
    expect(body.tools).toEqual([
      expect.objectContaining({ type: "function", function: expect.objectContaining({ name: "get_weather" }) })
    ]);
    expect(message.toolCalls).toEqual([{ id: "call_1", name: "get_weather", args: { city: "Berlin" } }]);
  });

  it("streams reasoning, content and tool calls, ending with one done chunk", async () => {
    const fetchFn = sequence(() =>
      chatSSEResponse([
        { choices: [{ index: 0, delta: { role: "assistant", reasoning_content: "thinking" } }] },
        { choices: [{ index: 0, delta: { content: "Hi" } }] },
        {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "f", arguments: "{\"a\":1}" } }]
              }
            }
          ]
        },
        {
          choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
          usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 }
        }
      ])
    );
    const provider = make(fetchFn);
    const items: unknown[] = [];
    for await (const item of provider.generateMessages({
      model: "glm-5.3",
      messages: [{ role: "user", content: "hi" }]
    })) {
      items.push(item);
    }
    const body = bodyOf(fetchFn, 0);
    expect(body).toMatchObject({ stream: true });
    expect(body).not.toHaveProperty("stream_options");
    expect(items).toContainEqual(expect.objectContaining({ type: "chunk", content: "thinking", thinking: true }));
    expect(items).toContainEqual(expect.objectContaining({ type: "chunk", content: "Hi" }));
    expect(items).toContainEqual({ id: "call_1", name: "f", args: { a: 1 } });
    expect(items.filter((i) => (i as { done?: boolean }).done === true)).toHaveLength(1);
  });

  it("uses the China host when ZAI_REGION=china", async () => {
    const fetchFn = sequence(() =>
      chatJsonResponse({ choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }] })
    );
    await make(fetchFn, "china").generateMessage({ model: "glm-4.7", messages: [{ role: "user", content: "x" }] });
    expect(callOf(fetchFn, 0).url).toBe("https://open.bigmodel.cn/api/paas/v4/chat/completions");
  });
});

describe("ZaiProvider image generation", () => {
  it("posts /images/generations and downloads data[0].url through safeFetch", async () => {
    const fetchFn = sequence(
      () =>
        json({
          created: 1760000000,
          data: [{ url: "https://cdn.example.com/out.png" }],
          content_filter: [{ role: "assistant", level: 3 }]
        }),
      () => new Response(PNG)
    );
    const bytes = await make(fetchFn).textToImage({
      model: IMAGE_MODEL,
      prompt: "a red fox",
      negativePrompt: "blur",
      width: 1920,
      height: 1080,
      quality: "standard"
    });

    expect(callOf(fetchFn, 0).url).toBe(`${BASE}/images/generations`);
    expect(new Headers(callOf(fetchFn, 0).init.headers).get("content-type")).toBe("application/json");
    expect(bodyOf(fetchFn, 0)).toEqual({
      model: "glm-image",
      prompt: "a red fox\n\nDo not include: blur",
      size: "1728x960",
      quality: "standard"
    });
    expect(vi.mocked(safeFetch)).toHaveBeenCalledWith(
      "https://cdn.example.com/out.png",
      expect.anything(),
      5,
      expect.any(Function)
    );
    expect(bytes).toEqual(PNG);
  });

  it("surfaces the documented error body", async () => {
    const fetchFn = sequence(() => json({ error: { code: "1301", message: "unsafe content" } }, 400));
    await expect(make(fetchFn).textToImage({ model: IMAGE_MODEL, prompt: "x" })).rejects.toThrow(
      "Z.ai images/generations failed: unsafe content (code 1301)"
    );
  });

  it("fails clearly when the reply carries no URL", async () => {
    const fetchFn = sequence(() => json({ created: 1, data: [] }));
    await expect(make(fetchFn).textToImage({ model: IMAGE_MODEL, prompt: "x" })).rejects.toThrow(
      "returned no image URL"
    );
  });

  it("rejects an unknown image model before calling the API", async () => {
    const fetchFn = sequence();
    await expect(
      make(fetchFn).textToImage({ model: { ...IMAGE_MODEL, id: "cogview-4" }, prompt: "x" })
    ).rejects.toThrow("not supported");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("snaps shapes to the recommended glm-image sizes", () => {
    expect(chooseGlmImageSize()).toBe("1280x1280");
    expect(chooseGlmImageSize(1024, 1024)).toBe("1280x1280");
    expect(chooseGlmImageSize(null, null, "9:16")).toBe("960x1728");
    expect(chooseGlmImageSize(null, null, "3:2")).toBe("1568x1056");
    expect(chooseGlmImageSize(null, null, "4:3")).toBe("1472x1088");
  });
});

describe("ZaiProvider video generation", () => {
  it("submits text-to-video, polls async-result until SUCCESS and downloads video_result[0].url", async () => {
    vi.useFakeTimers();
    const fetchFn = sequence(
      () => json({ model: "cogvideox-3", id: "task-1", request_id: "r1", task_status: "PROCESSING" }),
      () => json({ model: "cogvideox-3", task_status: "PROCESSING", request_id: "r1" }),
      () =>
        json({
          model: "cogvideox-3",
          task_status: "SUCCESS",
          request_id: "r1",
          video_result: [{ url: "https://cdn.example.com/v.mp4", cover_image_url: "https://cdn.example.com/c.jpg" }]
        }),
      () => new Response(new Uint8Array([9, 9, 9]))
    );
    const pending = make(fetchFn).textToVideo({
      model: VIDEO_MODEL,
      prompt: "a cat surfing",
      durationSeconds: 10,
      aspectRatio: "16:9",
      resolution: "1080p"
    });
    await vi.advanceTimersByTimeAsync(5000);
    const bytes = await pending;

    expect(callOf(fetchFn, 0).url).toBe(`${BASE}/videos/generations`);
    expect(bodyOf(fetchFn, 0)).toEqual({
      model: "cogvideox-3",
      prompt: "a cat surfing",
      duration: 10,
      size: "1920x1080"
    });
    expect(callOf(fetchFn, 1).url).toBe(`${BASE}/async-result/task-1`);
    expect(callOf(fetchFn, 1).init.method ?? "GET").toBe("GET");
    expect(new Headers(callOf(fetchFn, 1).init.headers).get("authorization")).toBe("Bearer zai-test");
    expect(callOf(fetchFn, 2).url).toBe(`${BASE}/async-result/task-1`);
    expect(callOf(fetchFn, 3).url).toBe("https://cdn.example.com/v.mp4");
    expect(vi.mocked(recordGenerationReceiptAsync)).toHaveBeenCalledWith({ provider_request_id: "task-1" });
    expect(bytes).toEqual(new Uint8Array([9, 9, 9]));
  });

  it("sends first and last frames as base64 image_url items in speed mode", async () => {
    const fetchFn = sequence(
      () => json({ id: "task-2", task_status: "PROCESSING" }),
      () => json({ task_status: "SUCCESS", video_result: [{ url: "https://cdn.example.com/v.mp4" }] }),
      () => new Response(new Uint8Array([1]))
    );
    await make(fetchFn).imageToVideo(PNG, {
      model: VIDEO_MODEL,
      prompt: "move",
      endImage: JPEG,
      durationSeconds: 5
    });
    expect(bodyOf(fetchFn, 0)).toEqual({
      model: "cogvideox-3",
      prompt: "move",
      duration: 5,
      quality: "speed",
      image_url: [Buffer.from(PNG).toString("base64"), Buffer.from(JPEG).toString("base64")]
    });
  });

  it("throws the FAIL status instead of waiting for the timeout", async () => {
    const fetchFn = sequence(
      () => json({ id: "task-3", task_status: "PROCESSING" }),
      () => json({ task_status: "FAIL", request_id: "r3" })
    );
    await expect(make(fetchFn).textToVideo({ model: VIDEO_MODEL, prompt: "x" })).rejects.toThrow(
      "Z.ai video task task-3 failed"
    );
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("times out after the caller's budget", async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn(async (input: string | URL | Request) =>
      String(input).endsWith("/videos/generations")
        ? json({ id: "task-4", task_status: "PROCESSING" })
        : json({ task_status: "PROCESSING" })
    ) as unknown as Mock<typeof fetch>;
    const pending = make(fetchFn).textToVideo({ model: VIDEO_MODEL, prompt: "x", timeoutSeconds: 10 });
    const assertion = expect(pending).rejects.toThrow("did not finish within 10s");
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    // One submit plus ceil(10s / 5s) = 2 polls.
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("surfaces a submit error with the business code", async () => {
    const fetchFn = sequence(() => json({ code: 1113, message: "Insufficient balance" }, 429));
    await expect(make(fetchFn).textToVideo({ model: VIDEO_MODEL, prompt: "x" })).rejects.toThrow(
      "Z.ai videos/generations failed: Insufficient balance (code 1113)"
    );
    expect(vi.mocked(recordGenerationReceiptAsync)).not.toHaveBeenCalled();
  });

  it("validates inputs before submitting", async () => {
    const fetchFn = sequence();
    const provider = make(fetchFn);
    await expect(provider.textToVideo({ model: VIDEO_MODEL, prompt: "  " })).rejects.toThrow("requires a prompt");
    await expect(provider.textToVideo({ model: VIDEO_MODEL, prompt: "x".repeat(513) })).rejects.toThrow(
      "512 characters"
    );
    await expect(
      provider.imageToVideo(new Uint8Array([1, 2, 3, 4]), { model: VIDEO_MODEL })
    ).rejects.toThrow("PNG or JPEG");
    await expect(
      provider.textToVideo({ model: { ...VIDEO_MODEL, id: "viduq1-text" }, prompt: "x" })
    ).rejects.toThrow("not supported");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("maps aspect ratio and resolution onto the size enum", () => {
    expect(chooseCogVideoSize()).toBeUndefined();
    expect(chooseCogVideoSize("16:9", "720p")).toBe("1280x720");
    expect(chooseCogVideoSize("16:9", "4k")).toBe("3840x2160");
    expect(chooseCogVideoSize("9:16", "1080p")).toBe("1080x1920");
    expect(chooseCogVideoSize("9:16", "2160p")).toBe("1080x1920");
    expect(chooseCogVideoSize("1:1", "1080p")).toBe("1024x1024");
    expect(chooseCogVideoSize(null, "1080p")).toBe("1920x1080");
    expect(chooseCogVideoSize("4:3", "720p")).toBeUndefined();
  });
});

describe("ZaiProvider transcription", () => {
  it("posts multipart audio to /audio/transcriptions and returns text", async () => {
    const fetchFn = sequence(() =>
      json({ id: "t1", created: 1, request_id: "r", model: "glm-asr-2512", text: "hello world" })
    );
    const result = await make(fetchFn).automaticSpeechRecognition({
      audio: WAV,
      model: "glm-asr-2512",
      prompt: "earlier text"
    });
    const { url, init } = callOf(fetchFn, 0);
    expect(url).toBe(`${BASE}/audio/transcriptions`);
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer zai-test");
    // fetch sets the multipart boundary itself.
    expect(headers.get("content-type")).toBeNull();
    const form = init.body as FormData;
    expect(form.get("model")).toBe("glm-asr-2512");
    expect(form.get("prompt")).toBe("earlier text");
    expect(form.get("stream")).toBe("false");
    const file = form.get("file") as File;
    expect(file.name).toBe("audio.wav");
    expect(file.type).toBe("audio/wav");
    expect(result).toEqual({ text: "hello world" });
  });

  it("refuses formats the endpoint does not accept", async () => {
    const fetchFn = sequence();
    await expect(
      make(fetchFn).automaticSpeechRecognition({ audio: PNG, model: "glm-asr-2512" })
    ).rejects.toThrow("WAV or MP3");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("surfaces an error reply", async () => {
    const fetchFn = sequence(() => json({ error: { code: "1000", message: "Authentication failed" } }, 401));
    await expect(
      make(fetchFn).automaticSpeechRecognition({ audio: WAV, model: "glm-asr-2512" })
    ).rejects.toThrow("Authentication failed (code 1000)");
  });
});
