/**
 * Thin ffmpeg/ffprobe wrappers used by the asset audio-extraction endpoint.
 * Mirrors the invocation style already used by @nodetool-ai/video-nodes
 * (bare `ffmpeg`/`ffprobe` binaries resolved from PATH).
 */
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const execFile = promisify(execFileCb);

/**
 * Thrown when the `ffmpeg`/`ffprobe` binaries are not on PATH (ENOENT), so the
 * caller can distinguish "tooling missing" (a 503 the operator must fix) from
 * "this media has no audio" (a normal 200 `{ has_audio: false }`).
 */
export class MediaToolingMissingError extends Error {
  constructor(message = "ffmpeg/ffprobe not found on PATH") {
    super(message);
    this.name = "MediaToolingMissingError";
  }
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}

/**
 * True if the media file at `filePath` contains at least one audio stream.
 * Returns false only when ffprobe ran and reported no audio stream; throws
 * {@link MediaToolingMissingError} if the binary is missing.
 */
export async function probeHasAudio(filePath: string): Promise<boolean> {
  try {
    const { stdout } = await execFile("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "a",
      "-show_entries",
      "stream=codec_type",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath
    ]);
    return stdout.trim().length > 0;
  } catch (err) {
    if (isEnoent(err)) {
      throw new MediaToolingMissingError();
    }
    return false;
  }
}

/**
 * Duration of the media at `filePath` in milliseconds, or null if ffprobe ran
 * but produced no parseable duration. Throws {@link MediaToolingMissingError}
 * if the binary is missing.
 */
export async function probeDurationMs(
  filePath: string
): Promise<number | null> {
  try {
    const { stdout } = await execFile("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath
    ]);
    const seconds = parseFloat(stdout.trim());
    return Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;
  } catch (err) {
    if (isEnoent(err)) {
      throw new MediaToolingMissingError();
    }
    return null;
  }
}

/**
 * Extract the audio track of the media at `inputPath` to 16-bit PCM WAV and
 * return the encoded bytes alongside the WAV's duration. Manages its own temp
 * output directory. Throws if ffmpeg fails (e.g. the input has no audio) or
 * {@link MediaToolingMissingError} if the binary is missing.
 */
export async function extractAudio(
  inputPath: string
): Promise<{ bytes: Uint8Array; durationMs: number | null }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-extract-"));
  const outputPath = path.join(dir, "output.wav");
  try {
    await execFile(
      "ffmpeg",
      ["-y", "-i", inputPath, "-vn", "-acodec", "pcm_s16le", outputPath],
      { maxBuffer: 50 * 1024 * 1024 }
    );
    const durationMs = await probeDurationMs(outputPath);
    const bytes = new Uint8Array(await fs.readFile(outputPath));
    return { bytes, durationMs };
  } catch (err) {
    if (isEnoent(err)) {
      throw new MediaToolingMissingError();
    }
    throw err;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
