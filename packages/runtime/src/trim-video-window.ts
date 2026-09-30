import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const execFile = promisify(execFileCallback);

/**
 * Materialize the exact constant-speed source window sent to a video editor.
 * The source asset remains untouched in storage. The returned MP4 starts at
 * time zero so providers receive the same window-relative contract as the
 * timeline candidate.
 */
export async function trimVideoWindow(
  input: Uint8Array,
  startMs: number,
  endMs: number,
  signal?: AbortSignal
): Promise<Uint8Array> {
  if (
    input.length === 0 ||
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    startMs < 0 ||
    endMs <= startMs
  ) {
    throw new Error(
      "Video edit source window must be a positive finite range."
    );
  }
  signal?.throwIfAborted();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-video-edit-"));
  const inputPath = path.join(dir, "input.mp4");
  const outputPath = path.join(dir, "window.mp4");
  try {
    await fs.writeFile(inputPath, input);
    await execFile(
      "ffmpeg",
      [
        "-y",
        "-i",
        inputPath,
        "-ss",
        String(startMs / 1000),
        "-t",
        String((endMs - startMs) / 1000),
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        outputPath
      ],
      { maxBuffer: 50 * 1024 * 1024, signal }
    );
    return new Uint8Array(await fs.readFile(outputPath));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
