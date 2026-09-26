/**
 * vLLM embeddings and transcription: model discovery from `/v1/models`, the
 * declared capability set, and the wire requests the inherited OpenAI SDK
 * paths send to `/v1/embeddings` and `/v1/audio/transcriptions`.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { VLLMProvider } from "../../src/providers/vllm-provider.js";

const BASE = "http://vllm.local:8000";

function modelsFetch(ids: string[]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: ids.map((id) => ({ id, object: "model" })) })
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

/** The call the SDK made to `url`, skipping its `data:` capability probe. */
function callTo(
  spy: ReturnType<typeof vi.fn>,
  url: string
): RequestInit {
  const call = spy.mock.calls.find(([u]) => String(u) === url);
  if (!call) {
    throw new Error(`no request to ${url}`);
  }
  return call[1] as RequestInit;
}

function base64Floats(values: number[]): string {
  return Buffer.from(new Float32Array(values).buffer).toString("base64");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VLLMProvider model discovery", () => {
  it("offers every served model as an embedding model", async () => {
    const fetchFn = modelsFetch(["BAAI/bge-m3"]);
    const provider = new VLLMProvider({}, { baseURL: BASE, fetchFn });

    expect(await provider.getAvailableEmbeddingModels()).toEqual([
      { id: "BAAI/bge-m3", name: "BAAI/bge-m3", provider: "vllm" }
    ]);
    expect(fetchFn).toHaveBeenCalledWith(`${BASE}/v1/models`, expect.anything());
  });

  it("offers every served model as an ASR model", async () => {
    const provider = new VLLMProvider(
      {},
      { baseURL: BASE, fetchFn: modelsFetch(["openai/whisper-large-v3"]) }
    );

    expect(await provider.getAvailableASRModels()).toEqual([
      {
        id: "openai/whisper-large-v3",
        name: "openai/whisper-large-v3",
        provider: "vllm"
      }
    ]);
  });

  it("answers [] for embeddings and ASR when the server is unreachable", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const provider = new VLLMProvider({}, { baseURL: BASE, fetchFn });

    expect(await provider.getAvailableEmbeddingModels()).toEqual([]);
    expect(await provider.getAvailableASRModels()).toEqual([]);
  });

  it("reports no image, video or speech models", async () => {
    const provider = new VLLMProvider(
      {},
      { baseURL: BASE, fetchFn: modelsFetch(["m"]) }
    );

    expect(await provider.getAvailableImageModels()).toEqual([]);
    expect(await provider.getAvailableVideoModels()).toEqual([]);
    expect(await provider.getAvailableTTSModels()).toEqual([]);
  });
});

describe("VLLMProvider capabilities", () => {
  it("declares chat, embeddings and transcription only", () => {
    const provider = new VLLMProvider({}, { baseURL: BASE });

    expect(provider.getCapabilities().sort()).toEqual(
      [
        "automatic_speech_recognition",
        "generate_embedding",
        "generate_message",
        "generate_messages"
      ].sort()
    );
  });
});

describe("VLLMProvider endpoints", () => {
  it("posts embeddings to /v1/embeddings with the API key", async () => {
    // vLLM answers in the encoding the request names; the SDK asks for base64.
    const fetchSpy = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        encoding_format?: string;
      };
      const encode = (v: number[]) =>
        body.encoding_format === "base64" ? base64Floats(v) : v;
      return jsonResponse({
        object: "list",
        data: [
          { object: "embedding", index: 0, embedding: encode([0.5, 0.25]) },
          { object: "embedding", index: 1, embedding: encode([1, -1]) }
        ],
        model: "BAAI/bge-m3",
        usage: { prompt_tokens: 4, total_tokens: 4 }
      });
    });
    vi.stubGlobal("fetch", fetchSpy);
    const provider = new VLLMProvider(
      { VLLM_API_KEY: "secret" },
      { baseURL: BASE }
    );

    const vectors = await provider.generateEmbedding({
      text: ["a", "b"],
      model: "BAAI/bge-m3"
    });

    expect(vectors).toEqual([
      [0.5, 0.25],
      [1, -1]
    ]);
    const init = callTo(fetchSpy, `${BASE}/v1/embeddings`);
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "BAAI/bge-m3",
      input: ["a", "b"]
    });
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer secret"
    );
  });

  it("posts audio to /v1/audio/transcriptions", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ text: "hello world" }));
    vi.stubGlobal("fetch", fetchSpy);
    const provider = new VLLMProvider({}, { baseURL: BASE });

    // "RIFF....WAVE" header so the upload is labelled audio/wav.
    const wav = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45
    ]);
    const result = await provider.automaticSpeechRecognition({
      audio: wav,
      model: "openai/whisper-large-v3",
      language: "en"
    });

    expect(result).toEqual({ text: "hello world" });
    const init = callTo(fetchSpy, `${BASE}/v1/audio/transcriptions`);
    const form = init.body as FormData;
    expect(form.get("model")).toBe("openai/whisper-large-v3");
    expect(form.get("language")).toBe("en");
    expect((form.get("file") as File).type).toBe("audio/wav");
  });
});
