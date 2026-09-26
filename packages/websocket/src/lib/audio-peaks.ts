/**
 * Waveform peaks for an audio or video asset, computed on the server.
 *
 * The timeline draws a clip's waveform from a fixed number of abs-max peaks of
 * channel 0. The browser used to fetch the whole file and decode it with
 * `decodeAudioData`, which turned a two-hour WAV into gigabytes of float32 in
 * the renderer. Here ffmpeg decodes the file as a stream, reading a local file
 * (managed or external) in place, and only a small per-block maximum array is
 * held while it runs.
 *
 * Results are cached on disk under the NodeTool cache directory, keyed by the
 * asset id, the file's size and mtime (or the row's `updated_at` and size when
 * the backend keeps no local file), and the peak count. A file changed in
 * place gets a new key, so a stale waveform is never served.
 */
import { spawn, execFile as execFileCb } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fsp } from "node:fs";
import os from "node:os";
import nodePath from "node:path";
import { promisify } from "node:util";
import { getNodetoolCacheDir } from "@nodetool-ai/config";
import { Asset } from "@nodetool-ai/models";
import { getAssetAdapter } from "./storage.js";
import { localAssetPath, retrieveAssetBytes } from "./asset-paths.js";
import { MediaToolingMissingError } from "./media.js";
import { isObjectLike } from "./wire-values.js";

const execFile = promisify(execFileCb);

/** The count the timeline asks for; also the default. */
export const DEFAULT_PEAK_COUNT = 2000;
export const MAX_PEAK_COUNT = 20_000;

/** Bumped when the peak algorithm changes, so older cache entries miss. */
const CACHE_FORMAT_VERSION = 1;

/** Blocks per output peak kept while decoding, when the length is known. */
const BLOCKS_PER_PEAK = 8;
/** Block size when ffprobe reports no duration. */
const FALLBACK_BLOCK_SAMPLES = 256;

export interface AudioPeaks {
  /** `count` abs-max values of channel 0, each in [0, 1] for normal audio. */
  peaks: number[];
  /** Decoded length of the audio stream. */
  duration_ms: number;
}

interface AudioProbe {
  sampleRate: number;
  durationSec: number | null;
}

function isEnoent(err: unknown): boolean {
  return isObjectLike(err) && (err as { code?: unknown }).code === "ENOENT";
}

/** The first audio stream's sample rate, or null when the file has none. */
async function probeAudio(filePath: string): Promise<AudioProbe | null> {
  let stdout: string;
  try {
    ({ stdout } = await execFile("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=sample_rate:format=duration",
      "-of",
      "json",
      filePath
    ]));
  } catch (err) {
    if (isEnoent(err)) throw new MediaToolingMissingError();
    return null;
  }
  const parsed = JSON.parse(stdout) as {
    streams?: Array<{ sample_rate?: string }>;
    format?: { duration?: string };
  };
  const sampleRate = Number(parsed.streams?.[0]?.sample_rate);
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) return null;
  const durationSec = Number(parsed.format?.duration);
  return {
    sampleRate,
    durationSec:
      Number.isFinite(durationSec) && durationSec > 0 ? durationSec : null
  };
}

/** A growable array of per-block abs-max values. */
class BlockMaxima {
  private values = new Float32Array(4096);
  length = 0;

  push(value: number): void {
    if (this.length === this.values.length) {
      const grown = new Float32Array(this.values.length * 2);
      grown.set(this.values);
      this.values = grown;
    }
    this.values[this.length] = value;
    this.length += 1;
  }

  maxIn(start: number, endExclusive: number): number {
    let max = 0;
    const end = Math.min(endExclusive, this.length);
    for (let i = start; i < end; i += 1) {
      if (this.values[i] > max) max = this.values[i];
    }
    return max;
  }
}

/**
 * Reduce the per-block maxima to `count` buckets over `totalSamples`. Bucket
 * `i` covers samples `[floor(i * n / count), floor((i + 1) * n / count))`, at
 * least one, rounded out to whole blocks.
 */
function reduceToPeaks(
  blocks: BlockMaxima,
  blockSamples: number,
  totalSamples: number,
  count: number
): number[] {
  if (totalSamples === 0) return [];
  const peaks = new Array<number>(count);
  const samplesPerBucket = totalSamples / count;
  for (let i = 0; i < count; i += 1) {
    const start = Math.floor(i * samplesPerBucket);
    const end = Math.max(start + 1, Math.floor((i + 1) * samplesPerBucket));
    const firstBlock = Math.floor(start / blockSamples);
    const endBlock = Math.max(firstBlock + 1, Math.ceil(end / blockSamples));
    // Four decimals is below one pixel on any waveform and keeps the JSON small.
    peaks[i] = Math.round(blocks.maxIn(firstBlock, endBlock) * 10_000) / 10_000;
  }
  return peaks;
}

/**
 * Decode channel 0 of the first audio stream of `filePath` with ffmpeg and
 * reduce it to `count` abs-max peaks. Returns null when the file has no audio
 * stream. Throws {@link MediaToolingMissingError} when ffmpeg is missing.
 */
export async function computeAudioPeaks(
  filePath: string,
  count: number
): Promise<AudioPeaks | null> {
  const probe = await probeAudio(filePath);
  if (!probe) return null;
  const estimatedSamples =
    probe.durationSec !== null ? probe.durationSec * probe.sampleRate : null;
  const blockSamples =
    estimatedSamples !== null
      ? Math.max(1, Math.floor(estimatedSamples / (count * BLOCKS_PER_PEAK)))
      : FALLBACK_BLOCK_SAMPLES;

  const blocks = new BlockMaxima();
  let totalSamples = 0;
  let blockMax = 0;
  let inBlock = 0;
  // A float can straddle two stdout chunks; its first bytes wait here.
  let carry = Buffer.alloc(0);

  const consume = (chunk: Buffer): void => {
    const data = carry.length > 0 ? Buffer.concat([carry, chunk]) : chunk;
    const whole = data.length - (data.length % 4);
    // Copy into an aligned buffer so the samples read as one typed array.
    // f32le matches every host NodeTool runs on.
    const samples = new Float32Array(whole / 4);
    new Uint8Array(samples.buffer).set(data.subarray(0, whole));
    for (let i = 0; i < samples.length; i += 1) {
      const v = Math.abs(samples[i]);
      if (v > blockMax) blockMax = v;
      inBlock += 1;
      if (inBlock === blockSamples) {
        blocks.push(blockMax);
        blockMax = 0;
        inBlock = 0;
      }
    }
    totalSamples += samples.length;
    carry = Buffer.from(data.subarray(whole));
  };

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "ffmpeg",
      [
        "-v",
        "error",
        "-nostdin",
        "-i",
        filePath,
        "-map",
        "0:a:0",
        "-af",
        "pan=mono|c0=c0",
        "-f",
        "f32le",
        "-acodec",
        "pcm_f32le",
        "-"
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    let stderr = "";
    child.stdout.on("data", consume);
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
  if (inBlock > 0) blocks.push(blockMax);

  return {
    peaks: reduceToPeaks(blocks, blockSamples, totalSamples, count),
    duration_ms: (totalSamples / probe.sampleRate) * 1000
  };
}

function peaksCacheDir(): string {
  return nodePath.join(getNodetoolCacheDir(), "audio-peaks");
}

function cacheFileFor(assetId: string, version: string, count: number): string {
  const digest = createHash("sha256")
    .update(JSON.stringify([CACHE_FORMAT_VERSION, assetId, version, count]))
    .digest("hex");
  return nodePath.join(peaksCacheDir(), `${digest}.json`);
}

async function readCached(file: string): Promise<AudioPeaks | null> {
  try {
    const parsed = JSON.parse(await fsp.readFile(file, "utf8")) as AudioPeaks;
    return Array.isArray(parsed.peaks) && typeof parsed.duration_ms === "number"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

async function writeCached(file: string, peaks: AudioPeaks): Promise<void> {
  await fsp.mkdir(nodePath.dirname(file), { recursive: true });
  // Write then rename so a concurrent reader never sees a partial file.
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(peaks));
  await fsp.rename(tmp, file);
}

/** The asset row exists but its bytes are gone from the store. */
class AssetBytesMissingError extends Error {}

/** One computation per cache file, shared by concurrent requests. */
const inFlight = new Map<string, Promise<AudioPeaks | null>>();

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers }
  });
}

/** The requested count, or null when the parameter is not a valid integer. */
function parseCount(raw: string | null): number | null {
  if (raw === null || raw === "") return DEFAULT_PEAK_COUNT;
  const count = Number(raw);
  return Number.isInteger(count) && count >= 1 && count <= MAX_PEAK_COUNT
    ? count
    : null;
}

/**
 * GET /api/assets/:id/peaks?count=<n>
 *
 * Answers `{ peaks, duration_ms }` for an audio or video asset the caller
 * owns. The `x-peaks-cache` header says whether the disk cache answered.
 */
export async function handleAssetPeaks(
  userId: string,
  assetId: string,
  searchParams: URLSearchParams
): Promise<Response> {
  const count = parseCount(searchParams.get("count"));
  if (count === null) {
    return jsonResponse(400, {
      detail: `count must be an integer from 1 to ${MAX_PEAK_COUNT}`
    });
  }
  const asset = (await Asset.get(assetId)) as Asset | null;
  // Another owner's asset is an absence, as in extract-audio.
  if (!asset || asset.user_id !== userId) {
    return jsonResponse(404, { detail: "Asset not found" });
  }
  const type = asset.content_type;
  if (!type.startsWith("audio/") && !type.startsWith("video/")) {
    return jsonResponse(400, { detail: "Asset is not audio or video" });
  }

  const adapter = getAssetAdapter();
  const localPath = await localAssetPath(
    adapter,
    asset.user_id,
    asset.id,
    type
  );
  let version: string;
  if (localPath) {
    const info = await fsp.stat(localPath);
    version = `file:${info.size}:${Math.trunc(info.mtimeMs)}`;
  } else {
    version = `row:${asset.size ?? ""}:${asset.updated_at}`;
  }
  const cacheFile = cacheFileFor(asset.id, version, count);
  const cached = await readCached(cacheFile);
  if (cached) {
    return jsonResponse(200, cached, { "x-peaks-cache": "hit" });
  }

  let pending = inFlight.get(cacheFile);
  if (!pending) {
    pending = computeForAsset(asset, localPath, count).then(async (result) => {
      if (result) {
        // An unwritable cache costs a recompute next time, not this answer.
        await writeCached(cacheFile, result).catch(() => undefined);
      }
      return result;
    });
    inFlight.set(cacheFile, pending);
    void pending.then(
      () => inFlight.delete(cacheFile),
      () => inFlight.delete(cacheFile)
    );
  }

  let result: AudioPeaks | null;
  try {
    result = await pending;
  } catch (err) {
    if (err instanceof MediaToolingMissingError) {
      return jsonResponse(503, {
        detail:
          "ffmpeg is required to compute waveform peaks. Install the ffmpeg runtime."
      });
    }
    if (err instanceof AssetBytesMissingError) {
      return jsonResponse(404, { detail: "Asset bytes not found" });
    }
    throw err;
  }
  if (!result) {
    return jsonResponse(422, { detail: "Asset has no audio stream" });
  }
  return jsonResponse(200, result, { "x-peaks-cache": "miss" });
}

/**
 * Peaks from the local file in place, or from the stored bytes written to a
 * temp file on a backend that keeps no local file.
 */
async function computeForAsset(
  asset: Asset,
  localPath: string | null,
  count: number
): Promise<AudioPeaks | null> {
  if (localPath) return computeAudioPeaks(localPath, count);
  const bytes = await retrieveAssetBytes(
    getAssetAdapter(),
    asset.user_id,
    asset.id,
    asset.content_type
  );
  if (!bytes) throw new AssetBytesMissingError();
  const dir = await fsp.mkdtemp(nodePath.join(os.tmpdir(), "nodetool-peaks-"));
  try {
    const input = nodePath.join(dir, "input");
    await fsp.writeFile(input, bytes);
    return await computeAudioPeaks(input, count);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}
