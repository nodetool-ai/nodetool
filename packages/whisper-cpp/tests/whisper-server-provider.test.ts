import { expect, it, vi } from "vitest";
import { encodeWav } from "@nodetool-ai/transformers-js-nodes";
import { WhisperServerProvider } from "../src/whisper-server-provider.js";

it("posts original audio and maps verbose JSON seconds", async () => {
  const fetchFn = vi.fn<typeof fetch>(async (_url, init) => {
    expect(init?.method).toBe("POST");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const body = init?.body;
    expect(body).toBeInstanceOf(FormData);
    if (!(body instanceof FormData)) {
      throw new Error("Expected multipart form");
    }
    expect(body.get("response_format")).toBe("verbose_json");
    expect(body.get("language")).toBe("en");
    expect(body.get("temperature")).toBe("0");
    expect(body.get("prompt")).toBe("Names");
    const file = body.get("file");
    if (!(file instanceof Blob)) {
      throw new Error("Expected audio file");
    }
    expect(file.type).toBe("audio/wav");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(
      new Uint8Array(audio)
    );
    return Response.json({
      text: " Hello ",
      segments: [{ start: 0.1, end: 1.2, text: " Hello" }]
    });
  });
  const audio = encodeWav(new Float32Array(16000), 16000);
  const provider = new WhisperServerProvider(
    { WHISPER_CPP_SERVER_URL: "http://localhost:8080///" },
    { fetchFn }
  );
  const [model] = await provider.getAvailableASRModels();
  expect(
    await provider.automaticSpeechRecognition({
      audio,
      model: model.id,
      language: "en",
      temperature: 0,
      prompt: "Names"
    })
  ).toEqual({
    text: "Hello",
    chunks: [{ timestamp: [0.1, 1.2], text: " Hello" }]
  });
  expect(fetchFn.mock.calls[0][0]).toBe("http://localhost:8080/inference");
});
it("reports status and server error body", async () => {
  const provider = new WhisperServerProvider(
    { WHISPER_CPP_SERVER_URL: "http://localhost" },
    { fetchFn: async () => new Response("model unavailable", { status: 503 }) }
  );
  await expect(
    provider.automaticSpeechRecognition({
      audio: new Uint8Array([1]),
      model: "default"
    })
  ).rejects.toThrow("(503): model unavailable");
});
it("requires a URL", () => {
  vi.stubEnv("WHISPER_CPP_SERVER_URL", "");
  expect(() => new WhisperServerProvider()).toThrow(
    "WHISPER_CPP_SERVER_URL is required"
  );
  vi.unstubAllEnvs();
});
