import { describe, expect, it } from "vitest";
import { ConcatAudioNode, ConcatTextNode } from "../src/index.js";

/**
 * Build a minimal mono 16-bit PCM WAV from int16 sample values. ConcatAudioNode
 * decodes every input to PCM and joins in sample space (non-audio bytes are
 * rejected), so fixtures must be real WAV files, not arbitrary bytes.
 */
function wavRef(samples: number[], sampleRate = 8000) {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byteRate = sampleRate * blockAlign
  buf.writeUInt16LE(2, 32); // blockAlign = channels * bytesPerSample
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(samples[i], 44 + i * 2);
  }
  return { type: "audio", uri: "", data: buf.toString("base64") };
}

/** Read the int16 PCM samples out of a canonical 44-byte-header WAV buffer. */
function samplesOf(wav: Buffer): number[] {
  expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
  const samples: number[] = [];
  for (let i = 44; i + 2 <= wav.length; i += 2) {
    samples.push(wav.readInt16LE(i));
  }
  return samples;
}

describe("dynamic concat inputs", () => {
  it("ConcatAudioNode concatenates dynamic inputs in insertion order", async () => {
    const node = new ConcatAudioNode();
    node.assign({
      a: wavRef([100, 200]),
      b: wavRef([300, 400]),
      c: wavRef([500]),
      d: wavRef([600])
    });

    const result = await node.process();
    const output = result.output as { data: string };
    const bytes = Buffer.from(output.data, "base64");

    expect(samplesOf(bytes)).toEqual([100, 200, 300, 400, 500, 600]);
  });

  it("ConcatTextNode concatenates dynamic inputs in insertion order", async () => {
    const node = new ConcatTextNode();
    node.assign({
      a: "hello",
      b: ", ",
      c: "dynamic",
      d: " world"
    });

    const result = await node.process();
    expect(result.output).toBe("hello, dynamic world");
  });
});
