import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AzureOpenAIProvider,
  azureOpenAIResourceRoot,
  inferAzureDeploymentKind,
  parseAzureDeployments
} from "../../src/providers/azure-openai-provider.js";
import { chatJsonResponse } from "./helpers/compat-fetch.js";

const COMPLETION = {
  id: "chatcmpl-1",
  object: "chat.completion",
  created: 0,
  model: "gpt-5.5",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "Hello" },
      finish_reason: "stop"
    }
  ],
  usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 }
};

function provider(
  overrides: Record<string, string> = {},
  fetchFn?: typeof fetch
): AzureOpenAIProvider {
  return new AzureOpenAIProvider(
    {
      AZURE_OPENAI_API_KEY: "azure-key",
      AZURE_OPENAI_ENDPOINT: "https://res.openai.azure.com",
      AZURE_OPENAI_DEPLOYMENTS: "gpt-5.5, gpt-image-2, tts-hd, whisper, text-embedding-3-large, painter:image",
      ...overrides
    },
    { fetchFn }
  );
}

function requestOf(mock: ReturnType<typeof vi.fn>, call = 0): { url: string; headers: Headers } {
  const [input, init] = mock.mock.calls[call] as [RequestInfo | URL, RequestInit | undefined];
  const url = input instanceof Request ? input.url : String(input);
  return { url, headers: new Headers(init?.headers) };
}

describe("parseAzureDeployments", () => {
  it("classifies deployment names and honors an explicit kind", () => {
    expect(parseAzureDeployments("gpt-5.5, gpt-image-2,tts,whisper , text-embedding-3-small,brush:image, gpt-5.5")).toEqual([
      { id: "gpt-5.5", kind: "chat" },
      { id: "gpt-image-2", kind: "image" },
      { id: "tts", kind: "tts" },
      { id: "whisper", kind: "asr" },
      { id: "text-embedding-3-small", kind: "embedding" },
      { id: "brush", kind: "image" }
    ]);
  });

  it("keeps a colon that is not a known kind as part of the name", () => {
    expect(parseAzureDeployments("model:v2")).toEqual([{ id: "model:v2", kind: "chat" }]);
  });

  it("returns nothing for an empty value", () => {
    expect(parseAzureDeployments(undefined)).toEqual([]);
    expect(parseAzureDeployments(" , ")).toEqual([]);
  });

  it("infers media kinds from model names", () => {
    expect(inferAzureDeploymentKind("dall-e-3")).toBe("image");
    expect(inferAzureDeploymentKind("gpt-4o-mini-transcribe")).toBe("asr");
    expect(inferAzureDeploymentKind("gpt-4o-mini-tts")).toBe("tts");
    expect(inferAzureDeploymentKind("gpt-4o")).toBe("chat");
  });
});

describe("azureOpenAIResourceRoot", () => {
  it.each([
    ["https://res.openai.azure.com", "https://res.openai.azure.com"],
    ["https://res.openai.azure.com/", "https://res.openai.azure.com"],
    ["https://res.cognitiveservices.azure.com/openai", "https://res.cognitiveservices.azure.com"],
    ["https://res.openai.azure.com/openai/v1/", "https://res.openai.azure.com"]
  ])("normalizes %s", (input, expected) => {
    expect(azureOpenAIResourceRoot(input)).toBe(expected);
  });

  it("rejects a malformed or non-https endpoint", () => {
    expect(() => azureOpenAIResourceRoot("not a url")).toThrow("AZURE_OPENAI_ENDPOINT is not a valid URL");
    expect(() => azureOpenAIResourceRoot("http://res.openai.azure.com")).toThrow("https://");
  });
});

describe("AzureOpenAIProvider", () => {
  const originalProfile = process.env["NODETOOL_NODE_PROFILE"];
  afterEach(() => {
    if (originalProfile === undefined) delete process.env["NODETOOL_NODE_PROFILE"];
    else process.env["NODETOOL_NODE_PROFILE"] = originalProfile;
  });

  it("requires a key and an endpoint", () => {
    expect(() => new AzureOpenAIProvider({ AZURE_OPENAI_ENDPOINT: "https://x" })).toThrow(
      "AZURE_OPENAI_API_KEY is required"
    );
    expect(() => new AzureOpenAIProvider({ AZURE_OPENAI_API_KEY: "k" })).toThrow(
      "AZURE_OPENAI_ENDPOINT is required"
    );
    expect(AzureOpenAIProvider.requiredSecrets()).toEqual([
      "AZURE_OPENAI_API_KEY",
      "AZURE_OPENAI_ENDPOINT"
    ]);
  });

  it("lists each deployment under the model kind it serves", async () => {
    const p = provider();
    expect(p.provider).toBe("azure_openai");
    expect((await p.getAvailableLanguageModels()).map((m) => m.id)).toEqual(["gpt-5.5"]);
    expect((await p.getAvailableImageModels()).map((m) => m.id)).toEqual(["gpt-image-2", "painter"]);
    expect((await p.getAvailableTTSModels()).map((m) => m.id)).toEqual(["tts-hd"]);
    expect((await p.getAvailableASRModels()).map((m) => m.id)).toEqual(["whisper"]);
    expect((await p.getAvailableEmbeddingModels()).map((m) => m.id)).toEqual(["text-embedding-3-large"]);
    expect(await p.getAvailableVideoModels()).toEqual([]);
    expect(p.getCapabilities()).toEqual(
      expect.arrayContaining([
        "text_to_image",
        "image_to_image",
        "inpainting",
        "text_to_speech",
        "automatic_speech_recognition",
        "generate_embedding"
      ])
    );
  });

  it("declares no media capabilities without media deployments", () => {
    const p = provider({ AZURE_OPENAI_DEPLOYMENTS: "gpt-5.5" });
    expect(p.getCapabilities()).not.toContain("text_to_image");
    expect(p.getCapabilities()).not.toContain("text_to_speech");
  });

  it("sends chat to the v1 API with the api-key header when no version is set", async () => {
    const fetchFn = vi.fn(async () => chatJsonResponse(COMPLETION));
    const p = provider({}, fetchFn as unknown as typeof fetch);
    const message = await p.generateMessage({
      messages: [{ role: "user", content: "Hi" }],
      model: "gpt-5.5"
    });
    expect(message.content).toBe("Hello");
    const { url, headers } = requestOf(fetchFn);
    expect(url).toBe("https://res.openai.azure.com/openai/v1/chat/completions");
    expect(headers.get("api-key")).toBe("azure-key");
  });

  it("uses the deployment route and api-version when a dated version is set", async () => {
    const fetchFn = vi.fn(async () => chatJsonResponse(COMPLETION));
    const p = provider(
      {
        AZURE_OPENAI_ENDPOINT: "https://res.cognitiveservices.azure.com/openai",
        AZURE_OPENAI_API_VERSION: "2025-04-01-preview"
      },
      fetchFn as unknown as typeof fetch
    );
    await p.generateMessage({ messages: [{ role: "user", content: "Hi" }], model: "gpt-5.5" });
    const { url, headers } = requestOf(fetchFn);
    expect(url).toBe(
      "https://res.cognitiveservices.azure.com/openai/deployments/gpt-5.5/chat/completions?api-version=2025-04-01-preview"
    );
    expect(headers.get("api-key")).toBe("azure-key");
  });

  it.each(["encoded", "streaming"])("uses mapped model capabilities while routing %s media to deployment names", async (mode) => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith("/audio/speech")) return new Response(new Uint8Array([1, 2]));
      return chatJsonResponse({ text: "hello", words: [], segments: [] });
    });
    const p = provider({ AZURE_OPENAI_DEPLOYMENTS: "speech-prod=gpt-4o-mini-tts,transcription-prod=whisper-1" }, fetchFn);
    const speechArgs = { model: "speech-prod", text: "hi", audioFormat: "mp3", language: "French", instructions: "Speak softly" };
    if (mode === "encoded") {
      await p.textToSpeechEncoded(speechArgs);
    } else {
      for await (const chunk of p.textToSpeech(speechArgs)) {
        expect(chunk).toBeDefined();
      }
    }
    const speechInit = fetchFn.mock.calls[0][1];
    expect(JSON.parse(String(speechInit?.body))).toMatchObject({ model: "speech-prod", instructions: "Speak in French. Speak softly" });
    await p.automaticSpeechRecognition({ model: "transcription-prod", audio: new Uint8Array([1, 2]), word_timestamps: true });
    const [transcriptionInput, transcriptionInit] = fetchFn.mock.calls.find(([input]) => String(input).endsWith("/audio/transcriptions"))!;
    const transcriptionRequest = transcriptionInput instanceof Request
      ? transcriptionInput.clone()
      : new Request(String(transcriptionInput), transcriptionInit);
    const transcriptionBody = await transcriptionRequest.formData();
    expect(transcriptionBody.get("model")).toBe("transcription-prod");
    expect(transcriptionBody.get("response_format")).toBe("verbose_json");
  });

  it("fails the first request, not construction, on a malformed endpoint", async () => {
    const p = provider({ AZURE_OPENAI_ENDPOINT: "nope" });
    await expect(
      p.generateMessage({ messages: [{ role: "user", content: "Hi" }], model: "gpt-5.5" })
    ).rejects.toThrow("AZURE_OPENAI_ENDPOINT is not a valid URL");
  });

  it("refuses a private endpoint under the cloud profile", async () => {
    process.env["NODETOOL_NODE_PROFILE"] = "cloud";
    const fetchFn = vi.fn(async () => chatJsonResponse(COMPLETION));
    const p = provider({ AZURE_OPENAI_ENDPOINT: "https://127.0.0.1" }, fetchFn as unknown as typeof fetch);
    await expect(
      p.generateMessage({ messages: [{ role: "user", content: "Hi" }], model: "gpt-5.5" })
    ).rejects.toThrow();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
