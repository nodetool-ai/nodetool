/**
 * Preview proxies for video assets (F11).
 *
 * The timeline preview seeks one `<video>` element per clip. In a long-GOP
 * source (camera or phone H.264/HEVC, often 4K) every seek decodes from the
 * previous keyframe, which can be seconds away. A proxy is a smaller copy in
 * which every frame is a keyframe, so a seek decodes exactly one small frame.
 *
 * - Codec: H.264 (libx264) with a GOP of one frame, 8-bit 4:2:0, in MP4.
 *   Chromium cannot decode ProRes or DNxHR, and MJPEG plays only as an image
 *   stream, not in `<video>`. All-intra H.264 is what Chromium decodes in
 *   hardware or software everywhere. An ffmpeg built without libx264 (an
 *   LGPL build) falls back to all-intra VP9 in WebM, which Chromium also
 *   plays.
 * - Size: the longer side is scaled down to {@link PROXY_LONG_SIDE_PX}. A
 *   smaller source keeps its size.
 * - Timing: `-fps_mode passthrough` keeps every source frame and its
 *   timestamp (no frames dropped or duplicated for a variable frame rate), and
 *   the MP4 track keeps the source stream's timescale. Source time `t` in the
 *   proxy is the same picture as `t` in the original, so clip in points and
 *   trims need no mapping.
 * - Audio: none. Preview video elements are muted; a clip's sound plays from
 *   its audio clip.
 *
 * Storage: a sidecar in the asset store next to the thumbnail, never an asset
 * row. `<owner>/<id>_proxy.mp4` holds the video and `<owner>/<id>_proxy.json`
 * a manifest recording the source file's size and mtime when the proxy was
 * made. The proxy is ready only while the manifest matches the source file, so
 * a relink or a file changed in place invalidates it (R2). No listing,
 * search, agent tool, or export sees it, because it is not a row, and asset
 * delete removes it with the thumbnail.
 *
 * Generation runs in the background on a queue that encodes one video at a
 * time, so imports return at once and a batch import does not start many
 * encoders. Local mode only: the proxy is written in place under the local
 * storage root, gated like external assets (D6). A cloud deployment would
 * need a worker.
 */
import { spawn, execFile as execFileCb } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fsp } from "node:fs";
import nodePath from "node:path";
import { promisify } from "node:util";
import { createLogger } from "@nodetool-ai/config";
import { Asset } from "@nodetool-ai/models";
import {
  assetObjectKey,
  FileStorageAdapter,
  normalizeStorageKey,
  type StorageAdapter
} from "@nodetool-ai/storage";
import { getSetting } from "../settings-registry.js";
import { localAssetPath } from "./asset-paths.js";
import { externalAssetsAvailable } from "./external-assets.js";
import { verifiedExternalPath } from "./external-asset-lookup.js";
import { MediaToolingMissingError } from "./media.js";
import { getAssetAdapter } from "./storage.js";
import { isObjectLike } from "./wire-values.js";

const log = createLogger("nodetool.video-proxy");
const execFile = promisify(execFileCb);

/** Setting (and env var): the source size, in pixels of its longer side, at which a proxy is made after import. */
export const VIDEO_PROXY_MIN_SIZE_SETTING = "NODETOOL_VIDEO_PROXY_MIN_SIZE_PX";

/** Default: sources of 1920 px (1080p) and larger get a proxy. */
export const DEFAULT_VIDEO_PROXY_MIN_SIZE_PX = 1920;

/** The proxy's longer side. */
export const PROXY_LONG_SIDE_PX = 960;

/** Bumped when the encode changes, so proxies made before it are remade. */
const PROXY_FORMAT_VERSION = 1;

export type VideoProxyStatus =
  | "none"
  | "queued"
  | "running"
  | "ready"
  | "failed";

interface ProxyManifest {
  format: number;
  /** `<size>:<mtime ms>` of the source file the proxy was made from. */
  source: string;
  /** The proxy's file name under the owner's folder. */
  file: string;
  codec: "h264" | "vp9";
  width: number;
  height: number;
}

/** What {@link videoProxyState} tells the asset response. */
export interface VideoProxyState {
  status: VideoProxyStatus;
  /** The proxy's storage key, when ready. */
  key: string | null;
  /** A short hash of the source version, for the proxy URL's `?v=`. */
  version: string | null;
}

function manifestFileName(assetId: string): string {
  return `${assetId}_proxy.json`;
}

/** Every file a proxy can leave in the owner's folder. Asset delete removes them. */
export function videoProxyFileNames(assetId: string): string[] {
  return [
    `${assetId}_proxy.mp4`,
    `${assetId}_proxy.webm`,
    manifestFileName(assetId)
  ];
}

function isEnoent(err: unknown): boolean {
  return isObjectLike(err) && (err as { code?: unknown }).code === "ENOENT";
}

/**
 * Whether this server makes proxies: the local file store, outside
 * production (the same gate as external assets, D6).
 */
export function videoProxiesAvailable(): boolean {
  return externalAssetsAvailable();
}

/**
 * The longer-side size, in pixels, at or above which an imported video gets a
 * proxy. Read from the settings table, then the environment. `0` proxies every
 * video, a negative value turns background proxies off, and a missing or
 * non-numeric value falls back to the default. `ensureProxy` ignores it.
 */
export async function getVideoProxyMinSizePx(): Promise<number> {
  let raw: string | null;
  try {
    raw = await getSetting(VIDEO_PROXY_MIN_SIZE_SETTING);
  } catch {
    raw = process.env[VIDEO_PROXY_MIN_SIZE_SETTING] ?? null;
  }
  if (raw === null || raw.trim() === "") return DEFAULT_VIDEO_PROXY_MIN_SIZE_PX;
  const parsed = Number(raw);
  return Number.isFinite(parsed)
    ? Math.floor(parsed)
    : DEFAULT_VIDEO_PROXY_MIN_SIZE_PX;
}

/** The row fields a proxy depends on. */
type ProxyAssetFields = Pick<
  Asset,
  "id" | "user_id" | "content_type" | "external_path" | "metadata"
>;

interface SourceFile {
  path: string;
  /** `<size>:<mtime ms>`. */
  version: string;
}

/**
 * The file the asset's bytes live in and its version, or null when there is
 * none (an offline external file, a missing managed file).
 */
async function sourceFile(
  adapter: StorageAdapter,
  asset: ProxyAssetFields
): Promise<SourceFile | null> {
  const path = asset.external_path
    ? await verifiedExternalPath(asset)
    : await localAssetPath(
        adapter,
        asset.user_id,
        asset.id,
        asset.content_type
      );
  if (!path) return null;
  try {
    const info = await fsp.stat(path);
    return { path, version: `${info.size}:${Math.trunc(info.mtimeMs)}` };
  } catch {
    return null;
  }
}

async function readManifest(
  adapter: StorageAdapter,
  asset: ProxyAssetFields
): Promise<ProxyManifest | null> {
  const bytes = await adapter
    .retrieve(
      adapter.uriForKey(
        assetObjectKey(asset.user_id, manifestFileName(asset.id))
      )
    )
    .catch(() => null);
  if (!bytes) return null;
  try {
    const parsed = JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
    if (!isObjectLike(parsed)) return null;
    const manifest = parsed as unknown as ProxyManifest;
    return typeof manifest.source === "string" &&
      typeof manifest.file === "string" &&
      videoProxyFileNames(asset.id).includes(manifest.file)
      ? manifest
      : null;
  } catch {
    return null;
  }
}

/** The key of a proxy made from `source`, or null when there is none. */
async function readyProxyKey(
  adapter: StorageAdapter,
  asset: ProxyAssetFields,
  source: SourceFile
): Promise<string | null> {
  const manifest = await readManifest(adapter, asset);
  if (
    !manifest ||
    manifest.format !== PROXY_FORMAT_VERSION ||
    manifest.source !== source.version
  ) {
    return null;
  }
  const key = assetObjectKey(asset.user_id, manifest.file);
  return (await adapter.exists(adapter.uriForKey(key))) ? key : null;
}

function versionHash(source: SourceFile): string {
  return createHash("sha256").update(source.version).digest("hex").slice(0, 12);
}

/**
 * The proxy state of a video asset, or null when proxies do not apply (not a
 * video, or not a local server). A proxy made from another version of the
 * source file is not ready.
 */
export async function videoProxyState(
  asset: ProxyAssetFields
): Promise<VideoProxyState | null> {
  if (!asset.content_type.startsWith("video/")) return null;
  if (!videoProxiesAvailable()) return null;
  const adapter = getAssetAdapter();
  const source = await sourceFile(adapter, asset);
  if (!source) return { status: "none", key: null, version: null };
  const key = await readyProxyKey(adapter, asset, source);
  if (key) return { status: "ready", key, version: versionHash(source) };
  return {
    status: videoProxyQueue.status(asset.id, source.version) ?? "none",
    key: null,
    version: null
  };
}

// ── ffmpeg ────────────────────────────────────────────────────────

export interface VideoProbe {
  width: number;
  height: number;
  /** The denominator of the stream time base, when it is a whole number. */
  timescale: number | null;
}

/** The first video stream's size, or null when the file has none. */
export async function probeVideo(filePath: string): Promise<VideoProbe | null> {
  let stdout: string;
  try {
    ({ stdout } = await execFile("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,time_base",
      "-of",
      "json",
      filePath
    ]));
  } catch (err) {
    if (isEnoent(err)) throw new MediaToolingMissingError();
    return null;
  }
  const stream = (
    JSON.parse(stdout) as {
      streams?: Array<{ width?: number; height?: number; time_base?: string }>;
    }
  ).streams?.[0];
  const width = Number(stream?.width);
  const height = Number(stream?.height);
  if (!(width > 0) || !(height > 0)) return null;
  const denominator = Number(stream?.time_base?.split("/")[1]);
  return {
    width,
    height,
    timescale:
      Number.isInteger(denominator) && denominator > 0 ? denominator : null
  };
}

let encoderPromise: Promise<"h264" | "vp9"> | null = null;

/** libx264 when this ffmpeg has it, else VP9. Asked once per process. */
function proxyCodec(): Promise<"h264" | "vp9"> {
  encoderPromise ??= execFile("ffmpeg", ["-hide_banner", "-encoders"])
    .then(({ stdout }) => (/\blibx264\b/.test(stdout) ? "h264" : "vp9"))
    .catch((err: unknown) => {
      encoderPromise = null;
      throw isEnoent(err) ? new MediaToolingMissingError() : err;
    }) as Promise<"h264" | "vp9">;
  return encoderPromise;
}

/** Longer side down to {@link PROXY_LONG_SIDE_PX}, even dimensions, 4:2:0. */
const SCALE_FILTER =
  `scale=w='if(gte(iw,ih),trunc(min(${PROXY_LONG_SIDE_PX},iw)/2)*2,-2)'` +
  `:h='if(gte(iw,ih),-2,trunc(min(${PROXY_LONG_SIDE_PX},ih)/2)*2)',` +
  "format=yuv420p";

function encodeArgs(
  input: string,
  output: string,
  codec: "h264" | "vp9",
  probe: VideoProbe
): string[] {
  const common = [
    "-v",
    "error",
    "-nostdin",
    "-y",
    "-i",
    input,
    "-map",
    "0:v:0",
    "-an",
    "-sn",
    "-dn",
    "-map_metadata",
    "-1",
    "-vf",
    SCALE_FILTER,
    "-fps_mode",
    "passthrough"
  ];
  if (codec === "h264") {
    return [
      ...common,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-tune",
      "fastdecode",
      "-crf",
      "26",
      // Every frame a keyframe, no B-frames: a seek decodes one frame.
      "-g",
      "1",
      "-bf",
      "0",
      ...(probe.timescale !== null
        ? ["-video_track_timescale", String(probe.timescale)]
        : []),
      "-movflags",
      "+faststart",
      "-f",
      "mp4",
      output
    ];
  }
  return [
    ...common,
    "-c:v",
    "libvpx-vp9",
    "-deadline",
    "realtime",
    "-cpu-used",
    "8",
    "-row-mt",
    "1",
    "-crf",
    "34",
    "-b:v",
    "0",
    "-g",
    "1",
    "-f",
    "webm",
    output
  ];
}

/**
 * Encode `input` into an all-intra preview proxy at `output`. Answers the
 * codec and size written. Throws {@link MediaToolingMissingError} when ffmpeg
 * is missing, and an AbortError when `signal` aborts.
 */
export async function encodeVideoProxy(
  input: string,
  output: string,
  probe: VideoProbe,
  signal?: AbortSignal
): Promise<{ codec: "h264" | "vp9" }> {
  const codec = await proxyCodec();
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", encodeArgs(input, output, codec, probe), {
      stdio: ["ignore", "ignore", "pipe"],
      signal
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 4096) stderr += chunk.toString();
    });
    child.on("error", (err) => {
      reject(isEnoent(err) ? new MediaToolingMissingError() : err);
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with ${code}: ${stderr.trim()}`));
    });
  });
  return { codec };
}

// ── Queue ─────────────────────────────────────────────────────────

export interface VideoProxyJob {
  assetId: string;
  userId: string;
  /** Made at any size: an explicit request ignores the threshold. */
  force: boolean;
}

/** What a job did, for logs and tests. */
export type VideoProxyOutcome =
  | "created"
  | "ready"
  | "skipped"
  | "gone"
  | "failed";

export interface VideoProxyResult {
  outcome: VideoProxyOutcome;
  /** The source version the job read, recorded on a failure. */
  sourceVersion: string | null;
}

export type VideoProxyRunner = (
  job: VideoProxyJob,
  signal: AbortSignal
) => Promise<VideoProxyResult>;

/**
 * Runs proxy jobs one at a time, in order. A job already waiting for the same
 * asset is not queued twice (an explicit request upgrades it to `force`). A
 * failure is remembered per source version, so an import retrying the same
 * file does not encode it again. `ensureProxy` clears it.
 */
export class VideoProxyQueue {
  private readonly pending: VideoProxyJob[] = [];
  private running: { job: VideoProxyJob; abort: AbortController } | null =
    null;
  private readonly failures = new Map<string, string>();
  private readonly idleWaiters: Array<() => void> = [];

  constructor(private readonly runner: VideoProxyRunner) {}

  enqueue(job: VideoProxyJob): void {
    const waiting = this.pending.find((p) => p.assetId === job.assetId);
    if (waiting) {
      waiting.force ||= job.force;
      return;
    }
    this.pending.push({ ...job });
    this.pump();
  }

  /** `queued` or `running` for a job in flight, `failed` when this version failed. */
  status(
    assetId: string,
    version: string
  ): "queued" | "running" | "failed" | null {
    if (this.pending.some((p) => p.assetId === assetId)) return "queued";
    if (this.running?.job.assetId === assetId) return "running";
    return this.failures.get(assetId) === version ? "failed" : null;
  }

  clearFailure(assetId: string): void {
    this.failures.delete(assetId);
  }

  /** Drop a waiting job for the asset and stop its encode if it is running. */
  cancel(assetId: string): void {
    const index = this.pending.findIndex((p) => p.assetId === assetId);
    if (index >= 0) this.pending.splice(index, 1);
    if (this.running?.job.assetId === assetId) this.running.abort.abort();
    this.failures.delete(assetId);
    this.notifyIfIdle();
  }

  /** Resolves once no job is waiting or running. */
  idle(): Promise<void> {
    if (!this.running && this.pending.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private pump(): void {
    if (this.running) return;
    const job = this.pending.shift();
    if (!job) {
      this.notifyIfIdle();
      return;
    }
    const abort = new AbortController();
    this.running = { job, abort };
    void this.runner(job, abort.signal)
      .then(({ outcome, sourceVersion }) => {
        if (outcome === "failed" && sourceVersion !== null) {
          this.failures.set(job.assetId, sourceVersion);
        }
      })
      .catch((err: unknown) => {
        log.warn("video proxy job failed", {
          assetId: job.assetId,
          error: String(err)
        });
      })
      .finally(() => {
        this.running = null;
        this.pump();
      });
  }

  private notifyIfIdle(): void {
    if (this.running || this.pending.length > 0) return;
    for (const resolve of this.idleWaiters.splice(0)) resolve();
  }
}

/** The file under the local root that `key` names. */
function rootPath(adapter: FileStorageAdapter, key: string): string {
  const absolute = nodePath.resolve(adapter.rootDir, normalizeStorageKey(key));
  const relative = nodePath.relative(adapter.rootDir, absolute);
  if (relative.startsWith("..") || nodePath.isAbsolute(relative)) {
    throw new Error(`Proxy key resolves outside the storage root: ${key}`);
  }
  return absolute;
}

async function removeProxyFiles(
  adapter: StorageAdapter,
  asset: Pick<Asset, "id" | "user_id">
): Promise<void> {
  for (const fileName of videoProxyFileNames(asset.id)) {
    const uri = adapter.uriForKey(assetObjectKey(asset.user_id, fileName));
    try {
      if (await adapter.exists(uri)) await adapter.delete(uri);
    } catch (err) {
      log.warn("video proxy delete failed", {
        assetId: asset.id,
        fileName,
        error: String(err)
      });
    }
  }
}

/**
 * One job: read the row again (it may have been deleted or relinked while
 * queued), skip a source below the threshold unless forced, encode next to
 * the final file, move it into place, and write the manifest last, so a proxy
 * is never ready half-written.
 */
export async function runVideoProxyJob(
  job: VideoProxyJob,
  signal: AbortSignal
): Promise<VideoProxyResult> {
  const adapter = getAssetAdapter();
  if (!(adapter instanceof FileStorageAdapter) || !videoProxiesAvailable()) {
    return { outcome: "skipped", sourceVersion: null };
  }
  const asset = await Asset.find(job.userId, job.assetId);
  if (!asset || !asset.content_type.startsWith("video/")) {
    return { outcome: "gone", sourceVersion: null };
  }
  const source = await sourceFile(adapter, asset);
  if (!source) return { outcome: "gone", sourceVersion: null };
  const result = (outcome: VideoProxyOutcome): VideoProxyResult => ({
    outcome,
    sourceVersion: source.version
  });
  if (await readyProxyKey(adapter, asset, source)) return result("ready");

  let tmp: string | null = null;
  try {
    const probe = await probeVideo(source.path);
    if (!probe) return result("failed");
    if (!job.force) {
      const min = await getVideoProxyMinSizePx();
      if (min < 0 || Math.max(probe.width, probe.height) < min) {
        return result("skipped");
      }
    }
    const codec = await proxyCodec();
    const fileName = `${asset.id}_proxy.${codec === "h264" ? "mp4" : "webm"}`;
    const target = rootPath(adapter, assetObjectKey(asset.user_id, fileName));
    await fsp.mkdir(nodePath.dirname(target), { recursive: true });
    // Same folder as the target, so the rename below never crosses devices.
    tmp = `${target}.${process.pid}.${Date.now()}.partial`;
    const startedAt = Date.now();
    await encodeVideoProxy(source.path, tmp, probe, signal);
    const out = await probeVideo(tmp);
    await fsp.rename(tmp, target);
    tmp = null;

    // Deleted or relinked while encoding: take the proxy away with it.
    if (signal.aborted || !(await Asset.find(job.userId, job.assetId))) {
      await removeProxyFiles(adapter, asset);
      return result("gone");
    }
    const manifest: ProxyManifest = {
      format: PROXY_FORMAT_VERSION,
      source: source.version,
      file: fileName,
      codec,
      width: out?.width ?? 0,
      height: out?.height ?? 0
    };
    await adapter.store(
      assetObjectKey(asset.user_id, manifestFileName(asset.id)),
      new TextEncoder().encode(JSON.stringify(manifest)),
      "application/json"
    );
    log.info("video proxy created", {
      assetId: asset.id,
      codec,
      width: manifest.width,
      height: manifest.height,
      ms: Date.now() - startedAt
    });
    return result("created");
  } catch (err) {
    if (signal.aborted) return result("gone");
    log.warn("video proxy failed", {
      assetId: asset.id,
      error: String(err)
    });
    return result("failed");
  } finally {
    if (tmp) await fsp.rm(tmp, { force: true }).catch(() => undefined);
  }
}

/** The server's proxy queue. */
export const videoProxyQueue = new VideoProxyQueue(runVideoProxyJob);

/**
 * Queue a proxy for a video just imported or relinked. Returns at once: the
 * job probes the size against the threshold in the background. Does nothing
 * for other content or off the local store.
 */
export function scheduleVideoProxy(
  asset: Pick<Asset, "id" | "user_id" | "content_type">
): void {
  if (!asset.content_type.startsWith("video/")) return;
  if (!videoProxiesAvailable()) return;
  videoProxyQueue.enqueue({
    assetId: asset.id,
    userId: asset.user_id,
    force: false
  });
}

/**
 * Remove an asset's proxy and stop any job for it. Asset delete and relink
 * call this; relink queues a new proxy afterwards.
 */
export async function discardVideoProxy(
  asset: Pick<Asset, "id" | "user_id">
): Promise<void> {
  videoProxyQueue.cancel(asset.id);
  await removeProxyFiles(getAssetAdapter(), asset);
}
