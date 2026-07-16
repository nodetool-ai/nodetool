import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
  ImageToImageParams,
  ProviderStreamItem,
  TextToImageParams,
  TextToVideoParams,
  TextToMusicParams
} from "../../src/providers/types.js";

/**
 * Hoisted mock hooks. The chat routing branches of KieProvider delegate to the
 * real OpenAI/Anthropic provider implementations (openai + anthropic chat
 * models) or construct a raw OpenAI client (responses models). We replace both
 * with fakes so routing can be asserted without any network I/O.
 */
const h = vi.hoisted(() => {
  const openaiGenMsg = vi.fn(async () => ({
    role: "assistant" as const,
    content: "openai-reply"
  }));
  async function* oaStream(): AsyncGenerator<ProviderStreamItem> {
    yield { type: "chunk", content: "oa", done: true };
  }
  const openaiGenMsgs = vi.fn(() => oaStream());

  const anthropicGenMsg = vi.fn(async () => ({
    role: "assistant" as const,
    content: "anthropic-reply"
  }));
  async function* anStream(): AsyncGenerator<ProviderStreamItem> {
    yield { type: "chunk", content: "an", done: true };
  }
  const anthropicGenMsgs = vi.fn(() => anStream());

  const responsesCreate = vi.fn();
  return {
    openaiGenMsg,
    openaiGenMsgs,
    anthropicGenMsg,
    anthropicGenMsgs,
    responsesCreate
  };
});

vi.mock("../../src/providers/openai-provider.js", () => ({
  OpenAIProvider: class {
    provider = "openai";
    generateMessage = h.openaiGenMsg;
    generateMessages = h.openaiGenMsgs;
  }
}));

vi.mock("../../src/providers/anthropic-provider.js", () => ({
  AnthropicProvider: class {
    provider = "anthropic";
    generateMessage = h.anthropicGenMsg;
    generateMessages = h.anthropicGenMsgs;
  }
}));

vi.mock("openai", () => ({
  default: class {
    responses = { create: h.responsesCreate };
  }
}));

// Imported after the mocks are registered.
const { KieProvider } = await import("../../src/providers/kie-provider.js");

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as unknown as Response;
}

interface FlowOptions {
  uploadUrls?: string[];
  uploadOk?: boolean;
  uploadSuccess?: boolean;
  uploadNoDownloadUrl?: boolean;
  createTaskOk?: boolean;
  noTaskId?: boolean;
  state?: string;
  failMsg?: string;
  noResultJson?: boolean;
  emptyResultUrls?: boolean;
  downloadOk?: boolean;
  downloadBytes?: Uint8Array;
}

/**
 * Routes the KIE HTTP flow (upload → createTask → recordInfo → download) to
 * canned responses keyed by URL, with per-branch failure toggles for the error
 * paths. Captures createTask request bodies.
 */
function mockKieFlow(opts: FlowOptions = {}) {
  const createdInputs: Array<Record<string, unknown>> = [];
  const createdBodies: Array<Record<string, unknown>> = [];
  let uploadIdx = 0;
  const uploadUrls = opts.uploadUrls ?? ["https://kie.cdn/a.png"];
  const downloadBytes = opts.downloadBytes ?? new Uint8Array([7, 7, 7]);
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("file-stream-upload")) {
      if (opts.uploadNoDownloadUrl) {
        return jsonResponse({ success: true, data: {} });
      }
      const downloadUrl = uploadUrls[uploadIdx++];
      return jsonResponse(
        { success: opts.uploadSuccess ?? true, data: { downloadUrl } },
        opts.uploadOk ?? true,
        opts.uploadOk === false ? 500 : 200
      );
    }
    if (u.includes("/jobs/createTask")) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      createdBodies.push(body);
      createdInputs.push(body.input as Record<string, unknown>);
      if (opts.noTaskId) {
        return jsonResponse({ data: {} }, opts.createTaskOk ?? true);
      }
      return jsonResponse(
        { data: { taskId: "task-1" } },
        opts.createTaskOk ?? true,
        opts.createTaskOk === false ? 400 : 200
      );
    }
    if (u.includes("/jobs/recordInfo")) {
      const data: Record<string, unknown> = { state: opts.state ?? "success" };
      if (opts.failMsg) data.failMsg = opts.failMsg;
      if (!opts.noResultJson) {
        data.resultJson = JSON.stringify({
          resultUrls: opts.emptyResultUrls
            ? []
            : ["https://kie.result/out.png"]
        });
      }
      return jsonResponse({ data });
    }
    // Final asset download via safeFetch → global fetch.
    return {
      ok: opts.downloadOk ?? true,
      headers: new Headers(),
      arrayBuffer: async () => downloadBytes.buffer
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, createdInputs, createdBodies };
}

function makeAsyncIterable(
  items: Array<Record<string, unknown>>
): AsyncIterable<Record<string, unknown>> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) yield item;
    }
  };
}

async function collect(
  gen: AsyncGenerator<ProviderStreamItem>
): Promise<ProviderStreamItem[]> {
  const out: ProviderStreamItem[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("KieProvider — metadata", () => {
  it("requiredSecrets lists KIE_API_KEY", () => {
    expect(KieProvider.requiredSecrets()).toEqual(["KIE_API_KEY"]);
  });

  it("getContainerEnv passes the api key through", () => {
    const p = new KieProvider({ KIE_API_KEY: "secret" });
    expect(p.getContainerEnv()).toEqual({ KIE_API_KEY: "secret" });
  });

  it("defaults the api key to an empty string when unset", () => {
    const p = new KieProvider();
    expect(p.getContainerEnv()).toEqual({ KIE_API_KEY: "" });
  });

  it("lists all chat models as kie language models", async () => {
    const p = new KieProvider({ KIE_API_KEY: "k" });
    const models = await p.getAvailableLanguageModels();
    expect(models.length).toBe(6);
    expect(models.every((m) => m.provider === "kie")).toBe(true);
    expect(models.map((m) => m.id)).toContain("gpt-5-5");
    expect(models.map((m) => m.id)).toContain("claude-opus-4-6");
  });

  it("reports tool support only for known chat models", async () => {
    const p = new KieProvider({ KIE_API_KEY: "k" });
    await expect(p.hasToolSupport("gemini-3-flash")).resolves.toBe(true);
    await expect(p.hasToolSupport("no-such-model")).resolves.toBe(false);
  });
});

describe("KieProvider — media model discovery", () => {
  it("loads video, image, and music models from the manifest", async () => {
    const p = new KieProvider({ KIE_API_KEY: "k" });
    const [videos, images, music] = await Promise.all([
      p.getAvailableVideoModels(),
      p.getAvailableImageModels(),
      p.getAvailableMusicModels()
    ]);
    expect(videos.length).toBeGreaterThan(0);
    expect(images.length).toBeGreaterThan(0);
    expect(music.length).toBeGreaterThan(0);
    expect(videos.every((m) => m.provider === "kie")).toBe(true);
    expect(images.every((m) => m.provider === "kie")).toBe(true);
  });
});

describe("KieProvider — chat routing", () => {
  it("routes an openai chat model through the OpenAI provider", async () => {
    const p = new KieProvider({ KIE_API_KEY: "k" });
    const msg = await p.generateMessage({
      model: "gemini-3-flash",
      messages: [{ role: "user", content: "hi" }]
    });
    expect(h.openaiGenMsg).toHaveBeenCalledTimes(1);
    expect(msg.content).toBe("openai-reply");
  });

  it("routes an anthropic chat model through the Anthropic provider", async () => {
    const p = new KieProvider({ KIE_API_KEY: "k" });
    const msg = await p.generateMessage({
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "hi" }]
    });
    expect(h.anthropicGenMsg).toHaveBeenCalledTimes(1);
    expect(msg.content).toBe("anthropic-reply");
  });

  it("streams an openai chat model through the OpenAI provider", async () => {
    const p = new KieProvider({ KIE_API_KEY: "k" });
    const items = await collect(
      p.generateMessages({
        model: "gemini-3.1-pro",
        messages: [{ role: "user", content: "hi" }]
      })
    );
    expect(h.openaiGenMsgs).toHaveBeenCalledTimes(1);
    expect(items).toEqual([{ type: "chunk", content: "oa", done: true }]);
  });

  it("streams an anthropic chat model through the Anthropic provider", async () => {
    const p = new KieProvider({ KIE_API_KEY: "k" });
    const items = await collect(
      p.generateMessages({
        model: "claude-haiku-4-5",
        messages: [{ role: "user", content: "hi" }]
      })
    );
    expect(h.anthropicGenMsgs).toHaveBeenCalledTimes(1);
    expect(items).toEqual([{ type: "chunk", content: "an", done: true }]);
  });

  it("throws for an unknown chat model (generateMessage)", async () => {
    const p = new KieProvider({ KIE_API_KEY: "k" });
    await expect(
      p.generateMessage({
        model: "totally-unknown",
        messages: [{ role: "user", content: "hi" }]
      })
    ).rejects.toThrow("Kie does not support chat model: totally-unknown");
  });

  it("throws for an unknown chat model (generateMessages)", async () => {
    const p = new KieProvider({ KIE_API_KEY: "k" });
    await expect(
      collect(
        p.generateMessages({
          model: "totally-unknown",
          messages: [{ role: "user", content: "hi" }]
        })
      )
    ).rejects.toThrow("Kie does not support chat model: totally-unknown");
  });
});

describe("KieProvider — responses chat models", () => {
  it("generates a non-streaming responses message with tool calls", async () => {
    h.responsesCreate.mockResolvedValueOnce({
      output_text: "resp-answer",
      output: [
        {
          type: "function_call",
          call_id: "call_1",
          name: "lookup",
          arguments: '{"q":"x"}'
        }
      ],
      usage: { input_tokens: 5, output_tokens: 2 }
    });
    const p = new KieProvider({ KIE_API_KEY: "k" });
    const msg = await p.generateMessage({
      model: "gpt-5-5",
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 100,
      temperature: 0.5,
      topP: 0.9,
      tools: [{ name: "lookup" }],
      toolChoice: "lookup"
    });

    expect(h.responsesCreate).toHaveBeenCalledTimes(1);
    const [body] = h.responsesCreate.mock.calls[0];
    expect(body).toMatchObject({
      model: "gpt-5-5",
      stream: false,
      max_output_tokens: 100,
      temperature: 0.5,
      top_p: 0.9
    });
    expect(body.tools).toHaveLength(1);
    expect(msg.content).toBe("resp-answer");
    expect(msg.toolCalls).toEqual([
      { id: "call_1", name: "lookup", args: { q: "x" } }
    ]);
  });

  it("falls back to extracting output text when output_text is absent", async () => {
    h.responsesCreate.mockResolvedValueOnce({
      output: [
        { type: "message", content: [{ type: "output_text", text: "pieced" }] }
      ]
    });
    const p = new KieProvider({ KIE_API_KEY: "k" });
    const msg = await p.generateMessage({
      model: "gpt-5-5",
      messages: [{ role: "user", content: "hi" }]
    });
    expect(msg.content).toBe("pieced");
    expect(msg.toolCalls).toBeUndefined();
  });

  it("streams a responses message", async () => {
    h.responsesCreate.mockResolvedValueOnce(
      makeAsyncIterable([
        { type: "response.created", response: { id: "r1" } },
        { type: "response.output_text.delta", delta: "streamed" },
        { type: "response.completed", response: { id: "r1" } }
      ])
    );
    const p = new KieProvider({ KIE_API_KEY: "k" });
    const items = await collect(
      p.generateMessages({
        model: "gpt-5-5",
        messages: [{ role: "user", content: "hi" }],
        maxTokens: 50
      })
    );
    const [body] = h.responsesCreate.mock.calls[0];
    expect(body).toMatchObject({ stream: true, max_output_tokens: 50 });
    expect(items).toEqual([
      { type: "chunk", content: "streamed", done: false },
      { type: "chunk", content: "", done: true }
    ]);
  });
});

describe("KieProvider — requireApiKey", () => {
  it("throws when the api key is missing", async () => {
    const p = new KieProvider({ KIE_API_KEY: "  " });
    await expect(
      p.textToImage({
        prompt: "x",
        model: { id: "m", name: "m", provider: "kie" }
      })
    ).rejects.toThrow("KIE_API_KEY is not configured");
  });
});

describe("KieProvider — textToImage", () => {
  it("sends only declared fields and derives aspect ratio from width/height", async () => {
    const { createdInputs } = mockKieFlow();
    const p = new KieProvider({ KIE_API_KEY: "k" });
    // google/imagen4 declares prompt, negative_prompt, aspect_ratio, seed.
    const params: TextToImageParams = {
      prompt: "a fox",
      width: 1920,
      height: 1080,
      negativePrompt: "blurry",
      seed: 42,
      model: { id: "google/imagen4", name: "Imagen 4", provider: "kie" }
    };
    const bytes = await p.textToImage(params);
    expect(bytes).toEqual(new Uint8Array([7, 7, 7]));
    expect(createdInputs[0]).toMatchObject({
      prompt: "a fox",
      negative_prompt: "blurry",
      seed: 42,
      // 1920:1080 = 16:9, the nearest declared enum ratio.
      aspect_ratio: "16:9"
    });
    expect(createdInputs[0].width).toBeUndefined();
    expect(createdInputs[0].height).toBeUndefined();
  });

  it("passes a declared aspect ratio through and never sends width/height", async () => {
    const { createdInputs } = mockKieFlow();
    const p = new KieProvider({ KIE_API_KEY: "k" });
    await p.textToImage({
      prompt: "a fox",
      aspectRatio: "3:4",
      width: 100,
      height: 100,
      model: { id: "google/imagen4", name: "Imagen 4", provider: "kie" }
    });
    expect(createdInputs[0].aspect_ratio).toBe("3:4");
    expect(createdInputs[0].width).toBeUndefined();
    expect(createdInputs[0].height).toBeUndefined();
  });

  it("sends only the prompt for an unknown model", async () => {
    const { createdInputs } = mockKieFlow();
    const p = new KieProvider({ KIE_API_KEY: "k" });
    await p.textToImage({
      prompt: "x",
      width: 512,
      height: 512,
      negativePrompt: "no",
      model: { id: "flux/schnell", name: "Flux", provider: "kie" }
    });
    expect(createdInputs[0]).toEqual({ prompt: "x" });
  });

  it("throws when the prompt is missing", async () => {
    mockKieFlow();
    const p = new KieProvider({ KIE_API_KEY: "k" });
    await expect(
      p.textToImage({
        prompt: "",
        model: { id: "google/imagen4", name: "Imagen 4", provider: "kie" }
      })
    ).rejects.toThrow("Prompt is required");
  });
});

describe("KieProvider — textToVideo", () => {
  it("maps aspect ratio and derives duration from num frames", async () => {
    const { createdInputs } = mockKieFlow();
    const p = new KieProvider({ KIE_API_KEY: "k" });
    const params: TextToVideoParams = {
      prompt: "a wave",
      aspectRatio: "16:9",
      numFrames: 48,
      model: { id: "veo/fast", name: "Veo", provider: "kie" }
    };
    const bytes = await p.textToVideo(params);
    expect(bytes).toEqual(new Uint8Array([7, 7, 7]));
    expect(createdInputs[0]).toMatchObject({
      prompt: "a wave",
      aspect_ratio: "16:9",
      duration: 2
    });
  });

  it("throws when the prompt is missing", async () => {
    mockKieFlow();
    const p = new KieProvider({ KIE_API_KEY: "k" });
    await expect(
      p.textToVideo({
        prompt: "",
        model: { id: "veo/fast", name: "Veo", provider: "kie" }
      })
    ).rejects.toThrow("Prompt is required");
  });
});

interface SunoFlowOptions {
  status?: string;
  audioBytes?: Uint8Array;
}

/**
 * Routes the Suno music flow (submit → generate/record-info → audio download).
 * generate-music/generate-sounds submit to `/api/v1/generate[/sounds]` and poll
 * `/api/v1/generate/record-info`; the submit path is a prefix of the poll path,
 * so match record-info first. Captures the submit URL + body.
 */
function mockSunoFlow(opts: SunoFlowOptions = {}) {
  const submitted: Array<Record<string, unknown>> = [];
  const submitUrls: string[] = [];
  const audio = opts.audioBytes ?? new Uint8Array([0xff, 0xfb, 0x90, 0x00]);
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/generate/record-info")) {
      return jsonResponse({
        data: {
          status: opts.status ?? "SUCCESS",
          response: { sunoData: [{ audioUrl: "https://kie.suno/out.mp3" }] }
        }
      });
    }
    if (u.includes("/api/v1/generate")) {
      submitUrls.push(u);
      submitted.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return jsonResponse({ data: { taskId: "suno-1" } });
    }
    return {
      ok: true,
      headers: new Headers(),
      arrayBuffer: async () => audio.buffer
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, submitted, submitUrls };
}

describe("KieProvider — textToMusic (Suno)", () => {
  it("submits non-custom mode with the prompt and a filled model default", async () => {
    const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);
    const { submitted, submitUrls } = mockSunoFlow({ audioBytes: mp3 });
    const p = new KieProvider({ KIE_API_KEY: "k" });
    const params: TextToMusicParams = {
      prompt: "a calm piano tune",
      model: { id: "generate-music", name: "Generate Music", provider: "kie" }
    };
    const result = await p.textToMusic(params);
    expect(result.mimeType).toBe("audio/mpeg");
    expect(result.data).toEqual(mp3);
    // Suno submit, not the generic jobs createTask endpoint.
    expect(submitUrls[0]).toContain("/api/v1/generate");
    expect(submitUrls[0]).not.toContain("/jobs/createTask");
    expect(submitted[0]).toMatchObject({
      prompt: "a calm piano tune",
      customMode: false,
      instrumental: false,
      model: "V4",
      callBackUrl: "https://nodetool.ai/kie-callback"
    });
  });

  it("uses custom mode when lyrics are supplied", async () => {
    const { submitted } = mockSunoFlow();
    const p = new KieProvider({ KIE_API_KEY: "k" });
    await p.textToMusic({
      prompt: "jazzy, upbeat",
      lyrics: "la la la",
      model: { id: "generate-music", name: "Generate Music", provider: "kie" }
    });
    expect(submitted[0]).toMatchObject({
      customMode: true,
      prompt: "la la la",
      style: "jazzy, upbeat",
      instrumental: false,
      model: "V4"
    });
  });

  it("routes generate-sounds to its own Suno endpoint", async () => {
    const { submitted, submitUrls } = mockSunoFlow();
    const p = new KieProvider({ KIE_API_KEY: "k" });
    await p.textToMusic({
      prompt: "rain on a window",
      model: { id: "generate-sounds", name: "Generate Sounds", provider: "kie" }
    });
    expect(submitUrls[0]).toContain("/api/v1/generate/sounds");
    expect(submitted[0]).toMatchObject({
      prompt: "rain on a window",
      model: "V5"
    });
  });

  it("fails fast on a terminal failure status", async () => {
    mockSunoFlow({ status: "SENSITIVE_WORD_ERROR" });
    const p = new KieProvider({ KIE_API_KEY: "k" });
    await expect(
      p.textToMusic({
        prompt: "x",
        model: { id: "generate-music", name: "Generate Music", provider: "kie" }
      })
    ).rejects.toThrow("SENSITIVE_WORD_ERROR");
  });

  it("throws when the prompt is missing", async () => {
    mockSunoFlow();
    const p = new KieProvider({ KIE_API_KEY: "k" });
    await expect(
      p.textToMusic({
        prompt: "",
        model: { id: "generate-music", name: "Generate Music", provider: "kie" }
      })
    ).rejects.toThrow("Prompt is required");
  });
});

describe("KieProvider — HTTP-200 error envelope", () => {
  const imageModel = {
    id: "flux/schnell",
    name: "Flux",
    provider: "kie" as const
  };

  it("surfaces a code envelope returned by createTask", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/jobs/createTask")) {
        return jsonResponse({ code: 402, msg: "no credits" });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
    const p = new KieProvider({ KIE_API_KEY: "k" });
    await expect(
      p.textToImage({ prompt: "x", model: imageModel })
    ).rejects.toThrow("Insufficient Credits");
  });

  it("fails fast on a code envelope returned while polling", async () => {
    let recordCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/jobs/createTask")) {
        return jsonResponse({ data: { taskId: "t" } });
      }
      if (u.includes("/jobs/recordInfo")) {
        recordCalls += 1;
        return jsonResponse({ code: 500, msg: "boom" });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
    const p = new KieProvider({ KIE_API_KEY: "k" });
    await expect(
      p.textToImage({ prompt: "x", model: imageModel })
    ).rejects.toThrow("Server Error");
    // One poll, then immediate failure — not a full-timeout hang.
    expect(recordCalls).toBe(1);
  });
});

describe("KieProvider — timeoutSeconds bounds poll attempts", () => {
  it("derives max attempts from timeoutSeconds and the model poll interval", async () => {
    vi.useFakeTimers();
    let recordCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/jobs/createTask")) {
        return jsonResponse({ data: { taskId: "t" } });
      }
      if (u.includes("/jobs/recordInfo")) {
        recordCalls += 1;
        return jsonResponse({ data: { state: "processing" } });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
    const p = new KieProvider({ KIE_API_KEY: "k" });
    // kling declares pollInterval 8000ms → ceil(20000 / 8000) = 3 attempts.
    const promise = p.textToVideo({
      prompt: "x",
      timeoutSeconds: 20,
      model: {
        id: "kling/v2-1-master-image-to-video",
        name: "Kling",
        provider: "kie"
      }
    });
    const assertion = expect(promise).rejects.toThrow("timed out");
    await vi.runAllTimersAsync();
    await assertion;
    expect(recordCalls).toBe(3);
    vi.useRealTimers();
  });
});

describe("KieProvider — textToSpeechEncoded", () => {
  it("throws when the text is empty", async () => {
    mockKieFlow();
    const p = new KieProvider({ KIE_API_KEY: "k" });
    await expect(
      p.textToSpeechEncoded({ text: "", model: "tts/x" })
    ).rejects.toThrow("text must not be empty");
  });

  it("passes speed through to the task input", async () => {
    const { createdInputs } = mockKieFlow({
      downloadBytes: new Uint8Array([0xff, 0xfb, 0x90, 0x00])
    });
    const p = new KieProvider({ KIE_API_KEY: "k" });
    await p.textToSpeechEncoded({
      text: "hello",
      model: "tts/x",
      speed: 1.25
    });
    expect(createdInputs[0]).toMatchObject({ text: "hello", speed: 1.25 });
  });
});

describe("KieProvider — job flow error branches", () => {
  const imageParams: TextToImageParams = {
    prompt: "x",
    model: { id: "flux/schnell", name: "Flux", provider: "kie" }
  };

  it("throws when createTask returns a non-ok status", async () => {
    mockKieFlow({ createTaskOk: false });
    const p = new KieProvider({ KIE_API_KEY: "k" });
    await expect(p.textToImage(imageParams)).rejects.toThrow(
      "Kie submit failed: 400"
    );
  });

  it("throws when createTask omits a taskId", async () => {
    mockKieFlow({ noTaskId: true });
    const p = new KieProvider({ KIE_API_KEY: "k" });
    await expect(p.textToImage(imageParams)).rejects.toThrow(
      "No taskId in Kie response"
    );
  });

  it("throws with the fail message when the task fails", async () => {
    mockKieFlow({ state: "failed", failMsg: "boom" });
    const p = new KieProvider({ KIE_API_KEY: "k" });
    await expect(p.textToImage(imageParams)).rejects.toThrow(
      "Kie task failed: boom"
    );
  });

  it("throws when the record has no resultJson", async () => {
    mockKieFlow({ noResultJson: true });
    const p = new KieProvider({ KIE_API_KEY: "k" });
    await expect(p.textToImage(imageParams)).rejects.toThrow(
      "No resultJson in Kie response"
    );
  });

  it("throws when resultJson carries no result urls", async () => {
    mockKieFlow({ emptyResultUrls: true });
    const p = new KieProvider({ KIE_API_KEY: "k" });
    await expect(p.textToImage(imageParams)).rejects.toThrow(
      "No resultUrls in Kie resultJson"
    );
  });

  it("throws when the result download fails", async () => {
    mockKieFlow({ downloadOk: false });
    const p = new KieProvider({ KIE_API_KEY: "k" });
    await expect(p.textToImage(imageParams)).rejects.toThrow(
      "Failed to download from"
    );
  });
});

describe("KieProvider — upload error branches", () => {
  const i2iParams: ImageToImageParams = {
    prompt: "edit",
    model: { id: "flux/schnell", name: "Flux", provider: "kie" }
  };

  it("throws when the upload responds with success:false", async () => {
    mockKieFlow({ uploadSuccess: false });
    const p = new KieProvider({ KIE_API_KEY: "k" });
    await expect(
      p.imageToImage([new Uint8Array([1, 2])], i2iParams)
    ).rejects.toThrow("Kie upload failed");
  });

  it("throws when the upload response omits a downloadUrl", async () => {
    mockKieFlow({ uploadNoDownloadUrl: true });
    const p = new KieProvider({ KIE_API_KEY: "k" });
    await expect(
      p.imageToImage([new Uint8Array([1, 2])], i2iParams)
    ).rejects.toThrow("No downloadUrl in Kie upload response");
  });
});
