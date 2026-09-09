import { describe, it, expect } from "vitest";
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
