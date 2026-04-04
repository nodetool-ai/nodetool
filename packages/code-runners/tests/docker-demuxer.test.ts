import { describe, it, expect, vi } from "vitest";
import { DockerHijackMultiplexDemuxer } from "../src/docker-demuxer.js";
import type { Socket } from "node:net";

/** Build a valid Docker multiplex frame. */
function makeFrame(streamType: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header[0] = streamType;
  // bytes 1-3 are padding (zero)
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

function makeSocket(): Socket {
  return { write: vi.fn(), end: vi.fn() } as unknown as Socket;
}

describe("DockerHijackMultiplexDemuxer", () => {
  // ---- feedData + drain ---------------------------------------------------

  it("drains a stdout frame", () => {
    const demuxer = new DockerHijackMultiplexDemuxer(makeSocket());
    demuxer.feedData(makeFrame(1, Buffer.from("hello\n")));
    const frames = demuxer.drain();
    expect(frames).toHaveLength(1);
    expect(frames[0][0]).toBe("stdout");
    expect(frames[0][1].toString()).toBe("hello\n");
  });

  it("drains a stderr frame", () => {
    const demuxer = new DockerHijackMultiplexDemuxer(makeSocket());
    demuxer.feedData(makeFrame(2, Buffer.from("error msg")));
    const frames = demuxer.drain();
    expect(frames).toHaveLength(1);
    expect(frames[0][0]).toBe("stderr");
    expect(frames[0][1].toString()).toBe("error msg");
  });

  it("drains multiple frames preserving order", () => {
    const demuxer = new DockerHijackMultiplexDemuxer(makeSocket());
    demuxer.feedData(makeFrame(1, Buffer.from("line1")));
    demuxer.feedData(makeFrame(2, Buffer.from("line2")));
    demuxer.feedData(makeFrame(1, Buffer.from("line3")));
    const frames = demuxer.drain();
    expect(frames).toHaveLength(3);
    expect(frames[0][0]).toBe("stdout");
    expect(frames[1][0]).toBe("stderr");
    expect(frames[2][0]).toBe("stdout");
    expect(frames[0][1].toString()).toBe("line1");
    expect(frames[1][1].toString()).toBe("line2");
    expect(frames[2][1].toString()).toBe("line3");
  });

  it("returns empty array when fewer than 8 bytes available", () => {
    const demuxer = new DockerHijackMultiplexDemuxer(makeSocket());
    demuxer.feedData(Buffer.from([1, 0, 0, 0, 0])); // only 5 bytes
    expect(demuxer.drain()).toHaveLength(0);
  });

  it("does not drain a frame when payload is incomplete", () => {
    const demuxer = new DockerHijackMultiplexDemuxer(makeSocket());
    const header = Buffer.alloc(8);
    header[0] = 1;
    header.writeUInt32BE(10, 4); // declares 10-byte payload
    demuxer.feedData(Buffer.concat([header, Buffer.from("hello")])); // only 5 bytes
    expect(demuxer.drain()).toHaveLength(0);
  });

  it("ignores unknown stream types (not 1 or 2)", () => {
    const demuxer = new DockerHijackMultiplexDemuxer(makeSocket());
    demuxer.feedData(makeFrame(0, Buffer.from("stdin data")));
    demuxer.feedData(makeFrame(3, Buffer.from("unknown")));
    expect(demuxer.drain()).toHaveLength(0);
  });

  it("handles empty payload frame", () => {
    const demuxer = new DockerHijackMultiplexDemuxer(makeSocket());
    demuxer.feedData(makeFrame(1, Buffer.alloc(0)));
    const frames = demuxer.drain();
    expect(frames).toHaveLength(1);
    expect(frames[0][1].length).toBe(0);
  });

  it("accumulates data across multiple feedData calls", () => {
    const demuxer = new DockerHijackMultiplexDemuxer(makeSocket());
    const frame = makeFrame(1, Buffer.from("hello"));
    // Feed in two chunks split at byte 4
    demuxer.feedData(frame.subarray(0, 4));
    expect(demuxer.drain()).toHaveLength(0);
    demuxer.feedData(frame.subarray(4));
    const frames = demuxer.drain();
    expect(frames).toHaveLength(1);
    expect(frames[0][1].toString()).toBe("hello");
  });

  it("drain empties the buffer so a second call returns nothing", () => {
    const demuxer = new DockerHijackMultiplexDemuxer(makeSocket());
    demuxer.feedData(makeFrame(1, Buffer.from("data")));
    demuxer.drain();
    expect(demuxer.drain()).toHaveLength(0);
  });

  it("handles frames with binary payload", () => {
    const demuxer = new DockerHijackMultiplexDemuxer(makeSocket());
    const payload = Buffer.from([0x00, 0x01, 0xff, 0xfe]);
    demuxer.feedData(makeFrame(1, payload));
    const frames = demuxer.drain();
    expect(frames[0][1]).toEqual(payload);
  });

  // ---- iterFrames ---------------------------------------------------------

  it("iterFrames yields same results as drain", () => {
    const demuxer = new DockerHijackMultiplexDemuxer(makeSocket());
    demuxer.feedData(makeFrame(1, Buffer.from("out")));
    demuxer.feedData(makeFrame(2, Buffer.from("err")));
    const frames = [...demuxer.iterFrames()];
    expect(frames).toHaveLength(2);
    expect(frames[0][0]).toBe("stdout");
    expect(frames[1][0]).toBe("stderr");
    expect(frames[0][1].toString()).toBe("out");
    expect(frames[1][1].toString()).toBe("err");
  });

  it("iterFrames returns empty iterator when no data", () => {
    const demuxer = new DockerHijackMultiplexDemuxer(makeSocket());
    const frames = [...demuxer.iterFrames()];
    expect(frames).toHaveLength(0);
  });

  // ---- send / closeStdin --------------------------------------------------

  it("send calls socket.write with the provided buffer", () => {
    const sock = makeSocket();
    const demuxer = new DockerHijackMultiplexDemuxer(sock);
    const data = Buffer.from("input data");
    demuxer.send(data);
    expect(sock.write).toHaveBeenCalledWith(data);
  });

  it("closeStdin calls socket.end", () => {
    const sock = makeSocket();
    const demuxer = new DockerHijackMultiplexDemuxer(sock);
    demuxer.closeStdin();
    expect(sock.end).toHaveBeenCalled();
  });

  it("closeStdin does not throw if socket.end throws", () => {
    const sock = {
      write: vi.fn(),
      end: vi.fn().mockImplementation(() => {
        throw new Error("socket already closed");
      })
    } as unknown as Socket;
    const demuxer = new DockerHijackMultiplexDemuxer(sock);
    expect(() => demuxer.closeStdin()).not.toThrow();
  });
});
