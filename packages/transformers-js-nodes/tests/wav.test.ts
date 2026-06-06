import { describe, expect, it } from "vitest";
import { decodeWav, encodeWav } from "../src/wav.js";

function bytesOf(buf: Buffer): Uint8Array {
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

describe("wav encode/decode", () => {
  it("round-trips Float32 samples at unit gain", () => {
    const input = new Float32Array([0, 0.5, -0.5, 1, -1, 0.25]);
    const decoded = decodeWav(bytesOf(encodeWav(input, 16000)));

    expect(decoded.sampleRate).toBe(16000);
    expect(decoded.numChannels).toBe(1);
    expect(decoded.samples.length).toBe(input.length);
    for (let i = 0; i < input.length; i++) {
      // encode scales by 0x7fff and decode divides by 0x7fff, so full-scale
      // ±1 must round-trip without clipping past the [-1, 1] range.
      expect(decoded.samples[i]).toBeCloseTo(input[i], 3);
    }
    expect(decoded.samples[3]).toBeCloseTo(1, 4);
    expect(decoded.samples[4]).toBeCloseTo(-1, 4);
  });

  it("does not read past an over-declared data chunk", () => {
    const input = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const bytes = bytesOf(encodeWav(input, 16000));
    // Corrupt the declared data-chunk size (uint32 LE at byte 40) to a value
    // far larger than the buffer — a streamed/truncated WAV pattern.
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(
      40,
      0xffffffff,
      true
    );

    expect(() => decodeWav(bytes)).not.toThrow();
    expect(decodeWav(bytes).samples.length).toBe(input.length);
  });
});
