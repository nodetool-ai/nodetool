import { describe, expect, it, vi } from "vitest";
import { generateKokoroSpeech, splitTextForTts } from "../src/tts-shared.js";

describe("splitTextForTts", () => {
  it("keeps short text as one chunk", () => {
    expect(splitTextForTts("Hello there. How are you?")).toEqual([
      "Hello there. How are you?"
    ]);
  });

  it("breaks long text between sentences and every chunk fits the limit", () => {
    const sentence = "This sentence has exactly fifty characters in it. ";
    const text = sentence.repeat(20);
    const chunks = splitTextForTts(text, 120);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(120);
      expect(chunk.endsWith(".")).toBe(true);
    }
    expect(chunks.join(" ")).toBe(text.trim());
  });

  it("breaks a single overlong sentence between words", () => {
    const text = Array.from({ length: 100 }, (_, i) => `word${i}`).join(" ");
    const chunks = splitTextForTts(text, 50);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(50);
    expect(chunks.join(" ")).toBe(text);
  });
});

describe("generateKokoroSpeech", () => {
  it("synthesizes each chunk and concatenates the audio", async () => {
    const generate = vi.fn(async (chunk: string) => ({
      audio: new Float32Array(chunk.length).fill(0.5),
      sampling_rate: 24000
    }));
    const text = "A long sentence that keeps going on and on. ".repeat(30);
    const result = await generateKokoroSpeech({ generate }, text, {
      voice: "af_heart"
    });
    expect(generate.mock.calls.length).toBeGreaterThan(1);
    const spoken = generate.mock.calls.map(([chunk]) => chunk).join(" ");
    expect(spoken).toBe(text.trim());
    const expectedSamples = generate.mock.calls.reduce(
      (n, [chunk]) => n + chunk.length,
      0
    );
    expect(result.audio.length).toBe(expectedSamples);
    expect(result.sampling_rate).toBe(24000);
  });
});
