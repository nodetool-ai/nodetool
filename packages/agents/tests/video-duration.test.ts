/**
 * Tests for the MP4 movie-header duration probe.
 *
 * The probe exists because a video model quantizes the length it is asked for
 * (1.5s directed, 5.184s delivered) and nothing recorded the difference. It
 * reads the container header only, so these fixtures are hand-built boxes.
 */

import { describe, it, expect } from "vitest";
import { mp4DurationSeconds } from "../src/utils/video-duration.js";
import { renderedVideoRef } from "../src/capabilities/storyboards.js";

function box(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length);
  new DataView(out.buffer).setUint32(0, out.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(payload, 8);
  return out;
}

function mvhdV0(timescale: number, duration: number): Uint8Array {
  const payload = new Uint8Array(100);
  const view = new DataView(payload.buffer);
  view.setUint8(0, 0); // version 0
  view.setUint32(12, timescale);
  view.setUint32(16, duration);
  return box("mvhd", payload);
}

function mvhdV1(timescale: number, duration: number): Uint8Array {
  const payload = new Uint8Array(112);
  const view = new DataView(payload.buffer);
  view.setUint8(0, 1); // version 1
  view.setUint32(20, timescale);
  view.setUint32(24, Math.floor(duration / 2 ** 32));
  view.setUint32(28, duration >>> 0);
  return box("mvhd", payload);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const ftyp = box("ftyp", new Uint8Array(16));
const mdat = box("mdat", new Uint8Array(64));

describe("mp4DurationSeconds", () => {
  it("reads the length a model actually delivered", () => {
    const file = concat(ftyp, mdat, box("moov", mvhdV0(1000, 5184)));
    expect(mp4DurationSeconds(file)).toBeCloseTo(5.184, 5);
  });

  it("reads a 64-bit movie header", () => {
    const file = concat(ftyp, box("moov", mvhdV1(600, 3110)));
    expect(mp4DurationSeconds(file)).toBeCloseTo(3110 / 600, 5);
  });

  it("finds a moov that sits after the payload", () => {
    const file = concat(ftyp, mdat, mdat, box("moov", mvhdV0(24, 125)));
    expect(mp4DurationSeconds(file)).toBeCloseTo(125 / 24, 5);
  });

  it("returns null rather than zero for bytes it cannot read", () => {
    expect(mp4DurationSeconds(new Uint8Array(0))).toBeNull();
    expect(mp4DurationSeconds(new Uint8Array([1, 2, 3, 4, 5]))).toBeNull();
    expect(mp4DurationSeconds(concat(ftyp, mdat))).toBeNull();
    // A moov with no movie header, and a header claiming zero length.
    expect(mp4DurationSeconds(concat(ftyp, box("moov", new Uint8Array(8))))).toBeNull();
    expect(mp4DurationSeconds(concat(ftyp, box("moov", mvhdV0(1000, 0))))).toBeNull();
  });

  it("does not loop forever on a box that declares an impossible size", () => {
    const bad = new Uint8Array(16);
    new DataView(bad.buffer).setUint32(0, 2); // smaller than its own header
    expect(mp4DurationSeconds(bad)).toBeNull();
  });
});

describe("renderedVideoRef", () => {
  const saved = (output: unknown) => ({
    assetId: "asset-1",
    uri: "asset://asset-1.mp4",
    output
  });

  it("stamps the length the model actually returned", () => {
    const bytes = concat(ftyp, box("moov", mvhdV0(1000, 5184)));
    expect(renderedVideoRef(saved(bytes))).toEqual({
      type: "video",
      asset_id: "asset-1",
      uri: "asset://asset-1.mp4",
      duration: 5.184
    });
  });

  it("leaves duration unset when the bytes say nothing", () => {
    // A provider that hands back a URL rather than bytes, or a container the
    // header probe cannot read: unknown stays unknown, never zero.
    expect(renderedVideoRef(saved("https://example.test/a.mp4")).duration).toBeUndefined();
    expect(renderedVideoRef(saved(concat(ftyp, mdat))).duration).toBeUndefined();
  });
});
