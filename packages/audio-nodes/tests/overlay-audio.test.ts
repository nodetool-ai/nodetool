import { describe, expect, it } from "vitest";
import { OverlayAudioNode, encodeWav, parseWavBytes, toBytes } from "@nodetool-ai/audio-nodes";

function tone(sampleRate: number, channels: number[]) {
  const samples = new Float32Array(sampleRate * channels.length);
  for (let i = 0; i < samples.length; i++) samples[i] = channels[i % channels.length];
  return { type: "audio", data: encodeWav(samples, sampleRate, channels.length) };
}

describe("Overlay Audio", () => {
  it("aligns mono narration and stereo music at different sample rates", async () => {
    const node = new OverlayAudioNode({ a: tone(8000, [0.2]), b: tone(16000, [0.1, 0.05]) });
    const { output } = await node.process();
    const wav = parseWavBytes(toBytes(output.data));
    expect(wav).not.toBeNull();
    expect(wav?.sampleRate).toBe(16000);
    expect(wav?.numChannels).toBe(2);
    expect(wav?.samples.length).toBe(32000);
    expect(wav?.samples[16000]).toBeCloseTo(0.3, 3);
    expect(wav?.samples[16001]).toBeCloseTo(0.25, 3);
  });

  it("rejects undecodable audio instead of mixing container bytes", async () => {
    const node = new OverlayAudioNode({
      a: tone(8000, [0.2]),
      b: { type: "audio", data: new Uint8Array([1, 2, 3, 4]) }
    });
    await expect(node.process()).rejects.toThrow("Could not decode audio");
  });
});
