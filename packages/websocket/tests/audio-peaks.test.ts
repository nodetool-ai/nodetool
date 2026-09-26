/**
 * `GET /api/assets/:id/peaks` decodes the audio with the real ffmpeg, reading
 * a local file in place, and caches the peaks on disk by asset, file size and
 * mtime, and count. A backend with no local file still works from the bytes.
 */
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";
import { Asset, initTestDb } from "@nodetool-ai/models";
import {
  FileStorageAdapter,
  InMemoryStorageAdapter,
  type StorageAdapter
} from "@nodetool-ai/storage";

const mocks = vi.hoisted(() => ({ adapter: null as StorageAdapter | null }));
vi.mock("../src/lib/storage.js", async (orig) => ({
  ...(await orig<typeof import("../src/lib/storage.js")>()),
  getAssetAdapter: () => mocks.adapter
}));

import { handleAssetPeaks, computeAudioPeaks } from "../src/lib/audio-peaks.js";
import { lookupExternalAssetPath } from "../src/lib/external-asset-lookup.js";

const execFileAsync = promisify(execFile);
const USER = "user-1";

let tmp: string;
/** 1 s of silence, then 1 s of a full-scale 440 Hz sine, mono 8 kHz. */
let halfLoud: string;
let silentVideo: string;
const savedCacheDir = process.env["NODETOOL_CACHE_DIR"];

interface PeaksBody {
  peaks: number[];
  duration_ms: number;
}

beforeAll(async () => {
  tmp = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "audio-peaks-"))
  );
  process.env["NODETOOL_CACHE_DIR"] = path.join(tmp, "cache");
  halfLoud = path.join(tmp, "half-loud.wav");
  await execFileAsync("ffmpeg", [
    "-y",
    "-f", "lavfi", "-i", "anullsrc=r=8000:cl=mono:d=1",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=8000:duration=1",
    "-filter_complex", "[1]volume=8[s];[0][s]concat=n=2:v=0:a=1",
    halfLoud
  ]);
  silentVideo = path.join(tmp, "silent.mp4");
  await execFileAsync("ffmpeg", [
    "-y",
    "-f", "lavfi", "-i", "testsrc=size=32x32:rate=10:duration=1",
    "-pix_fmt", "yuv420p",
    silentVideo
  ]);
}, 60_000);

afterAll(async () => {
  if (savedCacheDir === undefined) delete process.env["NODETOOL_CACHE_DIR"];
  else process.env["NODETOOL_CACHE_DIR"] = savedCacheDir;
  await fs.rm(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  initTestDb();
});

function params(query = ""): URLSearchParams {
  return new URLSearchParams(query);
}

async function managedWav(root: string, source: string): Promise<Asset> {
  const asset = (await Asset.create({
    user_id: USER,
    name: "take.wav",
    content_type: "audio/wav",
    parent_id: USER
  })) as Asset;
  await fs.mkdir(path.join(root, USER), { recursive: true });
  await fs.copyFile(source, path.join(root, USER, `${asset.id}.wav`));
  return asset;
}

describe("computeAudioPeaks", () => {
  it("reduces channel 0 to abs-max buckets over the decoded length", async () => {
    const result = await computeAudioPeaks(halfLoud, 10);
    expect(result).not.toBeNull();
    expect(result!.duration_ms).toBeCloseTo(2000, -1);
    expect(result!.peaks).toHaveLength(10);
    // The first half is silence and the second half a loud sine.
    for (const p of result!.peaks.slice(0, 4)) expect(p).toBe(0);
    for (const p of result!.peaks.slice(6)) expect(p).toBeGreaterThan(0.5);
  });

  it("answers null for a file with no audio stream", async () => {
    expect(await computeAudioPeaks(silentVideo, 10)).toBeNull();
  });
});

describe("handleAssetPeaks", () => {
  it("reads a managed local file in place and caches by size and mtime", async () => {
    const root = path.join(tmp, "storage-managed");
    const adapter = new FileStorageAdapter(root);
    const retrieve = vi.spyOn(adapter, "retrieve");
    mocks.adapter = adapter;
    const asset = await managedWav(root, halfLoud);

    const first = await handleAssetPeaks(USER, asset.id, params("count=50"));
    expect(first.status).toBe(200);
    expect(first.headers.get("x-peaks-cache")).toBe("miss");
    const body = (await first.json()) as PeaksBody;
    expect(body.peaks).toHaveLength(50);
    expect(body.duration_ms).toBeCloseTo(2000, -1);

    const second = await handleAssetPeaks(USER, asset.id, params("count=50"));
    expect(second.headers.get("x-peaks-cache")).toBe("hit");
    expect(await second.json()).toEqual(body);

    // Another resolution is its own entry.
    const other = await handleAssetPeaks(USER, asset.id, params("count=20"));
    expect(other.headers.get("x-peaks-cache")).toBe("miss");

    // The file changes in place: a new mtime misses the cache.
    const file = path.join(root, USER, `${asset.id}.wav`);
    const later = new Date(Date.now() + 60_000);
    await fs.utimes(file, later, later);
    const third = await handleAssetPeaks(USER, asset.id, params("count=50"));
    expect(third.headers.get("x-peaks-cache")).toBe("miss");

    // ffmpeg read the file by path; nothing was loaded into memory.
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("reads an external asset's file in place", async () => {
    const adapter = new FileStorageAdapter(path.join(tmp, "storage-ext"), {
      externalPathLookup: lookupExternalAssetPath
    });
    const retrieve = vi.spyOn(adapter, "retrieve");
    mocks.adapter = adapter;
    const asset = (await Asset.create({
      user_id: USER,
      name: "half-loud.wav",
      content_type: "audio/wav",
      parent_id: USER,
      external_path: halfLoud
    })) as Asset;

    const res = await handleAssetPeaks(USER, asset.id, params());
    expect(res.status).toBe(200);
    const body = (await res.json()) as PeaksBody;
    expect(body.peaks).toHaveLength(2000);
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("falls back to the stored bytes on a backend with no local file", async () => {
    const adapter = new InMemoryStorageAdapter();
    mocks.adapter = adapter;
    const asset = (await Asset.create({
      user_id: USER,
      name: "take.wav",
      content_type: "audio/wav",
      parent_id: USER
    })) as Asset;
    await adapter.store(
      `${USER}/${asset.id}.wav`,
      new Uint8Array(await fs.readFile(halfLoud))
    );

    const res = await handleAssetPeaks(USER, asset.id, params("count=10"));
    expect(res.status).toBe(200);
    expect(((await res.json()) as PeaksBody).peaks).toHaveLength(10);
    const again = await handleAssetPeaks(USER, asset.id, params("count=10"));
    expect(again.headers.get("x-peaks-cache")).toBe("hit");
  });

  it("refuses another owner's asset, a non-media asset, and a bad count", async () => {
    mocks.adapter = new FileStorageAdapter(path.join(tmp, "storage-refuse"));
    const audio = (await Asset.create({
      user_id: USER,
      name: "a.wav",
      content_type: "audio/wav",
      parent_id: USER
    })) as Asset;
    const image = (await Asset.create({
      user_id: USER,
      name: "a.png",
      content_type: "image/png",
      parent_id: USER
    })) as Asset;

    expect((await handleAssetPeaks("someone-else", audio.id, params())).status).toBe(404);
    expect((await handleAssetPeaks(USER, image.id, params())).status).toBe(400);
    expect((await handleAssetPeaks(USER, audio.id, params("count=0"))).status).toBe(400);
    expect((await handleAssetPeaks(USER, audio.id, params("count=1.5"))).status).toBe(400);
    // A row with no bytes anywhere.
    expect((await handleAssetPeaks(USER, audio.id, params())).status).toBe(404);
  });

  it("answers 422 for a video with no audio track", async () => {
    const adapter = new FileStorageAdapter(path.join(tmp, "storage-silent"), {
      externalPathLookup: lookupExternalAssetPath
    });
    mocks.adapter = adapter;
    const video = (await Asset.create({
      user_id: USER,
      name: "silent.mp4",
      content_type: "video/mp4",
      parent_id: USER,
      external_path: silentVideo
    })) as Asset;
    expect((await handleAssetPeaks(USER, video.id, params())).status).toBe(422);
  });
});
