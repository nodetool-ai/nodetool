/**
 * Thumbnails from a local file: ffmpeg reads the file in place, so a source
 * above THUMBNAIL_SOURCE_MAX_BYTES still gets a thumbnail. Byte sources pulled
 * back out of a store with no local file keep the cap. Runs the real ffmpeg.
 */
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import {
  FileStorageAdapter,
  InMemoryStorageAdapter,
  type StorageAdapter
} from "@nodetool-ai/storage";

const mocks = vi.hoisted(() => ({ adapter: null as StorageAdapter | null }));
vi.mock("../src/lib/storage.js", () => ({
  getAssetAdapter: () => mocks.adapter
}));

import {
  generateThumbnailForStoredAsset,
  THUMBNAIL_SOURCE_MAX_BYTES
} from "../src/lib/thumbnail.js";

const execFileAsync = promisify(execFile);
const USER = "user-1";
const ASSET = "0192a7f3c4e5b6d7a8f9e0c1b2d3e4f5";
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

let tmp: string;
let largeVideo: string;

beforeAll(async () => {
  tmp = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "thumb-local-path-"))
  );
  largeVideo = path.join(tmp, "long take.mp4");
  await execFileAsync("ffmpeg", [
    "-y",
    "-f", "lavfi",
    "-i", "testsrc=size=64x64:rate=10:duration=2",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    largeVideo
  ]);
  // Pad past the byte cap. The padding is sparse, so the test writes almost
  // nothing, and it sits after the moov atom, so the file still decodes.
  await fs.truncate(largeVideo, THUMBNAIL_SOURCE_MAX_BYTES + 1024 * 1024);
}, 60_000);

afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  mocks.adapter = null;
});

describe("generateThumbnailForStoredAsset from a local file", () => {
  it("thumbnails an external video above the byte cap by reading it in place", async () => {
    const root = path.join(tmp, "storage-external");
    const adapter = new FileStorageAdapter(root, {
      externalPathLookup: async (key) =>
        key === `${USER}/${ASSET}.mp4` ? largeVideo : null
    });
    const retrieve = vi.spyOn(adapter, "retrieve");
    mocks.adapter = adapter;

    await generateThumbnailForStoredAsset(USER, ASSET, "video/mp4");

    const thumb = await fs.readFile(path.join(root, USER, `${ASSET}_thumb.jpg`));
    expect([...thumb.subarray(0, 3)]).toEqual(JPEG_MAGIC);
    const meta = await sharp(thumb).metadata();
    expect(meta.width).toBe(64);
    // The source was never read into memory.
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("thumbnails a managed file under the local root in place", async () => {
    const root = path.join(tmp, "storage-managed");
    const adapter = new FileStorageAdapter(root);
    const png = await sharp({
      create: { width: 32, height: 16, channels: 3, background: "#3366cc" }
    })
      .png()
      .toBuffer();
    await adapter.store(`${USER}/${ASSET}.png`, png);
    const retrieve = vi.spyOn(adapter, "retrieve");
    mocks.adapter = adapter;

    await generateThumbnailForStoredAsset(USER, ASSET, "image/png");

    const thumb = await fs.readFile(path.join(root, USER, `${ASSET}_thumb.jpg`));
    expect([...thumb.subarray(0, 3)]).toEqual(JPEG_MAGIC);
    expect(retrieve).not.toHaveBeenCalled();
  });
});

describe("generateThumbnailForStoredAsset from bytes", () => {
  it("skips an object above the cap without downloading it", async () => {
    const adapter = new InMemoryStorageAdapter();
    const key = `${USER}/${ASSET}.mp4`;
    await adapter.store(key, new Uint8Array([1, 2, 3]));
    vi.spyOn(adapter, "stat").mockResolvedValue({
      key,
      size: THUMBNAIL_SOURCE_MAX_BYTES + 1,
      modifiedAt: 0
    });
    const retrieve = vi.spyOn(adapter, "retrieve");
    const store = vi.spyOn(adapter, "store");
    mocks.adapter = adapter;

    await generateThumbnailForStoredAsset(USER, ASSET, "video/mp4");

    expect(retrieve).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
  });

  it("thumbnails an object within the cap from its bytes", async () => {
    const adapter = new InMemoryStorageAdapter();
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#cc3366" }
    })
      .png()
      .toBuffer();
    await adapter.store(`${USER}/${ASSET}.png`, png);
    mocks.adapter = adapter;

    await generateThumbnailForStoredAsset(USER, ASSET, "image/png");

    const thumb = await adapter.retrieve(
      adapter.uriForKey(`${USER}/${ASSET}_thumb.jpg`)
    );
    expect([...(thumb ?? []).slice(0, 3)]).toEqual(JPEG_MAGIC);
  });
});
