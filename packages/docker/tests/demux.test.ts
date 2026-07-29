import { describe, it, expect } from "vitest";
import { PassThrough } from "node:stream";
import {
  DockerStreamDemuxer,
  demuxDockerStream,
  type DemuxFrame
} from "../src/demux.js";

function frame(streamType: number, payload: string): Buffer {
  const body = Buffer.from(payload, "utf8");
  const header = Buffer.alloc(8);
  header[0] = streamType;
  header.writeUInt32BE(body.length, 4);
  return Buffer.concat([header, body]);
}

describe("DockerStreamDemuxer", () => {
  it("parses a single stdout frame", () => {
    const demuxer = new DockerStreamDemuxer();
    const frames = demuxer.push(frame(1, "hello\n"));
    expect(frames).toEqual([["stdout", Buffer.from("hello\n")]]);
    expect(demuxer.pending).toBe(0);
  });

  it("distinguishes stdout from stderr", () => {
    const demuxer = new DockerStreamDemuxer();
    const frames = demuxer.push(
      Buffer.concat([frame(1, "out"), frame(2, "err")])
    );
    expect(frames.map(([slot]) => slot)).toEqual(["stdout", "stderr"]);
    expect(frames.map(([, buf]) => buf.toString())).toEqual(["out", "err"]);
  });

  it("parses multiple frames arriving in one chunk", () => {
    const demuxer = new DockerStreamDemuxer();
    const frames = demuxer.push(
      Buffer.concat([frame(1, "a"), frame(1, "b"), frame(2, "c")])
    );
    expect(frames).toHaveLength(3);
    expect(frames[2]).toEqual(["stderr", Buffer.from("c")]);
  });

  it("reassembles a frame split across chunks (payload split)", () => {
    const demuxer = new DockerStreamDemuxer();
    const whole = frame(1, "split-payload");
    const first = demuxer.push(whole.subarray(0, 12));
    expect(first).toEqual([]);
    const second = demuxer.push(whole.subarray(12));
    expect(second).toEqual([["stdout", Buffer.from("split-payload")]]);
  });

  it("reassembles a frame whose 8-byte header is split across chunks", () => {
    const demuxer = new DockerStreamDemuxer();
    const whole = frame(2, "hdr");
    expect(demuxer.push(whole.subarray(0, 3))).toEqual([]);
    expect(demuxer.push(whole.subarray(3, 7))).toEqual([]);
    expect(demuxer.push(whole.subarray(7))).toEqual([
      ["stderr", Buffer.from("hdr")]
    ]);
  });

  it("handles a chunk ending mid-frame followed by more frames", () => {
    const demuxer = new DockerStreamDemuxer();
    const combined = Buffer.concat([frame(1, "one"), frame(2, "two")]);
    const cut = 8 + 2; // inside the first payload
    const first = demuxer.push(combined.subarray(0, cut));
    expect(first).toEqual([]);
    const second = demuxer.push(combined.subarray(cut));
    expect(second).toEqual([
      ["stdout", Buffer.from("one")],
      ["stderr", Buffer.from("two")]
    ]);
  });

  it("drops frames with unknown stream types", () => {
    const demuxer = new DockerStreamDemuxer();
    const frames = demuxer.push(
      Buffer.concat([frame(0, "stdin-echo"), frame(1, "kept")])
    );
    expect(frames).toEqual([["stdout", Buffer.from("kept")]]);
  });

  it("handles zero-length payloads", () => {
    const demuxer = new DockerStreamDemuxer();
    const frames = demuxer.push(Buffer.concat([frame(1, ""), frame(2, "x")]));
    expect(frames).toEqual([
      ["stdout", Buffer.alloc(0)],
      ["stderr", Buffer.from("x")]
    ]);
  });
});

describe("demuxDockerStream", () => {
  async function collect(
    iterable: AsyncGenerator<DemuxFrame, void>
  ): Promise<Array<[string, string]>> {
    const out: Array<[string, string]> = [];
    for await (const [slot, payload] of iterable) {
      out.push([slot, payload.toString("utf8")]);
    }
    return out;
  }

  it("demuxes frames from a readable stream across chunk boundaries", async () => {
    const stream = new PassThrough();
    const collected = collect(demuxDockerStream(stream));

    const combined = Buffer.concat([
      frame(1, "line one\n"),
      frame(2, "warning\n"),
      frame(1, "line two\n")
    ]);
    // Write in awkward chunk sizes to exercise reassembly.
    stream.write(combined.subarray(0, 5));
    stream.write(combined.subarray(5, 27));
    stream.end(combined.subarray(27));

    expect(await collected).toEqual([
      ["stdout", "line one\n"],
      ["stderr", "warning\n"],
      ["stdout", "line two\n"]
    ]);
  });

  it("ends the iteration on stream error instead of throwing", async () => {
    const stream = new PassThrough();
    const collected = collect(demuxDockerStream(stream));
    stream.write(frame(1, "before error\n"));
    // Give the consumer a tick to pull the first chunk, then error.
    await new Promise((resolve) => setImmediate(resolve));
    stream.destroy(new Error("socket reset"));
    expect(await collected).toEqual([["stdout", "before error\n"]]);
  });
});
