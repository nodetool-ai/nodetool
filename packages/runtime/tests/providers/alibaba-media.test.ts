import { afterEach, describe, expect, it, vi } from "vitest";
import { AlibabaProvider } from "../../src/providers/alibaba-provider.js";
import { nativeApiBase } from "../../src/providers/alibaba-media.js";

vi.mock("../../src/generation-receipt.js", () => ({
  recordGenerationReceiptAsync: vi.fn(async () => {})
}));

const API = "https://dashscope-intl.aliyuncs.com/api/v1";
const VIDEO = `${API}/services/aigc/video-generation/video-synthesis`;
const MULTIMODAL = `${API}/services/aigc/multimodal-generation/generation`;
const OSS = "https://dashscope-result-sg.oss-ap-southeast-1.aliyuncs.com";
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
const PNG_URI = `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`;

type Route = (init: RequestInit) => Response;

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

/**
 * A fetch that answers each URL from a queue of handlers, so a test states
 * the exact sequence of create, poll and download replies it expects.
 */
function mockFetch(routes: Record<string, Route[]>) {
  return vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    const queue = routes[url];
    const handler = queue?.length && queue.length > 1 ? queue.shift() : queue?.[0];
    if (!handler) throw new Error(`unexpected request to ${url}`);
    return handler(init);
  });
}

function provider(fetchFn: ReturnType<typeof mockFetch>, baseURL?: string) {
  return new AlibabaProvider(
    { DASHSCOPE_API_KEY: "sk-test", ...(baseURL ? { DASHSCOPE_BASE_URL: baseURL } : {}) },
    { client: {} as never, fetchFn: fetchFn as unknown as typeof fetch }
  );
}

function callsTo(fetchFn: ReturnType<typeof mockFetch>, url: string) {
  return fetchFn.mock.calls.filter(([target]) => String(target) === url);
}

function bodyOf(fetchFn: ReturnType<typeof mockFetch>, url: string, index = 0) {
  const call = callsTo(fetchFn, url)[index];
  if (!call) throw new Error(`no request to ${url}`);
  return JSON.parse(String(call[1]?.body)) as Record<string, any>;
}

function headersOf(fetchFn: ReturnType<typeof mockFetch>, url: string) {
  return callsTo(fetchFn, url)[0]?.[1]?.headers as Record<string, string>;
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

const created = (taskId: string) => () =>
  json({
    request_id: "req-create",
    output: { task_id: taskId, task_status: "PENDING" }
  });

const status = (taskId: string, taskStatus: string, extra: object = {}) => () =>
  json({
    request_id: "req-poll",
    output: { task_id: taskId, task_status: taskStatus, ...extra }
  });

const bytes = (data: Uint8Array) => () => new Response(data);

afterEach(() => {
  vi.useRealTimers();
});

describe("nativeApiBase", () => {
  it("swaps the compatible-mode path for /api/v1 on the same regional host", () => {
    expect(nativeApiBase("https://dashscope-intl.aliyuncs.com/compatible-mode/v1")).toBe(API);
    expect(nativeApiBase("https://dashscope.aliyuncs.com/compatible-mode/v1/")).toBe(
      "https://dashscope.aliyuncs.com/api/v1"
    );
    expect(
      nativeApiBase("https://ws1.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1")
    ).toBe("https://ws1.ap-southeast-1.maas.aliyuncs.com/api/v1");
    expect(nativeApiBase("https://proxy.example.com/v1")).toBe(
      "https://proxy.example.com/api/v1"
    );
  });
});

describe("AlibabaProvider media catalog", () => {
  it("declares the media capabilities its catalog offers", async () => {
    const p = provider(mockFetch({}));
    expect(p.getCapabilities()).toEqual(
      expect.arrayContaining([
        "text_to_image",
        "image_to_image",
        "text_to_video",
        "image_to_video",
        "text_to_speech"
      ])
    );
    const videos = await p.getAvailableVideoModels();
    expect(videos.map((m) => m.id)).toEqual([
      "wan2.7-t2v",
      "wan2.6-t2v",
      "wan2.5-t2v-preview",
      "wan2.7-i2v",
      "wan2.6-i2v",
      "wan2.6-i2v-flash",
      "wan2.5-i2v-preview"
    ]);
    expect(videos.find((m) => m.id === "wan2.7-i2v")?.endFrame).toBe("optional");
    expect(videos.find((m) => m.id === "wan2.5-t2v-preview")?.durations).toEqual([5, 10]);

    const images = await p.getAvailableImageModels();
    expect(images.find((m) => m.id === "qwen-image-3.0")?.supportedTasks).toEqual([
      "text_to_image",
      "image_to_image"
    ]);
    expect(images.find((m) => m.id === "wan2.6-t2i")?.supportedTasks).toEqual([
      "text_to_image"
    ]);

    const tts = await p.getAvailableTTSModels();
    expect(tts[0].id).toBe("qwen3-tts-flash");
    expect(tts[0].voices).toContain("Cherry");
  });
});

describe("AlibabaProvider video", () => {
  const videoBytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);

  it("creates a Wan 2.7 text-to-video task, polls it to SUCCEEDED and downloads video_url", async () => {
    const fetchFn = mockFetch({
      [VIDEO]: [created("t-1")],
      [`${API}/tasks/t-1`]: [
        status("t-1", "PENDING"),
        status("t-1", "RUNNING"),
        status("t-1", "SUCCEEDED", { video_url: `${OSS}/out.mp4` })
      ],
      [`${OSS}/out.mp4`]: [bytes(videoBytes)]
    });

    const out = await settle(
      provider(fetchFn).textToVideo({
        model: { id: "wan2.7-t2v", name: "Wan", provider: "alibaba" },
        prompt: "a cat on a skateboard",
        negativePrompt: "blurry",
        durationSeconds: 8,
        resolution: "720p",
        aspectRatio: "9:16",
        seed: 42
      })
    );

    expect(out).toEqual(videoBytes);
    expect(headersOf(fetchFn, VIDEO)).toEqual({
      Authorization: "Bearer sk-test",
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable"
    });
    expect(bodyOf(fetchFn, VIDEO)).toEqual({
      model: "wan2.7-t2v",
      input: { prompt: "a cat on a skateboard", negative_prompt: "blurry" },
      parameters: { duration: 8, seed: 42, resolution: "720P", ratio: "9:16" }
    });
    expect(callsTo(fetchFn, `${API}/tasks/t-1`)).toHaveLength(3);
    expect(headersOf(fetchFn, `${API}/tasks/t-1`)).toEqual({
      Authorization: "Bearer sk-test",
      "Content-Type": "application/json"
    });
  });

  it("sends an exact size for the legacy Wan 2.6/2.5 text-to-video protocol", async () => {
    const fetchFn = mockFetch({
      [VIDEO]: [created("t-2")],
      [`${API}/tasks/t-2`]: [status("t-2", "SUCCEEDED", { video_url: `${OSS}/2.mp4` })],
      [`${OSS}/2.mp4`]: [bytes(videoBytes)]
    });
    await settle(
      provider(fetchFn).textToVideo({
        model: { id: "wan2.5-t2v-preview", name: "Wan", provider: "alibaba" },
        prompt: "waves",
        durationSeconds: 7,
        resolution: "480p",
        aspectRatio: "1:1"
      })
    );
    expect(bodyOf(fetchFn, VIDEO)).toEqual({
      model: "wan2.5-t2v-preview",
      input: { prompt: "waves" },
      parameters: { duration: 5, size: "624*624" }
    });
  });

  it("sends first and last frames as media entries for Wan 2.7 image-to-video", async () => {
    const fetchFn = mockFetch({
      [VIDEO]: [created("t-3")],
      [`${API}/tasks/t-3`]: [status("t-3", "SUCCEEDED", { video_url: `${OSS}/3.mp4` })],
      [`${OSS}/3.mp4`]: [bytes(videoBytes)]
    });
    await settle(
      provider(fetchFn).imageToVideo(PNG, {
        model: { id: "wan2.7-i2v", name: "Wan", provider: "alibaba" },
        prompt: "the flower opens",
        endImage: PNG
      })
    );
    expect(bodyOf(fetchFn, VIDEO)).toEqual({
      model: "wan2.7-i2v",
      input: {
        prompt: "the flower opens",
        media: [
          { type: "first_frame", url: PNG_URI },
          { type: "last_frame", url: PNG_URI }
        ]
      },
      parameters: { resolution: "1080P" }
    });
  });

  it("sends img_url for the legacy first-frame protocol and refuses an end frame there", async () => {
    const fetchFn = mockFetch({
      [VIDEO]: [created("t-4")],
      [`${API}/tasks/t-4`]: [status("t-4", "SUCCEEDED", { video_url: `${OSS}/4.mp4` })],
      [`${OSS}/4.mp4`]: [bytes(videoBytes)]
    });
    const model = { id: "wan2.6-i2v-flash", name: "Wan", provider: "alibaba" as const };
    await settle(
      provider(fetchFn).imageToVideo(PNG, { model, durationSeconds: 15, resolution: "720P" })
    );
    expect(bodyOf(fetchFn, VIDEO)).toEqual({
      model: "wan2.6-i2v-flash",
      input: { img_url: PNG_URI },
      parameters: { duration: 15, resolution: "720P" }
    });

    await expect(
      provider(fetchFn).imageToVideo(PNG, { model, endImage: PNG })
    ).rejects.toThrow("takes no end frame");
  });

  it("rejects a model used for the wrong task before any request", async () => {
    const fetchFn = mockFetch({});
    await expect(
      provider(fetchFn).textToVideo({
        model: { id: "wan2.7-i2v", name: "Wan", provider: "alibaba" },
        prompt: "x"
      })
    ).rejects.toThrow("does not support text_to_video");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("surfaces a FAILED task's code and message", async () => {
    const fetchFn = mockFetch({
      [VIDEO]: [created("t-5")],
      [`${API}/tasks/t-5`]: [
        status("t-5", "FAILED", {
          code: "DataInspectionFailed",
          message: "Input data may contain inappropriate content."
        })
      ]
    });
    await expect(
      settle(
        provider(fetchFn).textToVideo({
          model: { id: "wan2.7-t2v", name: "Wan", provider: "alibaba" },
          prompt: "x"
        })
      )
    ).rejects.toThrow(
      "Alibaba video task t-5 ended FAILED: DataInspectionFailed: Input data may contain inappropriate content."
    );
  });

  it.each(["CANCELED", "UNKNOWN"])("treats %s as terminal", async (state) => {
    const fetchFn = mockFetch({
      [VIDEO]: [created("t-6")],
      [`${API}/tasks/t-6`]: [status("t-6", state)]
    });
    await expect(
      settle(
        provider(fetchFn).textToVideo({
          model: { id: "wan2.7-t2v", name: "Wan", provider: "alibaba" },
          prompt: "x"
        })
      )
    ).rejects.toThrow(`ended ${state}`);
    expect(callsTo(fetchFn, `${API}/tasks/t-6`)).toHaveLength(1);
  });

  it("reports a task-creation error with its DashScope code", async () => {
    const fetchFn = mockFetch({
      [VIDEO]: [
        () =>
          json(
            { request_id: "r", code: "InvalidApiKey", message: "Invalid API-key provided." },
            401
          )
      ]
    });
    await expect(
      provider(fetchFn).textToVideo({
        model: { id: "wan2.7-t2v", name: "Wan", provider: "alibaba" },
        prompt: "x"
      })
    ).rejects.toThrow("(401): InvalidApiKey: Invalid API-key provided.");
  });

  it("times out after the caller's budget", async () => {
    const fetchFn = mockFetch({
      [VIDEO]: [created("t-7")],
      [`${API}/tasks/t-7`]: [status("t-7", "RUNNING")]
    });
    await expect(
      settle(
        provider(fetchFn).textToVideo({
          model: { id: "wan2.7-t2v", name: "Wan", provider: "alibaba" },
          prompt: "x",
          timeoutSeconds: 30
        })
      )
    ).rejects.toThrow("did not finish within 30s");
    expect(callsTo(fetchFn, `${API}/tasks/t-7`)).toHaveLength(2);
  });

  it("uses the region from DASHSCOPE_BASE_URL for the native API", async () => {
    const beijing = "https://dashscope.aliyuncs.com/api/v1";
    const fetchFn = mockFetch({
      [`${beijing}/services/aigc/video-generation/video-synthesis`]: [created("t-8")],
      [`${beijing}/tasks/t-8`]: [status("t-8", "SUCCEEDED", { video_url: `${OSS}/8.mp4` })],
      [`${OSS}/8.mp4`]: [bytes(videoBytes)]
    });
    await settle(
      provider(fetchFn, "https://dashscope.aliyuncs.com/compatible-mode/v1").textToVideo({
        model: { id: "wan2.7-t2v", name: "Wan", provider: "alibaba" },
        prompt: "x"
      })
    );
    expect(callsTo(fetchFn, `${beijing}/tasks/t-8`)).toHaveLength(1);
  });
});

describe("AlibabaProvider images", () => {
  const imageReply = (...urls: string[]) => () =>
    json({
      request_id: "req-img",
      output: {
        choices: [
          {
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: urls.map((image) => ({ type: "image", image }))
            }
          }
        ]
      },
      usage: { image_count: urls.length, width: 1024, height: 1024 }
    });

  it("generates Qwen-Image text-to-image with messages, n and a w*h size", async () => {
    const fetchFn = mockFetch({
      [MULTIMODAL]: [imageReply(`${OSS}/a.png`, `${OSS}/b.png`)],
      [`${OSS}/a.png`]: [bytes(new Uint8Array([1]))],
      [`${OSS}/b.png`]: [bytes(new Uint8Array([2]))]
    });
    const out = await provider(fetchFn).textToImages(
      {
        model: { id: "qwen-image-3.0", name: "Qwen", provider: "alibaba" },
        prompt: "a lighthouse",
        negativePrompt: "text",
        width: 1024,
        height: 768,
        seed: 7
      },
      2
    );
    expect(out).toEqual([new Uint8Array([1]), new Uint8Array([2])]);
    expect(headersOf(fetchFn, MULTIMODAL)).not.toHaveProperty("X-DashScope-Async");
    expect(bodyOf(fetchFn, MULTIMODAL)).toEqual({
      model: "qwen-image-3.0",
      input: { messages: [{ role: "user", content: [{ text: "a lighthouse" }] }] },
      parameters: { n: 2, size: "1024*768", negative_prompt: "text", seed: 7 }
    });
  });

  it("scales a size into Wan 2.6's pixel budget and always sends n", async () => {
    const fetchFn = mockFetch({
      [MULTIMODAL]: [imageReply(`${OSS}/c.png`)],
      [`${OSS}/c.png`]: [bytes(new Uint8Array([3]))]
    });
    await provider(fetchFn).textToImage({
      model: { id: "wan2.6-t2i", name: "Wan", provider: "alibaba" },
      prompt: "a fox",
      width: 512,
      height: 512
    });
    expect(bodyOf(fetchFn, MULTIMODAL).parameters).toEqual({ n: 1, size: "1280*1280" });
  });

  it("edits with Wan 2.7 Image: images before text, tier size, no negative prompt", async () => {
    const fetchFn = mockFetch({
      [MULTIMODAL]: [imageReply(`${OSS}/d.png`)],
      [`${OSS}/d.png`]: [bytes(new Uint8Array([4]))]
    });
    await provider(fetchFn).imageToImage([PNG, PNG], {
      model: { id: "wan2.7-image", name: "Wan", provider: "alibaba" },
      prompt: "put the cat in the first image on the sofa in the second",
      negativePrompt: "ignored",
      resolution: "1K"
    });
    expect(bodyOf(fetchFn, MULTIMODAL)).toEqual({
      model: "wan2.7-image",
      input: {
        messages: [
          {
            role: "user",
            content: [
              { image: PNG_URI },
              { image: PNG_URI },
              { text: "put the cat in the first image on the sofa in the second" }
            ]
          }
        ]
      },
      parameters: { n: 1, size: "1K" }
    });
  });

  it("refuses an edit on a text-only model and too many images", async () => {
    const fetchFn = mockFetch({});
    await expect(
      provider(fetchFn).imageToImage([PNG], {
        model: { id: "wan2.6-t2i", name: "Wan", provider: "alibaba" },
        prompt: "x"
      })
    ).rejects.toThrow("does not support image_to_image");
    await expect(
      provider(fetchFn).imageToImage([PNG, PNG, PNG, PNG], {
        model: { id: "qwen-image-3.0-pro", name: "Qwen", provider: "alibaba" },
        prompt: "x"
      })
    ).rejects.toThrow("at most 3 input images");
    await expect(
      provider(fetchFn).textToImages(
        { model: { id: "wan2.7-image", name: "Wan", provider: "alibaba" }, prompt: "x" },
        5
      )
    ).rejects.toThrow("1 to 4 images");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("reports a reply with no image", async () => {
    const fetchFn = mockFetch({ [MULTIMODAL]: [imageReply()] });
    await expect(
      provider(fetchFn).textToImage({
        model: { id: "qwen-image-2.0", name: "Qwen", provider: "alibaba" },
        prompt: "x"
      })
    ).rejects.toThrow("returned no image");
  });

  it("downloads result URLs through the SSRF guard", async () => {
    const fetchFn = mockFetch({
      [MULTIMODAL]: [imageReply("https://169.254.169.254/latest/meta-data")]
    });
    await expect(
      provider(fetchFn).textToImage({
        model: { id: "qwen-image-2.0", name: "Qwen", provider: "alibaba" },
        prompt: "x"
      })
    ).rejects.toThrow();
    expect(callsTo(fetchFn, "https://169.254.169.254/latest/meta-data")).toHaveLength(0);
  });
});

describe("AlibabaProvider speech", () => {
  function wav(samples: number[], sampleRate = 24000): Uint8Array {
    const data = Buffer.alloc(samples.length * 2);
    samples.forEach((s, i) => data.writeInt16LE(s, i * 2));
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + data.length, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(data.length, 40);
    return new Uint8Array(Buffer.concat([header, data]));
  }

  const ttsReply = () =>
    json({
      status_code: 200,
      request_id: "req-tts",
      code: "",
      message: "",
      output: {
        text: null,
        finish_reason: "stop",
        choices: null,
        audio: {
          data: "",
          url: `${OSS}/speech.wav`,
          id: "audio_1",
          expires_at: 1763000000
        }
      },
      usage: { characters: 5 }
    });

  it("posts text, voice and language_type and returns the WAV file", async () => {
    const audio = wav([1, -1, 2]);
    const fetchFn = mockFetch({
      [MULTIMODAL]: [ttsReply],
      [`${OSS}/speech.wav`]: [bytes(audio)]
    });
    const out = await provider(fetchFn).textToSpeechEncoded({
      text: "Hello",
      model: "qwen3-tts-flash",
      voice: "Ethan",
      language: "en-US",
      audioFormat: "mp3"
    });
    expect(out).toEqual({ data: audio, mimeType: "audio/wav" });
    expect(bodyOf(fetchFn, MULTIMODAL)).toEqual({
      model: "qwen3-tts-flash",
      input: { text: "Hello", voice: "Ethan", language_type: "English" }
    });
  });

  it("streams the WAV as 24 kHz PCM samples", async () => {
    const fetchFn = mockFetch({
      [MULTIMODAL]: [ttsReply],
      [`${OSS}/speech.wav`]: [bytes(wav([10, -20, 30]))]
    });
    const chunks = [];
    for await (const chunk of provider(fetchFn).textToSpeech({
      text: "Hello",
      model: "qwen3-tts-flash"
    })) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(1);
    expect(chunks[0].sampleRate).toBe(24000);
    expect(Array.from(chunks[0].samples)).toEqual([10, -20, 30]);
    expect(bodyOf(fetchFn, MULTIMODAL).input).toEqual({ text: "Hello", voice: "Cherry" });
  });
});
