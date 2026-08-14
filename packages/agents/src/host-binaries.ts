/**
 * Spawn a PATH binary with argv (no shell) inside the workspace.
 *
 * Used by the ffmpeg and yt-dlp capabilities. A missing binary is a named
 * error, not an ENOENT stack.
 */

import { spawn } from "node:child_process";
import path from "node:path";

export type HostBinaryResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export class HostBinaryMissingError extends Error {
  readonly binary: string;
  constructor(binary: string) {
    super(
      `${binary} is not installed or is not on PATH. ` +
        `Install it with the Package Manager, or add it to PATH.`
    );
    this.name = "HostBinaryMissingError";
    this.binary = binary;
  }
}

export async function runHostBinary(
  cmd: string,
  args: string[],
  opts: { cwd: string; timeoutMs: number }
): Promise<HostBinaryResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 5000);
    }, opts.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: unknown }).code)
          : "";
      if (code === "ENOENT") {
        reject(new HostBinaryMissingError(cmd));
        return;
      }
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      if (timedOut) {
        resolve({
          stdout,
          stderr: `${stderr}\nProcess timed out after ${opts.timeoutMs}ms`,
          exitCode: 124
        });
        return;
      }
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });
  });
}

const EXT_MIME: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mkv: "video/x-matroska",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  flac: "audio/flac",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif"
};

export function mimeFromFilename(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return EXT_MIME[ext] ?? "application/octet-stream";
}

export function clampTimeoutSeconds(
  raw: unknown,
  fallback: number,
  max: number
): number {
  const n = typeof raw === "number" ? raw : fallback;
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}
