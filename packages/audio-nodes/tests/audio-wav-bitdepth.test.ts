/**
 * `parseWavBytes` is the only decode path with no native-addon or subprocess
 * dependency, so it must cover the WAV variants that real encoders emit:
 * 8/16/24/32-bit integer PCM, 32-bit IEEE float, and WAVE_FORMAT_EXTENSIBLE.
 * This is what lets edge/workers/browser runtimes (no ffmpeg, no
 * node-web-audio-api) decode audio at all.
 */
import { describe, it, expect } from "vitest";
import { parseWavBytes } from "@nodetool-ai/audio-nodes";

const PCM = 1;
const FLOAT = 3;
const EXTENSIBLE = 0xfffe;

function writeAscii(out: Uint8Array, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) out[offset + i] = text.charCodeAt(i);
}

/**
 * Build a WAV file from interleaved float samples. `fmtTag` is the format
 * written into the header (1/3/0xFFFE); `storeAs` (1 or 3) decides how the
 * samples are encoded into bytes; `subFormat` populates the EXTENSIBLE
 * SubFormat GUID's leading tag.
 */
function buildWav(opts: {
  samples: Float32Array;
  sampleRate: number;
  numChannels: number;
  bits: number;
  fmtTag: number;
  storeAs: number;
  subFormat?: number;
}): Uint8Array {
  const { samples, sampleRate, numChannels, bits, fmtTag, storeAs } = opts;
  const bytesPerSample = bits / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = samples.length * bytesPerSample;
  const extensible = fmtTag === EXTENSIBLE;
  const fmtSize = extensible ? 40 : 16;
  const headerSize = 12 + (8 + fmtSize) + 8;
  const out = new Uint8Array(headerSize + dataSize);
  const view = new DataView(out.buffer);

  writeAscii(out, 0, "RIFF");
  view.setUint32(4, out.length - 8, true);
  writeAscii(out, 8, "WAVE");

  writeAscii(out, 12, "fmt ");
  view.setUint32(16, fmtSize, true);
  view.setUint16(20, fmtTag, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bits, true);
  if (extensible) {
    view.setUint16(36, 22, true); // cbSize
    view.setUint16(38, bits, true); // validBitsPerSample
    view.setUint32(40, 0, true); // channelMask
    view.setUint16(44, opts.subFormat ?? PCM, true); // SubFormat GUID tag
  }

  const dataChunk = 12 + 8 + fmtSize;
  writeAscii(out, dataChunk, "data");
  view.setUint32(dataChunk + 4, dataSize, true);

  const dataStart = dataChunk + 8;
  for (let i = 0; i < samples.length; i++) {
    const pos = dataStart + i * bytesPerSample;
    const s = Math.max(-1, Math.min(1, samples[i]));
    if (storeAs === FLOAT) {
      view.setFloat32(pos, samples[i], true);
    } else if (bits === 8) {
      out[pos] = Math.round(s * 127) + 128;
    } else if (bits === 16) {
      view.setInt16(pos, Math.round(s * 0x7fff), true);
    } else if (bits === 24) {
      let v = Math.round(s * 0x7fffff);
      if (v < 0) v += 0x1000000;
      out[pos] = v & 0xff;
      out[pos + 1] = (v >> 8) & 0xff;
      out[pos + 2] = (v >> 16) & 0xff;
    } else {
      view.setInt32(pos, Math.round(s * 0x7fffffff), true);
    }
  }
  return out;
}

const RAMP = new Float32Array([-1, -0.5, -0.123, 0, 0.25, 0.5, 0.875, 0.999]);

function expectClose(got: Float32Array, want: Float32Array, eps: number): void {
  expect(got.length).toBe(want.length);
  for (let i = 0; i < want.length; i++) {
    expect(Math.abs(got[i] - want[i])).toBeLessThanOrEqual(eps);
  }
}

describe("parseWavBytes bit-depth coverage (pure-JS, all platforms)", () => {
  const cases: Array<{ name: string; bits: number; tag: number; eps: number }> = [
    { name: "8-bit PCM", bits: 8, tag: PCM, eps: 1 / 100 },
    { name: "16-bit PCM", bits: 16, tag: PCM, eps: 1 / 1000 },
    { name: "24-bit PCM", bits: 24, tag: PCM, eps: 1 / 100000 },
    { name: "32-bit PCM", bits: 32, tag: PCM, eps: 1 / 1000000 }
  ];

  for (const c of cases) {
    it(`decodes ${c.name}`, () => {
      const wav = buildWav({
        samples: RAMP,
        sampleRate: 16000,
        numChannels: 1,
        bits: c.bits,
        fmtTag: c.tag,
        storeAs: PCM
      });
      const decoded = parseWavBytes(wav);
      expect(decoded).not.toBeNull();
      expect(decoded!.sampleRate).toBe(16000);
      expect(decoded!.numChannels).toBe(1);
      expectClose(decoded!.samples, RAMP, c.eps);
    });
  }

  it("decodes 32-bit IEEE float (format 3)", () => {
    const wav = buildWav({
      samples: RAMP,
      sampleRate: 48000,
      numChannels: 1,
      bits: 32,
      fmtTag: FLOAT,
      storeAs: FLOAT
    });
    const decoded = parseWavBytes(wav);
    expect(decoded).not.toBeNull();
    expect(decoded!.sampleRate).toBe(48000);
    expectClose(decoded!.samples, RAMP, 1e-6);
  });

  it("unwraps WAVE_FORMAT_EXTENSIBLE to its PCM sub-format", () => {
    const wav = buildWav({
      samples: RAMP,
      sampleRate: 44100,
      numChannels: 1,
      bits: 16,
      fmtTag: EXTENSIBLE,
      storeAs: PCM,
      subFormat: PCM
    });
    const decoded = parseWavBytes(wav);
    expect(decoded).not.toBeNull();
    expect(decoded!.sampleRate).toBe(44100);
    expectClose(decoded!.samples, RAMP, 1 / 1000);
  });

  it("preserves channel interleaving for stereo input", () => {
    // L = +0.5 constant, R = -0.5 constant, interleaved.
    const stereo = new Float32Array([0.5, -0.5, 0.5, -0.5, 0.5, -0.5]);
    const wav = buildWav({
      samples: stereo,
      sampleRate: 48000,
      numChannels: 2,
      bits: 16,
      fmtTag: PCM,
      storeAs: PCM
    });
    const decoded = parseWavBytes(wav);
    expect(decoded).not.toBeNull();
    expect(decoded!.numChannels).toBe(2);
    expectClose(decoded!.samples, stereo, 1 / 1000);
  });

  it("returns null for an unsupported format (e.g. compressed-in-WAV)", () => {
    const wav = buildWav({
      samples: RAMP,
      sampleRate: 16000,
      numChannels: 1,
      bits: 16,
      fmtTag: 0x0011, // IMA ADPCM — not a format this decoder handles
      storeAs: PCM
    });
    expect(parseWavBytes(wav)).toBeNull();
  });
});
