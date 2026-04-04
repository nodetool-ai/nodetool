import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpeechToTextNode } from "../src/nodes/speech-to-text.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Minimal valid WAV header encoded as base64
const WAV_BASE64 =
  "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

const audioFromDataUri = {
  type: "audio",
  data: `data:audio/wav;base64,${WAV_BASE64}`
};

/** Helper: create a node, assign properties, then call process(). */
function makeNode(props: Record<string, unknown> = {}): SpeechToTextNode {
  const node = new SpeechToTextNode(props);
  return node;
}

describe("SpeechToTextNode", () => {
  const originalApiKey = process.env.ELEVENLABS_API_KEY;

  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = "test-key";
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        text: "Hello world",
        language_code: "en",
        language_probability: 0.99,
        words: [{ word: "Hello" }, { word: "world" }],
        transcription_id: "tid-123"
      })
    });
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.ELEVENLABS_API_KEY;
    } else {
      process.env.ELEVENLABS_API_KEY = originalApiKey;
    }
    mockFetch.mockReset();
  });

  it("transcribes audio from a data URI", async () => {
    const node = makeNode({ audio: audioFromDataUri });
    const result = await node.process();

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elevenlabs.io/v1/speech-to-text");
    expect(options.method).toBe("POST");
    expect((options.headers as Record<string, string>)["xi-api-key"]).toBe(
      "test-key"
    );

    expect(result).toMatchObject({
      text: "Hello world",
      language_code: "en",
      language_probability: 0.99,
      words: [{ word: "Hello" }, { word: "world" }],
      transcription_id: "tid-123"
    });
  });

  it("uses API key from _secrets context", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const node = makeNode({ audio: audioFromDataUri });
    node.setDynamic("_secrets", { ELEVENLABS_API_KEY: "from-secrets" });
    await node.process();

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["xi-api-key"]).toBe(
      "from-secrets"
    );
  });

  it("throws when API key is missing", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const node = makeNode({ audio: audioFromDataUri });
    await expect(node.process()).rejects.toThrow("ELEVENLABS_API_KEY");
  });

  it("throws when audio input is missing", async () => {
    const node = makeNode({ audio: {} });
    await expect(node.process()).rejects.toThrow("Audio input is required");
  });

  it("throws on invalid audio data URI", async () => {
    const node = makeNode({ audio: { data: "not-a-data-uri" } });
    await expect(node.process()).rejects.toThrow("Invalid audio data URI");
  });

  it("fetches audio from a URI when data is absent", async () => {
    // First fetch: the audio file; second fetch: the STT API call
    const fakeAudioBuf = Buffer.from("RIFF....WAVE");
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () =>
          fakeAudioBuf.buffer.slice(
            fakeAudioBuf.byteOffset,
            fakeAudioBuf.byteOffset + fakeAudioBuf.byteLength
          )
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          text: "fetched audio",
          language_code: "en",
          language_probability: 0.9,
          words: [],
          transcription_id: "tid-456"
        })
      });

    const node = makeNode({ audio: { uri: "https://example.com/audio.wav" } });
    const result = await node.process();

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toBe("https://example.com/audio.wav");
    expect(result.text).toBe("fetched audio");
  });

  it("throws when ElevenLabs API returns an error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      text: async () => "Bad Request"
    });
    const node = makeNode({ audio: audioFromDataUri });
    await expect(node.process()).rejects.toThrow("ElevenLabs API error");
  });

  it("includes language_code in form when specified", async () => {
    const node = makeNode({
      audio: audioFromDataUri,
      language_code: "es"
    });
    await node.process();

    // Verify by checking FormData – easier through the body type
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = options.body as FormData;
    expect(body.get("language_code")).toBe("es");
  });
});
