import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMusicgen: vi.fn(async () => ({ model: {}, tokenizer: {} })),
  generateMusic: vi.fn(async () => ({
    audio: new Float32Array([0.1, -0.1]),
    sampling_rate: 32000
  }))
}));

vi.mock("@nodetool-ai/transformers-js-nodes", () => ({
  encodeWav: (samples: Float32Array) => {
    const buf = Buffer.alloc(44 + samples.length * 2);
    buf.write("RIFF", 0);
    return buf;
  },
  getMusicgen: mocks.getMusicgen,
  generateMusic: mocks.generateMusic
}));

import { textToMusic } from "../src/music.js";

const MODEL = {
  id: "Xenova/musicgen-small",
  name: "Xenova/musicgen-small",
  provider: "transformers_js" as const
};

describe("textToMusic", () => {
  it("returns WAV and passes the duration and the signal on", async () => {
    const controller = new AbortController();
    const result = await textToMusic({
      model: MODEL,
      prompt: "calm ambient pads",
      durationSeconds: 8,
      signal: controller.signal
    });

    expect(result.mimeType).toBe("audio/wav");
    expect(result.data.slice(0, 4)).toEqual(
      new Uint8Array([0x52, 0x49, 0x46, 0x46])
    );
    expect(mocks.getMusicgen).toHaveBeenCalledWith(
      "Xenova/musicgen-small",
      undefined,
      undefined
    );
    expect(mocks.generateMusic).toHaveBeenCalledWith(
      expect.anything(),
      "calm ambient pads",
      { durationSeconds: 8, signal: controller.signal }
    );
  });

  it("refuses lyrics, since MusicGen cannot sing", async () => {
    await expect(
      textToMusic({ model: MODEL, prompt: "pop song", lyrics: "la la la" })
    ).rejects.toThrow(/cannot sing lyrics/);
  });

  it("refuses an empty prompt", async () => {
    await expect(textToMusic({ model: MODEL, prompt: "  " })).rejects.toThrow(
      /prompt is required/
    );
  });
});
