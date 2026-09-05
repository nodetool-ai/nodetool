import { describe, expect, it } from "vitest";
import { encodeWavPcm16 } from "../src/midi/wav.js";

const ascii = (bytes: Uint8Array, from: number, length: number) =>
  String.fromCharCode(...bytes.slice(from, from + length));

const u32 = (bytes: Uint8Array, at: number) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    at,
    true
  );

const u16 = (bytes: Uint8Array, at: number) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(
    at,
    true
  );

const i16 = (bytes: Uint8Array, at: number) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt16(
    at,
    true
  );

describe("encodeWavPcm16", () => {
  it("writes a mono 16-bit PCM header", () => {
    const wav = encodeWavPcm16(new Float32Array(100), 48000);
    expect(ascii(wav, 0, 4)).toBe("RIFF");
    expect(ascii(wav, 8, 4)).toBe("WAVE");
    expect(ascii(wav, 12, 4)).toBe("fmt ");
    expect(ascii(wav, 36, 4)).toBe("data");
    expect(u32(wav, 16)).toBe(16); // fmt chunk size
    expect(u16(wav, 20)).toBe(1); // PCM
    expect(u16(wav, 22)).toBe(1); // channels
    expect(u32(wav, 24)).toBe(48000);
    expect(u32(wav, 28)).toBe(96000); // byte rate
    expect(u16(wav, 32)).toBe(2); // block align
    expect(u16(wav, 34)).toBe(16); // bits per sample
  });

  it("sizes the file and the data chunk from the sample count", () => {
    const wav = encodeWavPcm16(new Float32Array(100), 44100);
    expect(wav.length).toBe(44 + 200);
    expect(u32(wav, 40)).toBe(200);
    expect(u32(wav, 4)).toBe(36 + 200);
  });

  it("scales samples over the full signed range and clamps past it", () => {
    const wav = encodeWavPcm16(new Float32Array([0, 1, -1, 2, -2, 0.5]), 8000);
    expect(i16(wav, 44)).toBe(0);
    expect(i16(wav, 46)).toBe(32767);
    expect(i16(wav, 48)).toBe(-32768);
    expect(i16(wav, 50)).toBe(32767);
    expect(i16(wav, 52)).toBe(-32768);
    expect(i16(wav, 54)).toBe(Math.round(0.5 * 32767));
  });

  it("writes a header-only file for an empty buffer", () => {
    const wav = encodeWavPcm16(new Float32Array(0), 48000);
    expect(wav.length).toBe(44);
    expect(u32(wav, 40)).toBe(0);
  });
});
