/**
 * Blender and Chrome as runtime packages: where each is unpacked, how to find
 * its executable there, and the installer the desktop Package Manager and
 * `nodetool runtime add blender|chrome` share.
 *
 * Blender comes from download.blender.org, from the newest patch of the
 * series NodeTool needs. The archive is checked against the SHA-256 file
 * Blender publishes beside it. Chrome is the current stable Chrome for
 * Testing build, which Google publishes for automation. Its download list
 * carries no digests, so the archive is trusted on its HTTPS origin.
 *
 * Each archive unpacks into a sibling directory first and replaces the old
 * install only after the executable is in place, so a failed update keeps
 * the working one. This module is Node-only and is not exported from the
 * package index.
 */
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";
import * as zlib from "node:zlib";
import { z } from "zod";

import { readZipEntries } from "./sd-cpp-runtime.js";

/**
 * Run a host tool (tar, hdiutil, ditto). child_process loads on first use, so
 * importing this module (the runtime package registry does) never needs it.
 */
async function execFileAsync(file: string, args: readonly string[]): Promise<void> {
  const { execFile } = await import("node:child_process");
  await promisify(execFile)(file, args);
}

export type AppBinaryId = "blender" | "chrome";

/** The Blender series the Package Manager installs. Matches the 5.2 floor in blender-nodes. */
export const BLENDER_SERIES = "5.2";

const BLENDER_RELEASE_DIR = `https://download.blender.org/release/Blender${BLENDER_SERIES}/`;
const CHROME_VERSIONS_URL =
  "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json";

const MARKER_FILE = "nodetool-runtime.json";
const markerSchema = z.object({ version: z.string() });

/** The Blender archive suffix for a platform, or null when Blender ships none. */
export function blenderArchiveSuffix(platform: string, arch: string): string | null {
  if (platform === "linux" && arch === "x64") return "linux-x64.tar.xz";
  if (platform === "darwin" && (arch === "arm64" || arch === "x64")) return `macos-${arch}.dmg`;
  if (platform === "win32" && (arch === "x64" || arch === "arm64")) return `windows-${arch}.zip`;
  return null;
}

/** The Chrome for Testing platform name, or null when Google ships no build. */
export function chromeForTestingPlatform(platform: string, arch: string): string | null {
  if (platform === "linux" && arch === "x64") return "linux64";
  if (platform === "darwin" && (arch === "arm64" || arch === "x64")) return `mac-${arch}`;
  if (platform === "win32") return arch === "ia32" ? "win32" : "win64";
  return null;
}

/** Whether the Package Manager can install `id` on this platform. */
export function appBinarySupported(id: AppBinaryId, platform: string, arch: string): boolean {
  return id === "blender"
    ? blenderArchiveSuffix(platform, arch) !== null
    : chromeForTestingPlatform(platform, arch) !== null;
}

/** The executable inside an install directory. */
export function appBinaryPath(id: AppBinaryId, installDir: string, platform: string): string {
  const join = platform === "win32" ? path.win32.join : path.posix.join;
  if (id === "blender") {
    if (platform === "darwin") return join(installDir, "Blender.app", "Contents", "MacOS", "Blender");
    return join(installDir, platform === "win32" ? "blender.exe" : "blender");
  }
  if (platform === "darwin") {
    return join(
      installDir,
      "Google Chrome for Testing.app",
      "Contents",
      "MacOS",
      "Google Chrome for Testing"
    );
  }
  return join(installDir, platform === "win32" ? "chrome.exe" : "chrome");
}

export interface AppBinaryStatus {
  installed: boolean;
  version?: string;
}

export async function appBinaryInstallStatus(
  id: AppBinaryId,
  installDir: string,
  platform: string
): Promise<AppBinaryStatus> {
  try {
    await fs.access(appBinaryPath(id, installDir, platform));
  } catch {
    return { installed: false };
  }
  try {
    const marker = markerSchema.safeParse(
      JSON.parse(await fs.readFile(path.join(installDir, MARKER_FILE), "utf8"))
    );
    return { installed: true, version: marker.success ? marker.data.version : undefined };
  } catch {
    // The executable is there without a marker: an install from before markers.
    return { installed: true };
  }
}

/** The installed executable, or null when the Package Manager has not installed it. */
export async function installedAppBinary(
  id: AppBinaryId,
  installDir: string | null,
  platform: string = process.platform
): Promise<string | null> {
  if (!installDir) return null;
  const status = await appBinaryInstallStatus(id, installDir, platform);
  return status.installed ? appBinaryPath(id, installDir, platform) : null;
}

export type AppBinaryInstallEvent =
  | { type: "stage"; label: string }
  | { type: "percent"; value: number };

export interface AppBinaryInstallOptions {
  installDir: string;
  platform: string;
  arch: string;
  signal?: AbortSignal;
  onEvent?: (event: AppBinaryInstallEvent) => void;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
}

interface ResolvedArchive {
  url: string;
  fileName: string;
  version: string;
  sha256: string | null;
}

async function fetchText(
  fetchImpl: typeof fetch,
  url: string,
  signal: AbortSignal | undefined
): Promise<string> {
  const response = await fetchImpl(url, { signal });
  if (!response.ok) throw new Error(`Request to ${url} failed: HTTP ${response.status}`);
  return response.text();
}

/** The newest patch of `BLENDER_SERIES` in a release directory listing, or null. */
export function newestBlenderArchive(listing: string, suffix: string): { fileName: string; version: string } | null {
  const escapedSeries = BLENDER_SERIES.replace(".", "\\.");
  const escapedSuffix = suffix.replaceAll(".", "\\.");
  const pattern = new RegExp(`blender-(${escapedSeries}\\.(\\d+))-${escapedSuffix}`, "g");
  let best: { fileName: string; version: string; patch: number } | null = null;
  for (const match of listing.matchAll(pattern)) {
    const patch = Number(match[2]);
    if (!best || patch > best.patch) {
      best = { fileName: match[0], version: match[1], patch };
    }
  }
  return best ? { fileName: best.fileName, version: best.version } : null;
}

/** The digest for `fileName` in a Blender `.sha256` file, or null. */
export function digestFor(sha256File: string, fileName: string): string | null {
  for (const line of sha256File.split("\n")) {
    const [digest, name] = line.trim().split(/\s+/);
    if (name === fileName && digest && /^[0-9a-f]{64}$/i.test(digest)) return digest.toLowerCase();
  }
  return null;
}

async function resolveBlender(options: AppBinaryInstallOptions, fetchImpl: typeof fetch): Promise<ResolvedArchive> {
  const suffix = blenderArchiveSuffix(options.platform, options.arch);
  if (!suffix) throw new Error(`Blender has no build for ${options.platform}-${options.arch}`);
  const listing = await fetchText(fetchImpl, BLENDER_RELEASE_DIR, options.signal);
  const newest = newestBlenderArchive(listing, suffix);
  if (!newest) throw new Error(`No Blender ${BLENDER_SERIES} build for ${suffix} is listed at ${BLENDER_RELEASE_DIR}`);
  const sums = await fetchText(fetchImpl, `${BLENDER_RELEASE_DIR}blender-${newest.version}.sha256`, options.signal);
  const sha256 = digestFor(sums, newest.fileName);
  if (!sha256) throw new Error(`blender-${newest.version}.sha256 has no digest for ${newest.fileName}`);
  return { url: `${BLENDER_RELEASE_DIR}${newest.fileName}`, fileName: newest.fileName, version: newest.version, sha256 };
}

const chromeVersionsSchema = z.object({
  channels: z.object({
    Stable: z.object({
      version: z.string(),
      downloads: z.object({
        chrome: z.array(z.object({ platform: z.string(), url: z.string().url() }))
      })
    })
  })
});

async function resolveChrome(options: AppBinaryInstallOptions, fetchImpl: typeof fetch): Promise<ResolvedArchive> {
  const platform = chromeForTestingPlatform(options.platform, options.arch);
  if (!platform) throw new Error(`Chrome for Testing has no build for ${options.platform}-${options.arch}`);
  const stable = chromeVersionsSchema.parse(
    JSON.parse(await fetchText(fetchImpl, CHROME_VERSIONS_URL, options.signal))
  ).channels.Stable;
  const download = stable.downloads.chrome.find((entry) => entry.platform === platform);
  if (!download) throw new Error(`Chrome for Testing ${stable.version} has no ${platform} download`);
  const url = new URL(download.url);
  if (url.protocol !== "https:") throw new Error(`Refusing a Chrome download over ${url.protocol}`);
  return { url: download.url, fileName: `chrome-${platform}.zip`, version: stable.version, sha256: null };
}

/** Stream a download to `file`, reporting progress, and return its SHA-256. */
async function download(
  fetchImpl: typeof fetch,
  url: string,
  file: string,
  options: AppBinaryInstallOptions
): Promise<string> {
  const response = await fetchImpl(url, { signal: options.signal });
  if (!response.ok || !response.body) throw new Error(`Download of ${url} failed: HTTP ${response.status}`);
  const total = Number(response.headers.get("content-length") ?? 0);
  const hash = createHash("sha256");
  const out = createWriteStream(file);
  const closed = new Promise<void>((resolve, reject) => {
    out.on("finish", resolve);
    out.on("error", reject);
  });
  let received = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
      received += value.byteLength;
      if (!out.write(value)) {
        await new Promise<void>((resolve) => out.once("drain", resolve));
      }
      if (total > 0) {
        options.onEvent?.({ type: "percent", value: Math.min(90, Math.round((received / total) * 90)) });
      }
    }
  } finally {
    out.end();
    await closed;
  }
  return hash.digest("hex");
}

/** Unpack a zip in process, keeping Unix modes and symlinks (macOS app bundles hold both). */
async function unzipInProcess(archiveFile: string, dest: string): Promise<void> {
  const root = path.resolve(dest);
  for (const entry of readZipEntries(await fs.readFile(archiveFile), zlib)) {
    const target = path.resolve(root, entry.name);
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new Error(`The archive holds an entry outside its root: ${entry.name}`);
    }
    if (entry.name.endsWith("/")) {
      await fs.mkdir(target, { recursive: true });
      continue;
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    const kind = entry.mode & 0o170000;
    if (kind === 0o120000) {
      const link = Buffer.from(entry.data).toString("utf8");
      const resolved = path.resolve(path.dirname(target), link);
      if (path.isAbsolute(link) || (resolved !== root && !resolved.startsWith(root + path.sep))) {
        throw new Error(`The archive holds a link outside its root: ${entry.name}`);
      }
      await fs.symlink(link, target);
      continue;
    }
    await fs.writeFile(target, entry.data, { mode: entry.mode & 0o777 || 0o644 });
  }
}

async function unpack(archiveFile: string, fileName: string, dest: string, platform: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  if (fileName.endsWith(".tar.xz")) {
    await execFileAsync("tar", ["-xJf", archiveFile, "-C", dest]);
  } else if (fileName.endsWith(".dmg")) {
    const mount = `${dest}.mount`;
    await fs.mkdir(mount, { recursive: true });
    await execFileAsync("hdiutil", ["attach", "-nobrowse", "-readonly", "-mountpoint", mount, archiveFile]);
    try {
      await execFileAsync("ditto", [path.join(mount, "Blender.app"), path.join(dest, "Blender.app")]);
    } finally {
      await execFileAsync("hdiutil", ["detach", mount, "-force"]).catch(() => {
        // A busy mount detaches when the system releases it; the copy is complete.
      });
      await fs.rm(mount, { recursive: true, force: true });
    }
  } else if (platform === "win32") {
    // Windows 10 and later ship bsdtar, which reads zip and streams a large archive.
    await execFileAsync("tar", ["-xf", archiveFile, "-C", dest]);
  } else {
    await unzipInProcess(archiveFile, dest);
  }
}

/**
 * The directory holding the executable: the staging root, or the single
 * top-level folder the archive unpacked into.
 */
async function contentRoot(id: AppBinaryId, staging: string, platform: string): Promise<string> {
  const exists = async (dir: string): Promise<boolean> =>
    fs.access(appBinaryPath(id, dir, platform)).then(() => true, () => false);
  if (await exists(staging)) return staging;
  for (const entry of await fs.readdir(staging, { withFileTypes: true })) {
    if (entry.isDirectory() && (await exists(path.join(staging, entry.name)))) {
      return path.join(staging, entry.name);
    }
  }
  throw new Error(`The ${id} archive holds no ${path.basename(appBinaryPath(id, staging, platform))}`);
}

/** Download, verify and unpack Blender or Chrome into `installDir`. */
export async function installAppBinary(id: AppBinaryId, options: AppBinaryInstallOptions): Promise<AppBinaryStatus> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const { installDir, platform, onEvent } = options;
  onEvent?.({ type: "stage", label: id === "blender" ? `Finding the newest Blender ${BLENDER_SERIES}` : "Finding the current Chrome for Testing" });
  const archive = id === "blender" ? await resolveBlender(options, fetchImpl) : await resolveChrome(options, fetchImpl);

  await fs.mkdir(path.dirname(installDir), { recursive: true });
  const archiveFile = `${installDir}.download`;
  const staging = `${installDir}.partial`;
  try {
    onEvent?.({ type: "stage", label: `Downloading ${archive.fileName}` });
    const digest = await download(fetchImpl, archive.url, archiveFile, options);
    if (archive.sha256 && digest !== archive.sha256) {
      throw new Error(`${archive.fileName} failed its SHA-256 check (got ${digest})`);
    }
    onEvent?.({ type: "stage", label: `Unpacking ${archive.fileName}` });
    await fs.rm(staging, { recursive: true, force: true });
    await unpack(archiveFile, archive.fileName, staging, platform);
    const root = await contentRoot(id, staging, platform);
    await fs.writeFile(path.join(root, MARKER_FILE), `${JSON.stringify({ version: archive.version, url: archive.url })}\n`);
    await fs.rm(installDir, { recursive: true, force: true });
    await fs.rename(root, installDir);
  } finally {
    await fs.rm(archiveFile, { force: true });
    await fs.rm(staging, { recursive: true, force: true });
  }
  onEvent?.({ type: "percent", value: 100 });
  return { installed: true, version: archive.version };
}

export async function uninstallAppBinary(installDir: string): Promise<void> {
  await fs.rm(installDir, { recursive: true, force: true });
}
