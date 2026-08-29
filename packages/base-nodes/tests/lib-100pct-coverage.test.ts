/**
 * Targeted tests to reach 100% statement coverage on all lib-* files.
 * Covers edge cases, mocked external services, and alternative code paths.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  // lib-pedalboard-extra
  PitchShiftNode,
  TimeStretchNode,
  // lib-ytdlp
  YtDlpDownloadLibNode,
  // lib-audio-dsp
  GainNode_,
  // lib-grid
  SliceImageGridLibNode,
} from "../src/index.js";

// ── WAV helper: create WAV with configurable bits/channels ──────

function makeWav(opts: {
  sampleRate?: number;
  bitsPerSample?: 8 | 16;
  numChannels?: number;
  durationSec?: number;
  freq?: number;
}): Buffer {
  const sampleRate = opts.sampleRate ?? 22050;
  const bitsPerSample = opts.bitsPerSample ?? 16;
  const numChannels = opts.numChannels ?? 1;
  const durationSec = opts.durationSec ?? 0.1;
  const freq = opts.freq ?? 440;
  const frameSamples = Math.floor(sampleRate * durationSec);
  const totalSamples = frameSamples * numChannels;
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = totalSamples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < totalSamples; i++) {
    const frameIdx = Math.floor(i / numChannels);
    const sample = Math.sin((2 * Math.PI * freq * frameIdx) / sampleRate);
    const pos = 44 + i * bytesPerSample;
    if (bitsPerSample === 16) {
      buffer.writeInt16LE(Math.round(sample * 0x7fff * 0.5), pos);
    } else {
      buffer.writeUInt8(Math.round((sample * 0.5 + 1) * 128), pos);
    }
  }
  return buffer;
}

function audioRef(buf: Buffer): Record<string, unknown> {
  return { type: "audio", uri: "", data: buf.toString("base64") };
}

// ── Minimal PDF builder ─────────────────────────────────────────

function buildMinimalPdf(
  items: Array<{ text: string; x: number; y: number; fontSize?: number }>
): Uint8Array {
  // Build a minimal valid PDF with text items
  const fontSize = 12;
  const textOps = items
    .map((item) => {
      const fs = item.fontSize ?? fontSize;
      return `BT /F1 ${fs} Tf ${item.x} ${item.y} Td (${item.text}) Tj ET`;
    })
    .join("\n");

  const stream = `${textOps}\n`;
  const streamLen = Buffer.byteLength(stream, "ascii");

  const objs = [
    // obj 1: catalog
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`,
    // obj 2: pages
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj`,
    // obj 3: page
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj`,
    // obj 4: content stream
    `4 0 obj\n<< /Length ${streamLen} >>\nstream\n${stream}endstream\nendobj`,
    // obj 5: font
    `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`
  ];

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const obj of objs) {
    offsets.push(Buffer.byteLength(body, "ascii"));
    body += obj + "\n";
  }

  const xrefOffset = Buffer.byteLength(body, "ascii");
  body += `xref\n0 ${objs.length + 1}\n`;
  body += `0000000000 65535 f \n`;
  for (const off of offsets) {
    body += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\n`;
  body += `startxref\n${xrefOffset}\n%%EOF\n`;

  return new Uint8Array(Buffer.from(body, "ascii"));
}

// ── lib-pedalboard-extra: 8-bit WAV + >2 channel paths ─────────

describe("lib-pedalboard-extra coverage", () => {
  it("PitchShift with 8-bit WAV", async () => {
    const wav = makeWav({ bitsPerSample: 8, durationSec: 0.2, numChannels: 1 });
    const result = await new PitchShiftNode({
      audio: audioRef(wav),
      semitones: 2
    }).process();
    const output = result.output as Record<string, unknown>;
    expect(output).toHaveProperty("data");
  });

  it("PitchShift with >2 channel WAV (takes first 2 channels)", async () => {
    const wav = makeWav({ numChannels: 3, durationSec: 0.2 });
    const result = await new PitchShiftNode({
      audio: audioRef(wav),
      semitones: 3
    }).process();
    const output = result.output as Record<string, unknown>;
    expect(output).toHaveProperty("data");
  });

  it("PitchShift with stereo WAV", async () => {
    const wav = makeWav({ numChannels: 2, durationSec: 0.2 });
    const result = await new PitchShiftNode({
      audio: audioRef(wav),
      semitones: -2
    }).process();
    const output = result.output as Record<string, unknown>;
    expect(output).toHaveProperty("data");
  });

  it("TimeStretch with >2 channel WAV", async () => {
    const wav = makeWav({ numChannels: 3, durationSec: 0.2 });
    const result = await new TimeStretchNode({
      audio: audioRef(wav),
      rate: 1.5
    }).process();
    const output = result.output as Record<string, unknown>;
    expect(output).toHaveProperty("data");
  });

  it("TimeStretch with stereo WAV", async () => {
    const wav = makeWav({ numChannels: 2, durationSec: 0.2 });
    const result = await new TimeStretchNode({
      audio: audioRef(wav),
      rate: 0.8
    }).process();
    const output = result.output as Record<string, unknown>;
    expect(output).toHaveProperty("data");
  });

  it("TimeStretch with mono WAV", async () => {
    const wav = makeWav({ numChannels: 1, durationSec: 0.2 });
    const result = await new TimeStretchNode({
      audio: audioRef(wav),
      rate: 1.5
    }).process();
    const output = result.output as Record<string, unknown>;
    expect(output).toHaveProperty("data");
  });
});

// ── lib-ytdlp: runCommand timeout and error paths ────────────────

describe("lib-ytdlp runCommand coverage", () => {
  it("runCommand handles spawn error for nonexistent binary", async () => {
    const origPath = process.env.PATH;
    process.env.PATH = "/nonexistent";
    try {
      await expect(
        new YtDlpDownloadLibNode({
          url: "https://example.com/video"
        }).process()
      ).rejects.toThrow();
    } finally {
      process.env.PATH = origPath;
    }
  }, 15_000);

  // Note: timeout/timedOut paths (lines 21-22, 38-40) require a child process
  // that sleeps longer than the timeout, which is inherently slow to test.
  // Those 5 lines remain uncovered to avoid flaky/slow tests.
});

// ── lib-audio-dsp: 8-bit WAV decode path ─────────────────────────

describe("lib-audio-dsp 8-bit WAV coverage", () => {
  it("Gain with 8-bit WAV input", async () => {
    const wav = makeWav({ bitsPerSample: 8, durationSec: 0.1 });
    const result = await new GainNode_({
      audio: audioRef(wav),
      gain_db: 6.0
    }).process();
    const output = result.output as Record<string, unknown>;
    expect(output).toHaveProperty("data");
  });

  it("Gain with WAV that has extra chunks before data", async () => {
    // Create WAV with an extra chunk before data
    const sampleRate = 22050;
    const numSamples = 100;
    const dataSize = numSamples * 2;
    const extraChunkSize = 16;
    const totalFileSize = 36 + 8 + extraChunkSize + 8 + dataSize;

    const buf = Buffer.alloc(8 + totalFileSize);
    buf.write("RIFF", 0);
    buf.writeUInt32LE(totalFileSize, 4);
    buf.write("WAVE", 8);
    buf.write("fmt ", 12);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(sampleRate * 2, 28);
    buf.writeUInt16LE(2, 32);
    buf.writeUInt16LE(16, 34);
    // Extra "LIST" chunk
    buf.write("LIST", 36);
    buf.writeUInt32LE(extraChunkSize, 40);
    // data chunk
    const dOff = 36 + 8 + extraChunkSize;
    buf.write("data", dOff);
    buf.writeUInt32LE(dataSize, dOff + 4);
    for (let i = 0; i < numSamples; i++) {
      buf.writeInt16LE(Math.round(Math.sin(i * 0.1) * 16000), dOff + 8 + i * 2);
    }

    const result = await new GainNode_({
      audio: audioRef(buf),
      gain_db: 3.0
    }).process();
    const output = result.output as Record<string, unknown>;
    expect(output).toHaveProperty("data");
  });
});

// ── lib-grid: edge cases ─────────────────────────────────────────

describe("lib-grid coverage", () => {
  it("SliceImageGrid with null/undefined data returns error", async () => {
    await expect(
      new SliceImageGridLibNode({ image: null }).process()
    ).rejects.toThrow("Image input is required.");
  });

  it("SliceImageGrid with Uint8Array data", async () => {
    const sharp = (await import("sharp")).default;
    const pngBuf = await sharp({
      create: {
        width: 6,
        height: 6,
        channels: 3,
        background: { r: 128, g: 128, b: 128 }
      }
    })
      .png()
      .toBuffer();

    const result = await new SliceImageGridLibNode({
      image: { data: new Uint8Array(pngBuf) },
      columns: 2,
      rows: 2
    }).process();
    const output = result.output as unknown[];
    expect(Array.isArray(output)).toBe(true);
    expect(output.length).toBe(4);
  });
});
