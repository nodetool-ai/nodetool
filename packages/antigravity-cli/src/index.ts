import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { constants, createReadStream, createWriteStream } from "node:fs";
import {
  access,
  chmod,
  link,
  mkdir,
  mkdtemp,
  rm,
  stat
} from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { getNodetoolDataDir } from "@nodetool-ai/config";
import { z } from "zod";

const RELEASE_SERVER =
  "https://antigravity-cli-auto-updater-974169037036.us-central1.run.app";
const manifestSchema = z.object({
  version: z.string().min(1),
  url: z.url().refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "storage.googleapis.com" &&
      url.port === "" &&
      !url.username &&
      !url.password &&
      url.pathname.startsWith("/antigravity-public/antigravity-cli/")
    );
  }, "Expected an official Antigravity release URL"),
  sha512: z.string().regex(/^[a-fA-F0-9]{128}$/)
});

/** Location of NodeTool's managed Antigravity executable. */
export function getAntigravityBinaryPath(): string {
  return join(getNodetoolDataDir(), "bin", "antigravity", "agy");
}

/** Prefer the managed executable, otherwise retain system CLI discovery. */
export async function resolveAntigravityCommand(): Promise<string> {
  const binary = getAntigravityBinaryPath();
  return (await isExecutable(binary)) ? binary : "agy";
}

async function isExecutable(binary: string): Promise<boolean> {
  try {
    await access(binary, constants.X_OK);
    return (await stat(binary)).isFile();
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "EACCES")
    ) {
      return false;
    }
    throw error;
  }
}

/** Map Node's platform and architecture to the upstream Unix manifest names. */
export function getAntigravityPlatform(
  platform: string = process.platform,
  arch: string = process.arch,
  musl = false
): string {
  if (
    !["darwin", "linux", "android"].includes(platform) ||
    !["x64", "arm64"].includes(arch)
  ) {
    throw new Error(`Unsupported Antigravity platform: ${platform}/${arch}`);
  }
  return `${platform}_${arch === "x64" ? "amd64" : "arm64"}${platform === "linux" && musl ? "_musl" : ""}`;
}

async function detectMusl(): Promise<boolean> {
  if (process.platform !== "linux") {
    return false;
  }
  try {
    await access(
      `/lib/libc.musl-${process.arch === "arm64" ? "aarch64" : "x86_64"}.so.1`
    );
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function fetchRelease(
  url: string,
  signal: AbortSignal
): Promise<Response> {
  const response = await fetch(url, { signal, redirect: "error" });
  if (!response.ok) {
    throw new Error(`Antigravity download failed: HTTP ${response.status}`);
  }
  return response;
}

async function extractBinary(
  archive: string,
  binary: string,
  signal: AbortSignal
): Promise<void> {
  // Stream only this member's bytes. Never extract archive paths or links to disk.
  const child = spawn("tar", ["-xOzf", archive, "antigravity"], {
    signal,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", (data: Buffer) => {
    stderr = (stderr + data.toString()).slice(-8192);
  });
  const exited = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Antigravity extraction failed (${code}): ${stderr}`));
      }
    });
  });
  try {
    await Promise.all([
      exited,
      pipeline(
        child.stdout,
        createWriteStream(binary, { flags: "wx", mode: 0o600 }),
        { signal }
      )
    ]);
  } finally {
    if (child.exitCode === null) {
      child.kill();
    }
    await exited.catch(() => undefined);
  }
}

/** Download and verify the CLI without running it or changing shell profiles. */
export async function installAntigravity(
  options: { signal?: AbortSignal } = {}
): Promise<string> {
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(300_000)])
    : AbortSignal.timeout(300_000);
  signal.throwIfAborted();
  const platform = getAntigravityPlatform(
    process.platform,
    process.arch,
    await detectMusl()
  );
  const binary = getAntigravityBinaryPath();
  if (await isExecutable(binary)) {
    return binary;
  }
  const response = await fetchRelease(
    `${RELEASE_SERVER}/manifests/${platform}.json`,
    signal
  );
  const manifest = manifestSchema.parse(await response.json());
  const directory = join(getNodetoolDataDir(), "bin", "antigravity");
  await mkdir(directory, { recursive: true });
  const staging = await mkdtemp(join(directory, ".install-"));
  try {
    const payload = join(staging, "payload");
    const download = await fetchRelease(manifest.url, signal);
    if (!download.body) {
      throw new Error("Antigravity download returned no body");
    }
    await pipeline(
      download.body,
      createWriteStream(payload, { flags: "wx", mode: 0o600 }),
      { signal }
    );
    const hash = createHash("sha512");
    await pipeline(createReadStream(payload), hash, { signal });
    if (hash.digest("hex") !== manifest.sha512.toLowerCase()) {
      throw new Error("Antigravity SHA-512 checksum mismatch");
    }
    const stagedBinary = join(staging, "agy");
    const archive = new URL(manifest.url).pathname.endsWith(".tar.gz");
    if (archive) {
      await extractBinary(payload, stagedBinary, signal);
    } else {
      await link(payload, stagedBinary);
    }
    if ((await stat(stagedBinary)).size === 0) {
      throw new Error("Antigravity binary is empty");
    }
    await chmod(stagedBinary, 0o755);
    signal.throwIfAborted();
    try {
      // Publish a complete executable atomically without overwriting another installer.
      await link(stagedBinary, binary);
    } catch (error) {
      if (
        !(
          error instanceof Error &&
          "code" in error &&
          error.code === "EEXIST" &&
          (await isExecutable(binary))
        )
      ) {
        throw error;
      }
    }
    return binary;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
