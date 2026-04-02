import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TextToSpeechNode } from "../src/nodes/text-to-speech.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const fakeAudio = Buffer.from("fake-audio-data");

/** Helper: create a node with properties assigned. */
function makeNode(props: Record<string, unknown> = {}): TextToSpeechNode {
  return new TextToSpeechNode(props);
}

describe("TextToSpeechNode", () => {
  const originalApiKey = process.env.ELEVENLABS_API_KEY;

  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = "test-key";
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () =>
        fakeAudio.buffer.slice(
          fakeAudio.byteOffset,
          fakeAudio.byteOffset + fakeAudio.byteLength
        )
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

  it("calls ElevenLabs API with correct URL and headers", async () => {
    const node = makeNode({ voice: "Aria", text: "Hello world" });
    const result = await node.process();

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];

    // Aria's voice ID
    expect(url).toContain("9BWtsMINqrJLrRacOk9x");
    expect(options.method).toBe("POST");
    expect((options.headers as Record<string, string>)["xi-api-key"]).toBe(
      "test-key"
    );

    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.text).toBe("Hello world");

    expect(result.output).toMatchObject({
      type: "audio",
      data: expect.stringContaining("data:audio/mpeg;base64,")
    });
  });

  it("uses API key from _secrets context", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const node = makeNode({ voice: "Aria", text: "Hello" });
    node.setDynamic("_secrets", { ELEVENLABS_API_KEY: "from-secrets" });
    await node.process();

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["xi-api-key"]).toBe(
      "from-secrets"
    );
  });

  it("throws when API key is missing", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const node = makeNode({ voice: "Aria", text: "Hello" });
    await expect(node.process()).rejects.toThrow("ELEVENLABS_API_KEY");
  });

  it("throws when voice is unknown", async () => {
    const node = makeNode({ voice: "UnknownVoice", text: "Hello" });
    await expect(node.process()).rejects.toThrow("Unknown voice");
  });

  it("throws when text is empty", async () => {
    const node = makeNode({ voice: "Aria", text: "" });
    await expect(node.process()).rejects.toThrow("Text is required");
  });

  it("includes voice_settings when stability is non-default", async () => {
    const node = makeNode({ voice: "Aria", text: "Hello", stability: 0.8 });
    await node.process();

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect((body.voice_settings as Record<string, unknown>).stability).toBe(
      0.8
    );
  });

  it("includes language_code when not 'none'", async () => {
    const node = makeNode({
      voice: "Aria",
      text: "Hello",
      language_code: "en"
    });
    await node.process();

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.language_code).toBe("en");
  });

  it("omits language_code when set to 'none'", async () => {
    const node = makeNode({
      voice: "Aria",
      text: "Hello",
      language_code: "none"
    });
    await node.process();

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.language_code).toBeUndefined();
  });

  it("includes seed when not -1", async () => {
    const node = makeNode({ voice: "Aria", text: "Hello", seed: 42 });
    await node.process();

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.seed).toBe(42);
  });

  it("throws when ElevenLabs API returns an error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      text: async () => "Unauthorized"
    });
    const node = makeNode({ voice: "Aria", text: "Hello" });
    await expect(node.process()).rejects.toThrow("ElevenLabs API error");
  });
});
