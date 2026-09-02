/**
 * The RGBA plumbing between ffmpeg and the timeline compositor: frames are
 * sliced out of a byte stream that arrives in arbitrary chunks, a skipped
 * layer must not desync the stream, and a clip that outlives its media holds
 * its last frame. `spawn` is faked so no ffmpeg is involved.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";

interface FakeChild extends EventEmitter {
  stdout: PassThrough;
  stderr: PassThrough;
  stdin: Writable & { written: Buffer[] };
  kill: (signal?: string) => boolean;
}

let spawned: FakeChild[] = [];
let spawnArgs: string[][] = [];

function makeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  const written: Buffer[] = [];
  const stdin = new Writable({
    write(chunk, _enc, cb) {
      written.push(Buffer.from(chunk));
      cb();
    }
  }) as Writable & { written: Buffer[] };
  stdin.written = written;
  child.stdin = stdin;
  child.kill = () => true;
  return child;
}

vi.mock("node:child_process", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    spawn: (_cmd: string, args: string[]) => {
      const child = makeChild();
      spawned.push(child);
      spawnArgs.push([...args]);
      return child;
    }
  };
});

const { fitWithin, openFrameEncoder, openVideoFrameStream } = await import(
  "../src/nodes/timeline/rawFrames.js"
);

/** A 1×1 RGBA frame filled with `value`. */
function frame(value: number): Buffer {
  return Buffer.from([value, value, value, 255]);
}

beforeEach(() => {
  spawned = [];
  spawnArgs = [];
});

describe("fitWithin", () => {
  it("shrinks a source to fit the frame, keeping its aspect", () => {
    expect(fitWithin({ width: 3840, height: 2160 }, { width: 1920, height: 1080 }))
      .toEqual({ width: 1920, height: 1080 });
    expect(fitWithin({ width: 1000, height: 4000 }, { width: 1920, height: 1080 }))
      .toEqual({ width: 270, height: 1080 });
  });

  it("never upscales — a small source stays its own size", () => {
    expect(fitWithin({ width: 64, height: 64 }, { width: 1920, height: 1080 }))
      .toEqual({ width: 64, height: 64 });
  });
});

describe("openVideoFrameStream", () => {
  const open = () =>
    openVideoFrameStream({
      filePath: "/tmp/clip.mp4",
      size: { width: 1, height: 1 },
      fps: 30,
      startSec: 0,
      speed: 1
    });

  it("slices frames out of chunks that don't align with frame boundaries", async () => {
    const stream = open();
    const child = spawned[0];
    // Three frames delivered as two ragged chunks.
    const all = Buffer.concat([frame(1), frame(2), frame(3)]);
    child.stdout.write(all.subarray(0, 6));
    child.stdout.write(all.subarray(6));

    expect(await stream.frameAt(0)).toEqual(new Uint8Array(frame(1)));
    expect(await stream.frameAt(1)).toEqual(new Uint8Array(frame(2)));
    expect(await stream.frameAt(2)).toEqual(new Uint8Array(frame(3)));
  });

  it("waits for frames that have not been decoded yet", async () => {
    const stream = open();
    const child = spawned[0];
    const pending = stream.frameAt(0);
    child.stdout.write(frame(7));
    expect(await pending).toEqual(new Uint8Array(frame(7)));
  });

  it("drops the frames of a skipped index instead of desyncing", async () => {
    const stream = open();
    const child = spawned[0];
    child.stdout.write(Buffer.concat([frame(1), frame(2), frame(3)]));

    // Frames 0 and 1 are never asked for (the layer was skipped).
    expect(await stream.frameAt(2)).toEqual(new Uint8Array(frame(3)));
  });

  it("holds the last frame once the source runs out", async () => {
    const stream = open();
    const child = spawned[0];
    child.stdout.write(frame(9));
    child.stdout.end();

    expect(await stream.frameAt(0)).toEqual(new Uint8Array(frame(9)));
    expect(await stream.frameAt(5)).toEqual(new Uint8Array(frame(9)));
  });

  it("reports a decode failure with ffmpeg's own message", async () => {
    const stream = open();
    const child = spawned[0];
    child.stderr.write("moov atom not found");
    child.stdout.end();
    child.emit("close", 1);

    await expect(stream.frameAt(0)).rejects.toThrow(/moov atom not found/);
  });
});

describe("openFrameEncoder", () => {
  it("writes each composited frame to the encoder and finalizes on exit 0", async () => {
    const encoder = openFrameEncoder({
      outPath: "/tmp/out.mp4",
      width: 1,
      height: 1,
      fps: 30
    });
    const child = spawned[0];

    await encoder.write(new Uint8Array(frame(1)));
    await encoder.write(new Uint8Array(frame(2)));
    const done = encoder.finish();
    child.emit("close", 0);
    await done;

    expect(Buffer.concat(child.stdin.written)).toEqual(
      Buffer.concat([frame(1), frame(2)])
    );
  });

  it("defaults to H.264 at yuv420p, which drops the alpha channel", () => {
    openFrameEncoder({ outPath: "/tmp/out.mp4", width: 2, height: 2, fps: 30 });
    expect(spawnArgs[0]).toEqual(
      expect.arrayContaining(["-c:v", "libx264", "-pix_fmt", "yuv420p"])
    );
  });

  it("passes the alpha-carrying encoder arguments through verbatim", () => {
    openFrameEncoder({
      outPath: "/tmp/out.webm",
      width: 2,
      height: 2,
      fps: 30,
      encoderArgs: ["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p"]
    });
    const args = spawnArgs[0];
    expect(args).toEqual(
      expect.arrayContaining(["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p"])
    );
    // The RGBA the compositor writes is still what goes in; only the output
    // pixel format changed.
    expect(args.slice(0, args.indexOf("-i"))).toEqual(
      expect.arrayContaining(["-f", "rawvideo", "-pix_fmt", "rgba"])
    );
    expect(args).not.toContain("libx264");
  });

  it("fails with ffmpeg's message when the encode exits non-zero", async () => {
    const encoder = openFrameEncoder({
      outPath: "/tmp/out.mp4",
      width: 1,
      height: 1,
      fps: 30
    });
    const child = spawned[0];
    child.stderr.write("height not divisible by 2");
    const done = encoder.finish();
    child.emit("close", 1);

    await expect(done).rejects.toThrow(/height not divisible by 2/);
  });
});
