import { describe, it, expect, vi } from "vitest";
import { OpenRouterProvider } from "../../src/providers/openrouter-provider.js";

const BASE = "https://openrouter.ai/api/v1";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function routedFetch(routes: Record<string, () => Response>) {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    const route = routes[url];
    if (!route) throw new Error(`unexpected fetch ${url}`);
    return route();
  });
}

function makeProvider(fetchFn: ReturnType<typeof routedFetch>) {
  return new OpenRouterProvider(
    { OPENROUTER_API_KEY: "or-key" },
    { client: {} as never, fetchFn: fetchFn as unknown as typeof fetch }
  );
}

describe("OpenRouterProvider modalities", () => {
  it("lists image models with tasks and parameter enums", async () => {
    const fetchFn = routedFetch({
      [`${BASE}/images/models`]: () =>
        json({
          data: [
            {
              id: "google/gemini-3-pro-image",
              name: "Gemini Image",
              architecture: {
                input_modalities: ["text", "image"],
                output_modalities: ["image"]
              },
              supported_parameters: {
                aspect_ratio: { type: "enum", values: ["1:1", "16:9"] },
                resolution: { type: "enum", values: ["1K", "2K"] }
              }
            },
            {
              id: "black-forest-labs/flux",
              architecture: { input_modalities: ["text"] }
            }
          ]
        })
    });
    const models = await makeProvider(fetchFn).getAvailableImageModels();
    expect(models).toEqual([
      {
        id: "google/gemini-3-pro-image",
        name: "Gemini Image",
        provider: "openrouter",
        supportedTasks: ["text_to_image", "image_to_image"],
        aspectRatios: ["1:1", "16:9"],
        resolutions: ["1K", "2K"]
      },
      {
        id: "black-forest-labs/flux",
        name: "black-forest-labs/flux",
        provider: "openrouter",
        supportedTasks: ["text_to_image"]
      }
    ]);
  });

  it("lists speech models with their voices", async () => {
    const fetchFn = routedFetch({
      [`${BASE}/models?output_modalities=speech`]: () =>
        json({
          data: [
            { id: "openai/gpt-4o-mini-tts", name: "TTS", supported_voices: ["alloy", "nova"] },
            { id: "x/tts", supported_voices: null }
          ]
        })
    });
    const models = await makeProvider(fetchFn).getAvailableTTSModels();
    expect(models).toEqual([
      { id: "openai/gpt-4o-mini-tts", name: "TTS", provider: "openrouter", voices: ["alloy", "nova"] },
      { id: "x/tts", name: "x/tts", provider: "openrouter" }
    ]);
  });

  it("lists transcription and embedding models", async () => {
    const fetchFn = routedFetch({
      [`${BASE}/models?output_modalities=transcription`]: () =>
        json({ data: [{ id: "openai/whisper-large-v3", name: "Whisper" }] }),
      [`${BASE}/embeddings/models`]: () =>
        json({ data: [{ id: "openai/text-embedding-3-small", name: "Embed" }] })
    });
    const provider = makeProvider(fetchFn);
    expect(await provider.getAvailableASRModels()).toEqual([
      { id: "openai/whisper-large-v3", name: "Whisper", provider: "openrouter" }
    ]);
    expect(await provider.getAvailableEmbeddingModels()).toEqual([
      { id: "openai/text-embedding-3-small", name: "Embed", provider: "openrouter" }
    ]);
  });

  it("transcribes through a JSON body with base64 input_audio", async () => {
    const fetchFn = routedFetch({
      [`${BASE}/audio/transcriptions`]: () =>
        json({
          text: "hello world",
          words: [
            { word: "hello", start: 0, end: 0.4 },
            { word: "world", start: 0.5, end: 0.9 }
          ]
        })
    });
    const provider = makeProvider(fetchFn);
    const wav = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45
    ]);

    expect(
      await provider.automaticSpeechRecognition({
        audio: wav,
        model: "openai/whisper-large-v3"
      })
    ).toEqual({ text: "hello world" });

    const result = await provider.automaticSpeechRecognition({
      audio: wav,
      model: "openai/whisper-large-v3",
      language: "en",
      word_timestamps: true
    });
    expect(result.chunks).toEqual([
      { timestamp: [0, 0.4], text: "hello" },
      { timestamp: [0.5, 0.9], text: "world" }
    ]);

    const [, init] = fetchFn.mock.calls[1];
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "openai/whisper-large-v3",
      input_audio: { data: Buffer.from(wav).toString("base64"), format: "wav" },
      language: "en",
      response_format: "verbose_json",
      timestamp_granularities: ["word"]
    });
  });

  it("rejects empty audio and surfaces API failures", async () => {
    const fetchFn = routedFetch({
      [`${BASE}/audio/transcriptions`]: () => new Response("nope", { status: 400 })
    });
    const provider = makeProvider(fetchFn);
    await expect(
      provider.automaticSpeechRecognition({ audio: new Uint8Array(), model: "m" })
    ).rejects.toThrow("audio must not be empty");
    await expect(
      provider.automaticSpeechRecognition({ audio: new Uint8Array([1]), model: "m" })
    ).rejects.toThrow("OpenRouter transcription failed: 400 nope");
  });
});
