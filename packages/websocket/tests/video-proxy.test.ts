/**
 * Preview proxies (F11): the encode with the real ffmpeg (every frame a
 * keyframe, the same frame timestamps and duration as the source, the longer
 * side scaled down), the one-at-a-time queue, and the asset surface: the
 * response's `proxy_status`/`proxy_url`, invalidation when the source file
 * changes, the threshold, `assets.ensureProxy`, relink, and delete.
 */
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";
import { Asset, initTestDb, ModelObserver } from "@nodetool-ai/models";
import {
  assetObjectKey,
  FileStorageAdapter,
  type StorageAdapter
} from "@nodetool-ai/storage";

const mocks = vi.hoisted(() => ({
  adapter: null as StorageAdapter | null
}));

vi.mock("../src/lib/storage.js", async (orig) => ({
  ...(await orig<typeof import("../src/lib/storage.js")>()),
  getAssetAdapter: () => mocks.adapter
}));

vi.mock("../src/lib/thumbnail.js", async (orig) => {
  const actual = await orig<typeof import("../src/lib/thumbnail.js")>();
  return { ...actual, generateThumbnailForStoredAsset: vi.fn(async () => {}) };
});

import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import { lookupExternalAssetPath } from "../src/lib/external-asset-lookup.js";
import { createStorageHandler } from "../src/storage-api.js";
import {
  encodeVideoProxy,
  probeVideo,
  VIDEO_PROXY_MIN_SIZE_SETTING,
  videoProxyFileNames,
  videoProxyQueue,
  VideoProxyQueue,
  type VideoProxyJob,
  type VideoProxyResult
} from "../src/lib/video-proxy.js";

const execFileAsync = promisify(execFile);
const createCaller = createCallerFactory(appRouter);
const USER = "user-1";

function makeCtx(userId = USER): Context {
  return {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

interface Frame {
  pts: number;
  key: boolean;
}

/** Every video frame's presentation time (seconds) and keyframe flag. */
async function frames(file: string): Promise<Frame[]> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "frame=pts_time,key_frame",
    "-of", "json",
    file
  ]);
  const parsed = JSON.parse(stdout) as {
    frames: Array<{ pts_time: string; key_frame: number }>;
  };
  return parsed.frames.map((f) => ({
    pts: Number(f.pts_time),
    key: f.key_frame === 1
  }));
}

async function formatInfo(
  file: string
): Promise<{ duration: number; streams: string[] }> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_type",
    "-of", "json",
    file
  ]);
  const parsed = JSON.parse(stdout) as {
    format: { duration: string };
    streams: Array<{ codec_type: string }>;
  };
  return {
    duration: Number(parsed.format.duration),
    streams: parsed.streams.map((s) => s.codec_type)
  };
}

/** A long-GOP H.264 clip with B-frames and a sine track. */
async function makeVideo(
  file: string,
  size: string,
  seconds: number,
  extraVideoFilter?: string
): Promise<void> {
  await execFileAsync("ffmpeg", [
    "-y", "-v", "error",
    "-f", "lavfi", "-i", `testsrc=size=${size}:rate=25:duration=${seconds}`,
    "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`,
    ...(extraVideoFilter ? ["-vf", extraVideoFilter, "-fps_mode", "vfr"] : []),
    "-c:v", "libx264", "-preset", "ultrafast", "-g", "50", "-bf", "2",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-shortest",
    file
  ]);
}

let tmp: string;
let clip: string;

beforeAll(async () => {
  tmp = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "video-proxy-"))
  );
  clip = path.join(tmp, "clip.mp4");
  await makeVideo(clip, "320x240", 2);
}, 60_000);

afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("encodeVideoProxy", () => {
  it("writes every frame as a keyframe at the source's timestamps, without audio", async () => {
    const out = path.join(tmp, "proxy.mp4");
    const probe = (await probeVideo(clip))!;
    const { codec } = await encodeVideoProxy(clip, out, probe);
    expect(codec).toBe("h264");

    const source = await frames(clip);
    const proxy = await frames(out);
    // The source is long-GOP: a seek there decodes from an earlier keyframe.
    expect(source.filter((f) => f.key).length).toBeLessThan(source.length);
    expect(proxy.length).toBe(source.length);
    expect(proxy.every((f) => f.key)).toBe(true);
    expect(proxy.map((f) => f.pts)).toEqual(source.map((f) => f.pts));

    const info = await formatInfo(out);
    expect(info.streams).toEqual(["video"]);
    expect(Math.abs(info.duration - 2)).toBeLessThan(1 / 25 + 1e-6);
  }, 60_000);

  it("keeps variable frame timing: a gap in the source stays a gap", async () => {
    const vfr = path.join(tmp, "vfr.mp4");
    // Frames from the tenth on come 0.3 s later than a steady 25 fps.
    await makeVideo(vfr, "160x120", 1, "setpts='(N/25+gte(N,10)*0.3)/TB'");
    const out = path.join(tmp, "vfr-proxy.mp4");
    await encodeVideoProxy(vfr, out, (await probeVideo(vfr))!);

    const source = await frames(vfr);
    const proxy = await frames(out);
    expect(proxy.map((f) => f.pts)).toEqual(source.map((f) => f.pts));
    // The source keeps its gap (0.3 s on top of one 0.04 s frame step).
    expect(proxy[10]!.pts - proxy[9]!.pts).toBeGreaterThan(0.3);
  }, 60_000);

  it("scales the longer side down to 960 and keeps a smaller source's size", async () => {
    const wide = path.join(tmp, "wide.mp4");
    const tall = path.join(tmp, "tall.mp4");
    await makeVideo(wide, "1280x720", 0.2);
    await makeVideo(tall, "720x1280", 0.2);
    const wideOut = path.join(tmp, "wide-proxy.mp4");
    const tallOut = path.join(tmp, "tall-proxy.mp4");
    await encodeVideoProxy(wide, wideOut, (await probeVideo(wide))!);
    await encodeVideoProxy(tall, tallOut, (await probeVideo(tall))!);
    expect(await probeVideo(wideOut)).toMatchObject({ width: 960, height: 540 });
    expect(await probeVideo(tallOut)).toMatchObject({ width: 540, height: 960 });

    const small = path.join(tmp, "proxy-small.mp4");
    await encodeVideoProxy(clip, small, (await probeVideo(clip))!);
    expect(await probeVideo(small)).toMatchObject({ width: 320, height: 240 });
  }, 60_000);
});

describe("VideoProxyQueue", () => {
  function deferred() {
    let resolve!: (r: VideoProxyResult) => void;
    const promise = new Promise<VideoProxyResult>((r) => (resolve = r));
    return { promise, resolve };
  }

  it("runs one job at a time, in order, and does not queue an asset twice", async () => {
    const started: string[] = [];
    let active = 0;
    let maxActive = 0;
    const gates = new Map<string, ReturnType<typeof deferred>>();
    const queue = new VideoProxyQueue(async (job: VideoProxyJob) => {
      started.push(`${job.assetId}:${job.force}`);
      active += 1;
      maxActive = Math.max(maxActive, active);
      const gate = deferred();
      gates.set(job.assetId, gate);
      const result = await gate.promise;
      active -= 1;
      return result;
    });
    const job = (assetId: string, force = false) => ({
      assetId,
      userId: USER,
      force
    });

    queue.enqueue(job("a"));
    queue.enqueue(job("b"));
    queue.enqueue(job("b", true));
    queue.enqueue(job("c"));
    expect(queue.status("a", "v")).toBe("running");
    expect(queue.status("b", "v")).toBe("queued");
    expect(started).toEqual(["a:false"]);

    gates.get("a")!.resolve({ outcome: "created", sourceVersion: "v" });
    await vi.waitFor(() => expect(started).toHaveLength(2));
    // The waiting job took the explicit request's `force`.
    expect(started[1]).toBe("b:true");
    gates.get("b")!.resolve({ outcome: "failed", sourceVersion: "v1" });
    await vi.waitFor(() => expect(started).toHaveLength(3));
    gates.get("c")!.resolve({ outcome: "skipped", sourceVersion: "v" });
    await queue.idle();

    expect(started).toEqual(["a:false", "b:true", "c:false"]);
    expect(maxActive).toBe(1);
    // A failure is remembered for the version that failed only.
    expect(queue.status("b", "v1")).toBe("failed");
    expect(queue.status("b", "v2")).toBeNull();
    queue.clearFailure("b");
    expect(queue.status("b", "v1")).toBeNull();
  });

  it("drops a waiting job and aborts a running one on cancel", async () => {
    const signals: AbortSignal[] = [];
    const ran: string[] = [];
    const queue = new VideoProxyQueue(async (job, signal) => {
      ran.push(job.assetId);
      signals.push(signal);
      await new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => resolve(), { once: true })
      );
      return { outcome: "gone", sourceVersion: null };
    });
    queue.enqueue({ assetId: "a", userId: USER, force: false });
    queue.enqueue({ assetId: "b", userId: USER, force: false });
    queue.cancel("b");
    queue.cancel("a");
    await queue.idle();
    expect(ran).toEqual(["a"]);
    expect(signals[0]!.aborted).toBe(true);
  });
});

describe("asset proxies", () => {
  let storageRoot: string;
  let mediaDir: string;
  let source: string;

  beforeEach(async () => {
    initTestDb();
    storageRoot = path.join(tmp, `storage-${Date.now()}`);
    mediaDir = path.join(tmp, `media-${Date.now()}`);
    await fs.mkdir(mediaDir, { recursive: true });
    source = path.join(mediaDir, "shot.mp4");
    await fs.copyFile(clip, source);
    mocks.adapter = new FileStorageAdapter(storageRoot, {
      externalPathLookup: lookupExternalAssetPath
    });
    vi.stubEnv("NODETOOL_LOCAL_FILE_ROOTS", mediaDir);
    vi.stubEnv("NODETOOL_ENV", "development");
    vi.stubEnv("NODETOOL_STORAGE_BACKEND", "file");
    vi.stubEnv(VIDEO_PROXY_MIN_SIZE_SETTING, "0");
  });

  afterEach(async () => {
    await videoProxyQueue.idle();
    vi.unstubAllEnvs();
    ModelObserver.clear();
  });

  async function importVideo(file = source) {
    return createCaller(makeCtx()).assets.createExternal({
      path: file,
      content_type: "video/mp4"
    });
  }

  async function get(id: string) {
    return createCaller(makeCtx()).assets.get({ id });
  }

  async function proxyFilesOnDisk(id: string): Promise<string[]> {
    const present: string[] = [];
    for (const name of videoProxyFileNames(id)) {
      const exists = await fs
        .stat(path.join(storageRoot, USER, name))
        .then(() => true, () => false);
      if (exists) present.push(name);
    }
    return present;
  }

  async function streamStatus(url: string): Promise<number> {
    const handler = createStorageHandler({ storagePath: storageRoot });
    const response = await handler(
      new Request(`http://localhost${url}`, { headers: { "x-user-id": USER } })
    );
    return response.status;
  }

  it("makes a proxy after import and exposes it once ready, without a disk path", async () => {
    const created = await importVideo();
    // The import returns before the encode finishes.
    expect(["queued", "running"]).toContain(created.proxy_status);
    expect(created.proxy_url).toBeNull();

    await videoProxyQueue.idle();
    const ready = await get(created.id);
    expect(ready.proxy_status).toBe("ready");
    expect(ready.proxy_url).toMatch(
      new RegExp(`^/api/storage/${USER}/${created.id}_proxy\\.mp4\\?v=[0-9a-f]{12}$`)
    );
    expect(ready.get_url).toBe(created.get_url);
    expect(JSON.stringify(ready)).not.toContain(tmp);
    expect(await streamStatus(ready.proxy_url!)).toBe(200);

    const proxyFile = path.join(storageRoot, USER, `${created.id}_proxy.mp4`);
    expect((await frames(proxyFile)).every((f) => f.key)).toBe(true);
    // The original is untouched and still what get_url serves.
    expect(await mocks.adapter!.localPath(
      mocks.adapter!.uriForKey(`${USER}/${created.id}.mp4`)
    )).toBe(source);
  }, 60_000);

  it("keeps proxies out of the asset listing", async () => {
    const created = await importVideo();
    await videoProxyQueue.idle();
    const listed = await createCaller(makeCtx()).assets.list({});
    expect(listed.assets.map((a) => a.id)).toEqual([created.id]);
    expect(await proxyFilesOnDisk(created.id)).toEqual([
      `${created.id}_proxy.mp4`,
      `${created.id}_proxy.json`
    ]);
  }, 60_000);

  it("skips a video below the threshold until ensureProxy asks for one", async () => {
    vi.stubEnv(VIDEO_PROXY_MIN_SIZE_SETTING, "1920");
    const created = await importVideo();
    await videoProxyQueue.idle();
    expect((await get(created.id)).proxy_status).toBe("none");
    expect(await proxyFilesOnDisk(created.id)).toEqual([]);

    const ensured = await createCaller(makeCtx()).assets.ensureProxy({
      id: created.id
    });
    expect(["queued", "running"]).toContain(ensured.status);
    await videoProxyQueue.idle();
    expect((await get(created.id)).proxy_status).toBe("ready");

    const again = await createCaller(makeCtx()).assets.ensureProxy({
      id: created.id
    });
    expect(again.status).toBe("ready");
    expect(again.proxy_url).toContain(`${created.id}_proxy.mp4?v=`);
  }, 60_000);

  it("turns background proxies off for a negative threshold", async () => {
    vi.stubEnv(VIDEO_PROXY_MIN_SIZE_SETTING, "-1");
    const created = await importVideo();
    await videoProxyQueue.idle();
    expect((await get(created.id)).proxy_status).toBe("none");
  }, 60_000);

  it("invalidates the proxy when a managed file changes, and remakes it under a new URL", async () => {
    const asset = await Asset.create<Asset>({
      user_id: USER,
      name: "managed.mp4",
      content_type: "video/mp4"
    });
    const key = assetObjectKey(USER, `${asset.id}.mp4`);
    await mocks.adapter!.store(key, await fs.readFile(clip));
    const caller = createCaller(makeCtx());
    await caller.assets.ensureProxy({ id: asset.id });
    await videoProxyQueue.idle();
    const first = await get(asset.id);
    expect(first.proxy_status).toBe("ready");

    const later = new Date(Date.now() + 60_000);
    await fs.utimes(path.join(storageRoot, key), later, later);
    const stale = await get(asset.id);
    expect(stale.proxy_status).toBe("none");
    expect(stale.proxy_url).toBeNull();

    await caller.assets.ensureProxy({ id: asset.id });
    await videoProxyQueue.idle();
    const remade = await get(asset.id);
    expect(remade.proxy_status).toBe("ready");
    expect(remade.proxy_url).not.toBe(first.proxy_url);
  }, 60_000);

  it("drops the old proxy on relink and makes one for the new file", async () => {
    const created = await importVideo();
    await videoProxyQueue.idle();
    const before = await get(created.id);

    const moved = path.join(mediaDir, "moved.mp4");
    await makeVideo(moved, "320x240", 1);
    const relinked = await createCaller(makeCtx()).assets.relinkExternal({
      id: created.id,
      path: moved
    });
    expect(relinked.proxy_status).not.toBe("ready");
    await videoProxyQueue.idle();
    const after = await get(created.id);
    expect(after.proxy_status).toBe("ready");
    expect(after.proxy_url).not.toBe(before.proxy_url);
    const proxyFile = path.join(storageRoot, USER, `${created.id}_proxy.mp4`);
    expect(Math.abs((await formatInfo(proxyFile)).duration - 1)).toBeLessThan(0.05);
  }, 60_000);

  it("reports an offline source's proxy as not ready", async () => {
    const created = await importVideo();
    await videoProxyQueue.idle();
    await fs.rm(source);
    const got = await get(created.id);
    expect(got.offline).toBe(true);
    expect(got.proxy_status).toBe("none");
    expect(got.proxy_url).toBeNull();
  }, 60_000);

  it("deletes the proxy with its asset", async () => {
    const created = await importVideo();
    await videoProxyQueue.idle();
    expect(await proxyFilesOnDisk(created.id)).not.toEqual([]);
    await createCaller(makeCtx()).assets.delete({ id: created.id });
    expect(await proxyFilesOnDisk(created.id)).toEqual([]);
    // The referenced file stays.
    expect((await fs.stat(source)).isFile()).toBe(true);
  }, 60_000);

  it("records a failure for a file ffmpeg cannot read, and ensureProxy retries it", async () => {
    const broken = path.join(mediaDir, "broken.mp4");
    await fs.writeFile(broken, "not a video");
    const created = await importVideo(broken);
    await videoProxyQueue.idle();
    expect((await get(created.id)).proxy_status).toBe("failed");

    const retried = await createCaller(makeCtx()).assets.ensureProxy({
      id: created.id
    });
    expect(["queued", "running"]).toContain(retried.status);
    await videoProxyQueue.idle();
    expect((await get(created.id)).proxy_status).toBe("failed");
  }, 60_000);

  it("answers no proxy fields for a non-video asset and refuses ensureProxy", async () => {
    const image = await Asset.create<Asset>({
      user_id: USER,
      name: "pic.png",
      content_type: "image/png"
    });
    const got = await get(image.id);
    expect(got.proxy_status).toBeUndefined();
    expect(got.proxy_url).toBeUndefined();
    await expect(
      createCaller(makeCtx()).assets.ensureProxy({ id: image.id })
    ).rejects.toThrow(/not a video/);
  });

  it("offers no proxies in production", async () => {
    const asset = await Asset.create<Asset>({
      user_id: USER,
      name: "managed.mp4",
      content_type: "video/mp4"
    });
    vi.stubEnv("NODETOOL_ENV", "production");
    expect((await get(asset.id)).proxy_status).toBeUndefined();
    await expect(
      createCaller(makeCtx()).assets.ensureProxy({ id: asset.id })
    ).rejects.toThrow(/local file store/);
  });
});
