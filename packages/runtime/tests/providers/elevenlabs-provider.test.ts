import { describe, it, expect, vi } from "vitest";
import { ElevenLabsProvider } from "../../src/providers/elevenlabs-provider.js";

describe("ElevenLabsProvider", () => {
  it("requires an API key", () => {
    expect(() => new ElevenLabsProvider({})).toThrow("ELEVENLABS_API_KEY");
  });

  it("lists TTS models with voices and the elevenlabs provider id", async () => {
    const p = new ElevenLabsProvider({ ELEVENLABS_API_KEY: "k" });
    const models = await p.getAvailableTTSModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => m.provider === "elevenlabs")).toBe(true);
    const ml2 = models.find((m) => m.id === "eleven_multilingual_v2");
    expect(ml2?.voices).toContain("Aria");
  });

  it("advertises the text_to_speech capability", () => {
    const p = new ElevenLabsProvider({ ELEVENLABS_API_KEY: "k" });
    expect(p.getCapabilities()).toContain("text_to_speech");
    expect(p.supportsStreamingTextToSpeech()).toBe(true);
  });

  it("streams PCM samples, resolving a voice name to its id", async () => {
    // 4 LE int16 samples
    const pcm = new Int16Array([1, -2, 3, -4]);
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => pcm.buffer.slice(0)
    });
    const p = new ElevenLabsProvider({ ELEVENLABS_API_KEY: "k" }, { fetchFn });

    const out: Int16Array[] = [];
    for await (const chunk of p.textToSpeech({
      text: "hi",
      model: "eleven_multilingual_v2",
      voice: "Aria"
    })) {
      out.push(chunk.samples);
      expect(chunk.sampleRate).toBe(24000);
    }
    expect(Array.from(out[0])).toEqual([1, -2, 3, -4]);

    const url = fetchFn.mock.calls[0][0] as string;
    expect(url).toContain("/text-to-speech/9BWtsMINqrJLrRacOk9x"); // Aria's id
    expect(url).toContain("output_format=pcm_24000");
    const body = JSON.parse(fetchFn.mock.calls[0][1].body as string);
    expect(body.model_id).toBe("eleven_multilingual_v2");
  });

  it("returns encoded mp3 bytes, passing a raw voice id through", async () => {
    const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => mp3.buffer.slice(0)
    });
    const p = new ElevenLabsProvider({ ELEVENLABS_API_KEY: "k" }, { fetchFn });

    const result = await p.textToSpeechEncoded({
      text: "hi",
      model: "eleven_turbo_v2_5",
      voice: "customVoiceId123"
    });
    expect(result?.mimeType).toBe("audio/mpeg");
    expect(result?.data).toEqual(mp3);

    const url = fetchFn.mock.calls[0][0] as string;
    expect(url).toContain("/text-to-speech/customVoiceId123");
    expect(url).toContain("output_format=mp3_44100_128");
  });

  it("surfaces API errors", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "unauthorized"
    });
    const p = new ElevenLabsProvider({ ELEVENLABS_API_KEY: "k" }, { fetchFn });
    await expect(
      p.textToSpeechEncoded({ text: "hi", model: "eleven_multilingual_v2" })
    ).rejects.toThrow("ElevenLabs TTS failed: 401");
  });
});
