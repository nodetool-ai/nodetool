import { describe, it, expect, vi } from "vitest";
import {
  SarvamProvider,
  normalizeSarvamLanguage,
  SARVAM_ASR_LANGUAGES,
  SARVAM_TTS_LANGUAGES
} from "../../src/providers/sarvam-provider.js";
import type { Message } from "../../src/providers/types.js";
import {
  chatJsonResponse,
  chatSSEResponse,
  mockChatFetch,
  requestBodyOf
} from "./helpers/compat-fetch.js";

const KEY = "sk-sarvam-test";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function makeProvider(fetchFn: typeof fetch): SarvamProvider {
  return new SarvamProvider({ SARVAM_API_KEY: KEY }, { fetchFn });
}

function headersOf(fetchMock: ReturnType<typeof vi.fn>, index = 0) {
  const init = fetchMock.mock.calls[index]?.[1] as RequestInit | undefined;
  return new Headers(init?.headers);
}

// Documented TTS example response (base64 of a 44-byte empty WAV).
const WAV_B64 = "UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";

describe("SarvamProvider basics", () => {
  it("reports secrets, env, id, and capabilities", () => {
    const provider = new SarvamProvider({ SARVAM_API_KEY: KEY });
    expect(SarvamProvider.requiredSecrets()).toEqual(["SARVAM_API_KEY"]);
    expect(provider.getContainerEnv()).toEqual({ SARVAM_API_KEY: KEY });
    expect(provider.provider).toBe("sarvam");
    expect(provider.getCapabilities()).toEqual(
      expect.arrayContaining([
        "generate_message",
        "text_to_speech",
        "automatic_speech_recognition"
      ])
    );
    expect(provider.getCapabilities()).not.toContain("text_to_image");
  });

  it("throws when SARVAM_API_KEY is missing or blank", () => {
    expect(() => new SarvamProvider({})).toThrow(
      "SARVAM_API_KEY is not configured"
    );
    expect(() => new SarvamProvider({ SARVAM_API_KEY: "  " })).toThrow(
      "SARVAM_API_KEY is not configured"
    );
  });

  it("offers no OpenAI image, embedding, or video models", async () => {
    const provider = makeProvider(vi.fn() as unknown as typeof fetch);
    expect(await provider.getAvailableImageModels()).toEqual([]);
    expect(await provider.getAvailableEmbeddingModels()).toEqual([]);
  });
});

describe("SarvamProvider chat", () => {
  it("lists models from GET /v2/models with the subscription-key header", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: [
          { id: "glm5.3", created: 0, owned_by: "sarvam", object: "model", access: "standard" },
          { id: "sarvam-105b", created: 0, owned_by: "sarvam", object: "model" }
        ],
        object: "list"
      })
    );
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    const models = await provider.getAvailableLanguageModels();

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.sarvam.ai/v2/models");
    const headers = headersOf(fetchMock);
    expect(headers.get("api-subscription-key")).toBe(KEY);
    expect(headers.get("authorization")).toBe(`Bearer ${KEY}`);
    expect(models).toEqual([
      { id: "glm5.3", name: "glm5.3", provider: "sarvam" },
      { id: "sarvam-105b", name: "sarvam-105b", provider: "sarvam" }
    ]);
  });

  it("answers [] when the model listing fails", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: { message: "bad key", code: "invalid_api_key_error" } }, 403)
    );
    const provider = makeProvider(fetchMock as unknown as typeof fetch);
    expect(await provider.getAvailableLanguageModels()).toEqual([]);
  });

  it("posts chat to /v2/chat/completions with max_tokens and both auth headers", async () => {
    const fetchMock = mockChatFetch(
      chatJsonResponse({
        id: "chatcmpl-1",
        object: "chat.completion",
        created: 0,
        model: "sarvam-105b",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: { role: "assistant", content: "Namaste", reasoning_content: "greet" }
          }
        ],
        usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 }
      })
    );
    const provider = makeProvider(fetchMock);
    const messages: Message[] = [{ role: "user", content: "Say hi" }];

    const result = await provider.generateMessage({
      messages,
      model: "sarvam-105b",
      maxTokens: 512
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.sarvam.ai/v2/chat/completions"
    );
    const headers = headersOf(fetchMock as unknown as ReturnType<typeof vi.fn>);
    expect(headers.get("api-subscription-key")).toBe(KEY);
    expect(headers.get("authorization")).toBe(`Bearer ${KEY}`);
    const body = requestBodyOf(fetchMock);
    expect(body.model).toBe("sarvam-105b");
    expect(body.max_tokens).toBe(512);
    expect(body).not.toHaveProperty("max_completion_tokens");
    expect(result.content).toBe("Namaste");
  });

  it("streams chat chunks and ends with one done chunk", async () => {
    const fetchMock = mockChatFetch(
      chatSSEResponse([
        { id: "c", object: "chat.completion.chunk", created: 0, model: "glm5.3", choices: [{ index: 0, delta: { content: "Hel" }, finish_reason: null }] },
        { id: "c", object: "chat.completion.chunk", created: 0, model: "glm5.3", choices: [{ index: 0, delta: { content: "lo" }, finish_reason: "stop" }] },
        { id: "c", object: "chat.completion.chunk", created: 0, model: "glm5.3", choices: [], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } }
      ])
    );
    const provider = makeProvider(fetchMock);

    const items: Array<Record<string, unknown>> = [];
    for await (const item of provider.generateMessages({
      messages: [{ role: "user", content: "hi" }],
      model: "glm5.3"
    })) {
      items.push(item as unknown as Record<string, unknown>);
    }

    const text = items
      .filter((i) => i.type === "chunk" && i.content_type !== "thinking")
      .map((i) => i.content)
      .join("");
    expect(text).toBe("Hello");
    expect(items.filter((i) => i.done === true)).toHaveLength(1);
    const body = requestBodyOf(fetchMock);
    expect(body.stream).toBe(true);
    expect(body.max_tokens).toBe(16384);
  });
});

describe("SarvamProvider text-to-speech", () => {
  it("lists Bulbul models with default speaker first and language selection", async () => {
    const provider = makeProvider(vi.fn() as unknown as typeof fetch);
    const models = await provider.getAvailableTTSModels();

    expect(models.map((m) => m.id)).toEqual([
      "bulbul:v4-flash",
      "bulbul:v3",
      "bulbul:v2"
    ]);
    const [v4, v3, v2] = models;
    expect(v4.voices?.[0]).toBe("shubh_enhi_ads");
    expect(v4.voices).toContain("ritu_hi_kids");
    expect(v4.voices?.length).toBe(222);
    expect(new Set(v4.voices).size).toBe(v4.voices?.length);
    expect(v3.voices?.[0]).toBe("shubh");
    expect(v3.voices).toHaveLength(37);
    expect(v2.voices).toEqual([
      "anushka", "manisha", "vidya", "arya", "abhilash", "karun", "hitesh"
    ]);
    for (const m of models) {
      expect(m.provider).toBe("sarvam");
      expect(m.languages).toEqual([...SARVAM_TTS_LANGUAGES]);
      expect(m.capabilities).toContain("language_selection");
    }
  });

  it("uses the encoded path only", () => {
    const provider = makeProvider(vi.fn() as unknown as typeof fetch);
    expect(provider.supportsStreamingTextToSpeech()).toBe(false);
  });

  it("posts the documented body and decodes the base64 WAV", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ request_id: "20250101_abc", audios: [WAV_B64] })
    );
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    const result = await provider.textToSpeechEncoded({
      text: "Welcome to Sarvam AI!",
      model: "bulbul:v3",
      voice: "Priya",
      language: "hi-IN",
      speed: 1.5
    });

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.sarvam.ai/text-to-speech");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("api-subscription-key")).toBe(KEY);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("authorization")).toBeNull();
    expect(JSON.parse(String(init.body))).toEqual({
      text: "Welcome to Sarvam AI!",
      language_code: "hi-IN",
      model: "bulbul:v3",
      output_audio_codec: "wav",
      speaker: "priya",
      pace: 1.5
    });
    expect(result.mimeType).toBe("audio/wav");
    expect(Buffer.from(result.data).toString("base64")).toBe(WAV_B64);
    expect(String.fromCharCode(...result.data.slice(0, 4))).toBe("RIFF");
  });

  it("requests mp3 when asked and labels it audio/mpeg", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ request_id: null, audios: ["SUQz"] }));
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    const result = await provider.textToSpeechEncoded({
      text: "hello",
      model: "bulbul:v4-flash",
      audioFormat: "mp3"
    });

    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.output_audio_codec).toBe("mp3");
    expect(body).not.toHaveProperty("speaker");
    expect(body).not.toHaveProperty("pace");
    expect(result.mimeType).toBe("audio/mpeg");
  });

  it("falls back to wav for a codec it does not request (opus fails on v3)", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ audios: [WAV_B64] }));
    const provider = makeProvider(fetchMock as unknown as typeof fetch);
    const result = await provider.textToSpeechEncoded({
      text: "hello",
      model: "bulbul:v3",
      audioFormat: "opus"
    });
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.output_audio_codec).toBe("wav");
    expect(result.mimeType).toBe("audio/wav");
  });

  it("clamps pace to the model's documented range", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ audios: [WAV_B64] }));
    const provider = makeProvider(fetchMock as unknown as typeof fetch);
    await provider.textToSpeechEncoded({ text: "a", model: "bulbul:v3", speed: 3 });
    await provider.textToSpeechEncoded({ text: "a", model: "bulbul:v2", speed: 3 });
    await provider.textToSpeechEncoded({ text: "a", model: "bulbul:v2", speed: 0.1 });
    const paces = fetchMock.mock.calls.map(
      (c) => JSON.parse(String((c[1] as RequestInit).body)).pace
    );
    expect(paces).toEqual([2.0, 3.0, 0.3]);
  });

  it("infers language_code from script, then speaker, then en-IN", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ audios: [WAV_B64] }));
    const provider = makeProvider(fetchMock as unknown as typeof fetch);
    await provider.textToSpeechEncoded({ text: "नमस्ते", model: "bulbul:v3" });
    await provider.textToSpeechEncoded({ text: "வணக்கம்", model: "bulbul:v3" });
    await provider.textToSpeechEncoded({
      text: "namaste",
      model: "bulbul:v4-flash",
      voice: "chaitra_kn_narration"
    });
    await provider.textToSpeechEncoded({
      text: "hello",
      model: "bulbul:v4-flash",
      voice: "shubh_enhi_ads"
    });
    const codes = fetchMock.mock.calls.map(
      (c) => JSON.parse(String((c[1] as RequestInit).body)).language_code
    );
    expect(codes).toEqual(["hi-IN", "ta-IN", "kn-IN", "en-IN"]);
  });

  it("normalizes a bare language and rejects one Bulbul lacks", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ audios: [WAV_B64] }));
    const provider = makeProvider(fetchMock as unknown as typeof fetch);
    await provider.textToSpeechEncoded({ text: "a", model: "bulbul:v3", language: "or" });
    expect(
      JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)).language_code
    ).toBe("od-IN");

    await expect(
      provider.textToSpeechEncoded({ text: "a", model: "bulbul:v3", language: "fr" })
    ).rejects.toThrow('Sarvam TTS does not support language "fr"');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces the documented error body", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        {
          error: {
            request_id: "r1",
            message: "Speaker not compatible with model",
            code: "invalid_request_error"
          }
        },
        400
      )
    );
    const provider = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(
      provider.textToSpeechEncoded({ text: "a", model: "bulbul:v2", voice: "shubh" })
    ).rejects.toThrow(
      "Sarvam text-to-speech failed: 400 invalid_request_error: Speaker not compatible with model"
    );
  });

  it("throws when the response holds no audio", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ request_id: "r", audios: [] }));
    const provider = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(
      provider.textToSpeechEncoded({ text: "a", model: "bulbul:v3" })
    ).rejects.toThrow("Sarvam text-to-speech returned no audio");
  });

  it("rejects empty text without a request", async () => {
    const fetchMock = vi.fn();
    const provider = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(
      provider.textToSpeechEncoded({ text: "", model: "bulbul:v3" })
    ).rejects.toThrow("text must not be empty");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("SarvamProvider speech-to-text", () => {
  const wavBytes = new Uint8Array(Buffer.from(WAV_B64, "base64"));

  it("lists Saaras models", async () => {
    const provider = makeProvider(vi.fn() as unknown as typeof fetch);
    expect(await provider.getAvailableASRModels()).toEqual([
      { id: "saaras:v4", name: "Saaras v4", provider: "sarvam" },
      { id: "saaras:v3", name: "Saaras v3", provider: "sarvam" }
    ]);
  });

  it("posts multipart form data and reads the transcript", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        request_id: "20250101_abc",
        transcript: "नमस्ते, आप कैसे हैं?",
        language_code: "hi-IN"
      })
    );
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    const result = await provider.automaticSpeechRecognition({
      audio: wavBytes,
      model: "saaras:v4",
      language: "hi"
    });

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.sarvam.ai/speech-to-text");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("api-subscription-key")).toBe(KEY);
    // fetch sets the multipart boundary itself.
    expect(headers.get("content-type")).toBeNull();
    const form = init.body as FormData;
    const file = form.get("file") as File;
    expect(file.name).toBe("audio.wav");
    expect(file.type).toBe("audio/wav");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(wavBytes);
    expect(form.get("model")).toBe("saaras:v4");
    expect(form.get("language_code")).toBe("hi-IN");
    expect(form.has("with_timestamps")).toBe(false);
    expect(result).toEqual({ text: "नमस्ते, आप कैसे हैं?" });
  });

  it("omits language_code to auto-detect and maps timestamps to chunks", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        request_id: "r",
        transcript: "Hello there. How are you?",
        language_code: "en-IN",
        language_probability: 0.93,
        timestamps: {
          words: ["Hello there.", "How are you?"],
          start_time_seconds: [0.0, 1.2],
          end_time_seconds: [1.1, 2.5]
        }
      })
    );
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    const result = await provider.automaticSpeechRecognition({
      audio: new Uint8Array([0x49, 0x44, 0x33, 0x04, 0, 0]),
      model: "saaras:v3",
      language: "fr",
      word_timestamps: true
    });

    const form = (fetchMock.mock.calls[0][1] as RequestInit).body as FormData;
    expect(form.has("language_code")).toBe(false);
    expect(form.get("with_timestamps")).toBe("true");
    expect((form.get("file") as File).name).toBe("audio.mp3");
    expect(result).toEqual({
      text: "Hello there. How are you?",
      chunks: [
        { text: "Hello there.", timestamp: [0.0, 1.1] },
        { text: "How are you?", timestamp: [1.2, 2.5] }
      ]
    });
  });

  it("surfaces a 503 overload error", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        { error: { request_id: "r", message: "Service overloaded", code: "internal_server_error" } },
        503
      )
    );
    const provider = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(
      provider.automaticSpeechRecognition({ audio: wavBytes, model: "saaras:v4" })
    ).rejects.toThrow("Sarvam speech-to-text failed: 503 internal_server_error: Service overloaded");
  });

  it("rejects empty audio without a request", async () => {
    const fetchMock = vi.fn();
    const provider = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(
      provider.automaticSpeechRecognition({ audio: new Uint8Array(), model: "saaras:v4" })
    ).rejects.toThrow("audio must not be empty");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("normalizeSarvamLanguage", () => {
  it("matches exact, case-insensitive, bare, and ISO Odia codes", () => {
    expect(normalizeSarvamLanguage("hi-IN", SARVAM_TTS_LANGUAGES)).toBe("hi-IN");
    expect(normalizeSarvamLanguage("TA-in", SARVAM_TTS_LANGUAGES)).toBe("ta-IN");
    expect(normalizeSarvamLanguage("bn", SARVAM_TTS_LANGUAGES)).toBe("bn-IN");
    expect(normalizeSarvamLanguage("or", SARVAM_TTS_LANGUAGES)).toBe("od-IN");
    expect(normalizeSarvamLanguage("kok", SARVAM_ASR_LANGUAGES)).toBe("kok-IN");
    expect(normalizeSarvamLanguage("kok", SARVAM_TTS_LANGUAGES)).toBeUndefined();
    expect(normalizeSarvamLanguage("", SARVAM_TTS_LANGUAGES)).toBeUndefined();
    expect(normalizeSarvamLanguage(undefined, SARVAM_TTS_LANGUAGES)).toBeUndefined();
  });
});
