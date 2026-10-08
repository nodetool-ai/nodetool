/**
 * The stdio frame decoder must cost linear time in the frame size. It used to
 * concatenate its whole buffer with every pipe chunk, so a 32 MB frame read
 * in 64 KiB chunks copied about 8 GB and stalled the server for seconds.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

import {
  FrameDecoder,
  FrameSizeError,
  encodeFrame
} from "../src/python-bridge-framing.js";

function chunked(buffer: Buffer, size: number): Buffer[] {
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < buffer.length; offset += size) {
    chunks.push(buffer.subarray(offset, offset + size));
  }
  return chunks;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FrameDecoder", () => {
  it("reassembles frames split at every byte, including the length prefix", () => {
    const a = Buffer.from("first payload");
    const b = Buffer.from("second");
    const wire = Buffer.concat([encodeFrame(a), encodeFrame(b)]);
    const decoder = new FrameDecoder();
    const frames: string[] = [];
    for (const piece of chunked(wire, 1)) {
      decoder.push(piece, (frame) => frames.push(frame.toString()));
    }
    expect(frames).toEqual(["first payload", "second"]);
  });

  it("extracts several frames from one chunk and keeps the remainder", () => {
    const wire = Buffer.concat([
      encodeFrame(Buffer.from("one")),
      encodeFrame(Buffer.from("two")),
      encodeFrame(Buffer.from("three"))
    ]);
    const decoder = new FrameDecoder();
    const frames: string[] = [];
    decoder.push(wire.subarray(0, wire.length - 2), (f) =>
      frames.push(f.toString())
    );
    expect(frames).toEqual(["one", "two"]);
    decoder.push(wire.subarray(wire.length - 2), (f) =>
      frames.push(f.toString())
    );
    expect(frames).toEqual(["one", "two", "three"]);
  });

  it("handles an empty frame", () => {
    const decoder = new FrameDecoder();
    const frames: Buffer[] = [];
    decoder.push(encodeFrame(Buffer.alloc(0)), (f) => frames.push(f));
    expect(frames).toHaveLength(1);
    expect(frames[0]!.length).toBe(0);
  });

  it("copies a large frame a bounded number of times", () => {
    const size = 8 * 1024 * 1024;
    const payload = Buffer.alloc(size, 7);
    const wire = encodeFrame(payload);
    const concat = vi.spyOn(Buffer, "concat");
    const decoder = new FrameDecoder();
    const frames: Buffer[] = [];
    for (const piece of chunked(wire, 64 * 1024)) {
      decoder.push(piece, (f) => frames.push(f));
    }
    const copied = concat.mock.calls.reduce(
      (total, [list]) =>
        total + (list as Buffer[]).reduce((n, b) => n + b.length, 0),
      0
    );
    expect(frames).toHaveLength(1);
    expect(frames[0]!.equals(payload)).toBe(true);
    // One concat of the whole frame. The old decoder copied ~size²/chunk.
    expect(copied).toBeLessThanOrEqual(2 * wire.length);
  });

  it("throws FrameSizeError for an oversized declared length", () => {
    const decoder = new FrameDecoder({ maxFrameSize: 10 });
    const frames: string[] = [];
    const wire = Buffer.concat([
      encodeFrame(Buffer.from("ok")),
      encodeFrame(Buffer.alloc(11))
    ]);
    expect(() => decoder.push(wire, (f) => frames.push(f.toString()))).toThrow(
      FrameSizeError
    );
    expect(frames).toEqual(["ok"]);
  });

  it("reset drops a buffered partial frame", () => {
    const decoder = new FrameDecoder();
    const frames: string[] = [];
    decoder.push(encodeFrame(Buffer.from("partial")).subarray(0, 6), (f) =>
      frames.push(f.toString())
    );
    decoder.reset();
    decoder.push(encodeFrame(Buffer.from("fresh")), (f) =>
      frames.push(f.toString())
    );
    expect(frames).toEqual(["fresh"]);
  });
});
