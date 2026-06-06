import { describe, it, expect } from "vitest";
import {
  encodePcm16Wav,
  parseWavBytes,
  readWavHeader
} from "@nodetool-ai/audio-nodes";

describe("encodePcm16Wav", () => {
  it("wraps PCM bytes in a parseable RIFF/WAVE container", () => {
    const samples = new Int16Array([0, 1000, -1000, 32767, -32768, 0]);
    const pcm = new Uint8Array(samples.buffer);
    const wav = encodePcm16Wav(pcm, 24000, 1);

    // RIFF header
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe("WAVE");

    const decoded = parseWavBytes(wav);
    expect(decoded).not.toBeNull();
    if (!decoded) throw new Error("expected wav");
    expect(decoded?.sampleRate).toBe(24000);
    expect(decoded?.numChannels).toBe(1);
    expect(decoded?.samples.length).toBe(samples.length);
    // Sanity-check a couple of round-tripped values (Float32 ≈ Int16/32767).
    expect(decoded!.samples[3]).toBeCloseTo(1, 3);
    expect(decoded!.samples[4]).toBeCloseTo(-1, 3);
  });

  it("uses the supplied sample rate in the header", () => {
    const wav = encodePcm16Wav(new Uint8Array(0), 32000, 1);
    expect(parseWavBytes(wav)?.sampleRate).toBe(32000);
  });
});

describe("parseWavBytes chunk traversal", () => {
  // Build a WAV that places an odd-sized `LIST` chunk (with its required pad
  // byte) before the `data` chunk — the layout that the old fixed-offset
  // parser mislocated.
  function wavWithLeadingListChunk(samples: Int16Array, sampleRate = 24000) {
    const listBody = Buffer.from("INFOx", "ascii"); // 5 bytes -> odd, needs pad
    const dataSize = samples.length * 2;
    const listChunkSize = 8 + listBody.length + (listBody.length & 1);
    const buf = Buffer.alloc(12 + 24 + listChunkSize + 8 + dataSize);
    let o = 0;
    buf.write("RIFF", o);
    buf.writeUInt32LE(buf.length - 8, o + 4);
    buf.write("WAVE", o + 8);
    o += 12;
    // fmt chunk (16-byte body)
    buf.write("fmt ", o);
    buf.writeUInt32LE(16, o + 4);
    buf.writeUInt16LE(1, o + 8);
    buf.writeUInt16LE(1, o + 10);
    buf.writeUInt32LE(sampleRate, o + 12);
    buf.writeUInt32LE(sampleRate * 2, o + 16);
    buf.writeUInt16LE(2, o + 20);
    buf.writeUInt16LE(16, o + 22);
    o += 24;
    // LIST chunk (odd body -> trailing pad byte)
    buf.write("LIST", o);
    buf.writeUInt32LE(listBody.length, o + 4);
    listBody.copy(buf, o + 8);
    o += listChunkSize;
    // data chunk
    buf.write("data", o);
    buf.writeUInt32LE(dataSize, o + 4);
    o += 8;
    for (let i = 0; i < samples.length; i++) buf.writeInt16LE(samples[i], o + i * 2);
    return new Uint8Array(buf);
  }

  it("locates the data chunk past a padded LIST chunk", () => {
    const samples = new Int16Array([1000, -2000, 32767, -32768]);
    const wav = wavWithLeadingListChunk(samples, 24000);

    const header = readWavHeader(wav);
    expect(header).not.toBeNull();
    expect(header?.sampleRate).toBe(24000);
    expect(header?.numChannels).toBe(1);
    expect(header?.bitsPerSample).toBe(16);
    expect(header?.dataSize).toBe(samples.length * 2);

    const decoded = parseWavBytes(wav);
    expect(decoded?.sampleRate).toBe(24000);
    expect(decoded?.samples.length).toBe(samples.length);
    expect(decoded!.samples[2]).toBeCloseTo(1, 3);
    expect(decoded!.samples[3]).toBeCloseTo(-1, 3);
  });

  it("returns null for non-RIFF input", () => {
    expect(readWavHeader(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(parseWavBytes(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});
