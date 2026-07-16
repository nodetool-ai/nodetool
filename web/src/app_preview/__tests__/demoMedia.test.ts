/**
 * @jest-environment jsdom
 */

import { makeDemoAudio } from "../demoMedia";

const decodeWav = (dataUri: string): { bytes: Uint8Array; dv: DataView } => {
  const base64 = dataUri.replace("data:audio/wav;base64,", "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { bytes, dv: new DataView(bytes.buffer) };
};

describe("makeDemoAudio", () => {
  it("returns a data URI with audio/wav base64 prefix", () => {
    const result = makeDemoAudio();
    expect(result).toMatch(/^data:audio\/wav;base64,/);
  });

  it("produces valid WAV header bytes", () => {
    const { bytes } = decodeWav(makeDemoAudio(0.1, 8000));
    const td = new TextDecoder("ascii");
    expect(td.decode(bytes.slice(0, 4))).toBe("RIFF");
    expect(td.decode(bytes.slice(8, 12))).toBe("WAVE");
    expect(td.decode(bytes.slice(12, 16))).toBe("fmt ");
    expect(td.decode(bytes.slice(36, 40))).toBe("data");
  });

  it("encodes PCM16 mono format", () => {
    const { dv } = decodeWav(makeDemoAudio(0.1, 8000));
    expect(dv.getUint16(20, true)).toBe(1);
    expect(dv.getUint16(22, true)).toBe(1);
    expect(dv.getUint16(34, true)).toBe(16);
  });

  it("respects the sample rate parameter", () => {
    const { dv } = decodeWav(makeDemoAudio(0.1, 44100));
    expect(dv.getUint32(24, true)).toBe(44100);
  });

  it("produces longer output for longer duration", () => {
    const short = makeDemoAudio(0.1, 8000);
    const long = makeDemoAudio(1.0, 8000);
    expect(long.length).toBeGreaterThan(short.length);
  });

  it("RIFF and data chunk sizes are consistent with total length", () => {
    const { bytes, dv } = decodeWav(makeDemoAudio(0.5, 16000));
    expect(dv.getUint32(4, true)).toBe(bytes.length - 8);
    expect(dv.getUint32(40, true)).toBe(bytes.length - 44);
  });
});
