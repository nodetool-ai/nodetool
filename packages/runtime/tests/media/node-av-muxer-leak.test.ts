/**
 * node-av 6.1.1 leaks a file descriptor on every `Muxer.open(path)` and
 * `close()`, plus 100–300 KB of native memory. An open, decode, encode and
 * close loop dies with EMFILE ("Too many open files") at about 19,500
 * iterations under a 20,000-descriptor limit. That loop is the native
 * crash risk R6 in docs/ffmpeg-in-process-plan.md was describing.
 *
 * The repro is skipped: it documents the upstream bug and fails while the bug
 * exists. The second test pins the workaround the media module uses, a muxer
 * over IO callbacks on a handle the module owns.
 */

import { readdirSync } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { Demuxer, Muxer } from "node-av";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openFileMuxer } from "../../src/media/av.js";
import { generateMedia } from "../../src/media/testing.js";

const ITERATIONS = 200;
let dir: string;
let source: string;

const openDescriptors = (): number => readdirSync("/proc/self/fd").length;

/** Copy `source`'s video into a fresh file through `open`, `ITERATIONS` times. */
async function remuxLoop(
  open: (outPath: string) => Promise<{ muxer: Muxer; close(): Promise<void> }>
): Promise<number> {
  const outPath = path.join(dir, "out.mp4");
  const before = openDescriptors();
  for (let i = 0; i < ITERATIONS; i++) {
    const input = await Demuxer.open(source);
    const output = await open(outPath);
    const stream = input.video();
    if (!stream) throw new Error("The fixture has no video");
    const index = output.muxer.addStream(stream);
    for await (const packet of input.packets(stream.index)) {
      if (packet) await output.muxer.writePacket(packet, index);
    }
    await output.close();
    await input.close();
  }
  return openDescriptors() - before;
}

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-muxer-leak-"));
  source = path.join(dir, "source.mp4");
  await generateMedia({
    outPath: source,
    video: { source: "testsrc2=size=64x48:rate=10:duration=0.5" }
  });
});

afterAll(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true });
});

const linux = process.platform === "linux";

describe("node-av muxer descriptor leak", () => {
  it.skip("Muxer.open(path) closes its file (upstream bug, fails on node-av 6.1.1)", async () => {
    const leaked = await remuxLoop(async (outPath) => {
      const muxer = await Muxer.open(outPath);
      return { muxer, close: () => muxer.close() };
    });
    expect(leaked).toBeLessThan(5);
  });

  it.skipIf(!linux)("openFileMuxer closes its file", async () => {
    const leaked = await remuxLoop((outPath) => openFileMuxer(outPath, { format: "mp4" }));
    expect(leaked).toBeLessThan(5);
  });
});
