/**
 * `absorb` on a local workspace copies the file in chunks. A multi-gigabyte
 * file must not be read into memory to be written back out.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, open, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStorageAdapter } from "@nodetool-ai/storage";
import { StorageWorkspace } from "../src/storage-workspace.js";

const SIZE = 192 * 1024 * 1024;
/** A read of the whole file would add at least SIZE here. */
const MAX_EXTRA_BYTES = 64 * 1024 * 1024;

/** A sparse file of `size` bytes with a marker at each end. */
async function sparseFile(path: string, size: number): Promise<void> {
  const handle = await open(path, "w");
  try {
    await handle.write(Buffer.from("HEAD"), 0, 4, 0);
    await handle.write(Buffer.from("TAIL"), 0, 4, size - 4);
  } finally {
    await handle.close();
  }
}

/** Run `work` and report the most external memory (Buffers) it ever held. */
async function peakBufferGrowth(work: () => Promise<void>): Promise<number> {
  const base = process.memoryUsage().arrayBuffers;
  let peak = base;
  const timer = setInterval(() => {
    peak = Math.max(peak, process.memoryUsage().arrayBuffers);
  }, 2);
  try {
    await work();
  } finally {
    clearInterval(timer);
  }
  return Math.max(peak, process.memoryUsage().arrayBuffers) - base;
}

describe("StorageWorkspace.absorb on a local folder", () => {
  let root: string;
  let source: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "absorb-stream-"));
    source = join(await mkdtemp(join(tmpdir(), "absorb-src-")), "big.bin");
    await sparseFile(source, SIZE);
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(join(source, ".."), { recursive: true, force: true });
  });

  it("copies a large file without holding it in memory", async () => {
    const workspace = new StorageWorkspace(new FileStorageAdapter(root));
    const growth = await peakBufferGrowth(() =>
      workspace.absorb(source, "footage/big.bin")
    );
    expect((await stat(join(root, "footage/big.bin"))).size).toBe(SIZE);
    const head = await readFile(join(root, "footage/big.bin"), {
      encoding: null
    }).then((b) => b.subarray(0, 4).toString());
    expect(head).toBe("HEAD");
    expect(growth).toBeLessThan(MAX_EXTRA_BYTES);
  });
});
