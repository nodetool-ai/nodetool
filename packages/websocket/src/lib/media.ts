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

/** True if the media file at `filePath` contains at least one audio stream. */
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
  } catch {
    return false;
  }
}

/**
 * Extract the audio track of `videoBytes` to 16-bit PCM WAV and return the
 * encoded bytes. Throws if ffmpeg fails (e.g. the input has no audio).
 */
export async function extractAudioWav(
  videoBytes: Uint8Array
): Promise<Uint8Array> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-extract-"));
  const inputPath = path.join(dir, "input");
  const outputPath = path.join(dir, "output.wav");
  try {
    await fs.writeFile(inputPath, videoBytes);
    await execFile(
      "ffmpeg",
      ["-y", "-i", inputPath, "-vn", "-acodec", "pcm_s16le", outputPath],
      { maxBuffer: 50 * 1024 * 1024 }
    );
    return new Uint8Array(await fs.readFile(outputPath));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
