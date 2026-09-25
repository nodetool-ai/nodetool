/**
 * `ProcessingContext.localPath` resolves asset references the way
 * `resolveAssetBytes` does, but returns a file on this host instead of bytes.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FileStorageAdapter,
  InMemoryStorageAdapter
} from "@nodetool-ai/storage";
import { ProcessingContext } from "../src/context.js";

const USER = "user-7";
const ID = "0192a7f3c4e5b6d7a8f9e0c1b2d3e4f5";

let tmp: string;
let root: string;

beforeEach(async () => {
  tmp = await realpath(await mkdtemp(join(tmpdir(), "ctx-local-path-")));
  root = join(tmp, "assets");
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("ProcessingContext.localPath", () => {
  it("finds a managed file by exact key, bare id, and mismatched extension", async () => {
    const assetStorage = new FileStorageAdapter(root);
    await assetStorage.store(`${USER}/${ID}.mp4`, new Uint8Array([1, 2, 3]));
    const ctx = new ProcessingContext({
      jobId: "j1",
      userId: USER,
      assetStorage
    });
    const expected = join(root, USER, `${ID}.mp4`);

    expect(await ctx.localPath(`asset://${ID}.mp4`)).toBe(expected);
    expect(await ctx.localPath(ID)).toBe(expected);
    expect(await ctx.localPath(`asset://${ID}.mov`)).toBe(expected);
    expect(await ctx.localPath(`/api/storage/${USER}/${ID}.mp4`)).toBe(
      expected
    );
  });

  it("finds an external asset's in-place file through the adapter lookup", async () => {
    const external = join(tmp, "media", "long take.mov");
    await mkdir(join(tmp, "media"), { recursive: true });
    await writeFile(external, "movie");
    const assetStorage = new FileStorageAdapter(root, {
      externalPathLookup: async (key) =>
        key === `${USER}/${ID}` || key === `${USER}/${ID}.mov`
          ? external
          : null
    });
    const ctx = new ProcessingContext({
      jobId: "j1",
      userId: USER,
      assetStorage
    });

    expect(await ctx.localPath(ID)).toBe(external);
    expect(await ctx.localPath(`asset://${ID}.mov`)).toBe(external);
  });

  it("returns null when no adapter keeps a local file", async () => {
    const storage = new InMemoryStorageAdapter();
    await storage.store(`${USER}/${ID}.mp4`, new Uint8Array([1]));
    const ctx = new ProcessingContext({ jobId: "j1", userId: USER, storage });

    // The bytes resolve, but there is no file to hand out.
    expect((await ctx.resolveAssetBytes(ID)).bytes).not.toBeNull();
    expect(await ctx.localPath(ID)).toBeNull();
    expect(await ctx.localPath("package://pkg/asset.png")).toBeNull();
    expect(await ctx.localPath("   ")).toBeNull();
  });

  it("returns null for a missing asset", async () => {
    const ctx = new ProcessingContext({
      jobId: "j1",
      userId: USER,
      assetStorage: new FileStorageAdapter(root)
    });
    expect(await ctx.localPath(`asset://${ID}.mp4`)).toBeNull();
  });
});
