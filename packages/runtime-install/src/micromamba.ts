/**
 * Finding, downloading and running micromamba under the host's own root
 * prefix. Every command runs with `MAMBA_ROOT_PREFIX` set to that root, so
 * its package-cache lock is the only one these commands take. Locks under
 * `~/.mamba` or the user's own `MAMBA_ROOT_PREFIX` belong to other micromamba
 * installs and are never touched.
 */
import { spawn, spawnSync } from "node:child_process";
import { promises as fs, writeFileSync } from "node:fs";
import type { Stats } from "node:fs";
import * as http from "node:http";
import * as https from "node:https";
import * as os from "node:os";
import * as path from "node:path";

import { runExclusive } from "./exclusive.js";
import { fileExists, isErrnoException } from "./fs.js";
import { errorMessage, outputLines, reportOutput, reportStatus, type RuntimeInstallHost } from "./host.js";

export const MICROMAMBA_VERSION = "2.3.3-0";
const MICROMAMBA_BASE_URL = `https://github.com/mamba-org/micromamba-releases/releases/download/${MICROMAMBA_VERSION}`;
const MICROMAMBA_ENV_VAR = "MICROMAMBA_EXE";
const MICROMAMBA_BUNDLED_DIR_NAME = "micromamba";
const MICROMAMBA_LOCK_STALE_THRESHOLD_MS = 10 * 60 * 1000;
const MICROMAMBA_LOCK_ERROR_PATTERN = /could not set lock|cannot lock/i;

/** micromamba found or downloaded for each root prefix in this process. */
const resolvedExecutables = new Map<string, string>();

export function micromambaRootPrefix(host: RuntimeInstallHost): string {
  return path.join(host.dataDir, "micromamba");
}

function executableName(host: RuntimeInstallHost): string {
  return host.platform === "win32" ? "micromamba.exe" : "micromamba";
}

function downloadedExecutablePath(host: RuntimeInstallHost): string {
  return path.join(micromambaRootPrefix(host), "bin", executableName(host));
}

function lockPath(host: RuntimeInstallHost): string {
  return path.join(micromambaRootPrefix(host), "pkgs", "pkgs.lock");
}

async function removeStaleLock(
  host: RuntimeInstallHost,
  file: string,
  options?: { force?: boolean }
): Promise<void> {
  let stats: Stats | null = null;
  try {
    stats = await fs.stat(file);
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return;
    }
    host.log("warn", `Failed to inspect micromamba lock at ${file}: ${errorMessage(error)}`);
    if (!options?.force) {
      return;
    }
  }

  if (!options?.force && stats && Date.now() - stats.mtimeMs < MICROMAMBA_LOCK_STALE_THRESHOLD_MS) {
    return;
  }

  try {
    await fs.rm(file, { force: true });
    const age = stats ? ` (${Math.round((Date.now() - stats.mtimeMs) / 1000)}s old)` : "";
    if (options?.force) {
      host.log("warn", `Force-removed micromamba lock${age} at ${file}`);
    } else if (stats) {
      host.log("info", `Removed stale micromamba lock${age} at ${file}`);
    }
  } catch (error) {
    host.log("warn", `Failed to remove micromamba lock at ${file}: ${errorMessage(error)}`);
  }
}

function runsVersion(candidate: string | undefined | null): string {
  if (!candidate) {
    return "";
  }
  try {
    if (spawnSync(candidate, ["--version"], { stdio: "ignore" }).status === 0) {
      return candidate;
    }
  } catch {
    // Not runnable; keep searching.
  }
  return "";
}

/** The conda platform directory a bundled micromamba lives in. */
function condaPlatformDir(platform: NodeJS.Platform, arch: string): string | null {
  if (platform === "win32") return "win-64";
  if (platform === "darwin") return arch === "arm64" ? "osx-arm64" : "osx-64";
  if (platform === "linux") return arch === "arm64" ? "linux-aarch64" : "linux-64";
  return null;
}

async function findBundledExecutable(host: RuntimeInstallHost): Promise<string | null> {
  const platformDir = condaPlatformDir(host.platform, host.arch);
  if (!platformDir) {
    return null;
  }
  for (const baseDir of host.micromambaResourceDirs()) {
    const platformSpecific = path.join(
      baseDir,
      MICROMAMBA_BUNDLED_DIR_NAME,
      platformDir,
      host.platform === "win32" ? "Library/bin/micromamba.exe" : "bin/micromamba"
    );
    if (await fileExists(platformSpecific)) {
      return platformSpecific;
    }
    // The flat layout of older bundles.
    const legacy = path.join(baseDir, MICROMAMBA_BUNDLED_DIR_NAME, executableName(host));
    if (await fileExists(legacy)) {
      return legacy;
    }
  }
  return null;
}

export function micromambaDownloadUrl(platform: NodeJS.Platform, arch: string): string | null {
  if (platform === "darwin") {
    return `${MICROMAMBA_BASE_URL}/micromamba-${arch === "arm64" ? "osx-arm64" : "osx-64"}`;
  }
  if (platform === "linux") {
    return `${MICROMAMBA_BASE_URL}/micromamba-${arch === "arm64" ? "linux-aarch64" : "linux-64"}`;
  }
  if (platform === "win32" && arch === "x64") {
    return `${MICROMAMBA_BASE_URL}/micromamba-win-64.exe`;
  }
  return null;
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: Error): void => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };
    const request = (requestUrl: string): void => {
      const protocol = requestUrl.startsWith("https") ? https : http;
      const req = protocol.get(requestUrl, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.destroy();
          request(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          res.destroy();
          fail(new Error(`HTTP ${res.statusCode} downloading micromamba`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          if (settled) return;
          try {
            writeFileSync(dest, Buffer.concat(chunks));
            settled = true;
            resolve();
          } catch (error) {
            fail(error instanceof Error ? error : new Error(String(error)));
          }
        });
        res.on("error", fail);
      });
      req.on("error", fail);
      req.setTimeout(60000, () => {
        req.destroy();
        fail(new Error("Download timeout"));
      });
    };
    request(url);
  });
}

async function downloadMicromamba(host: RuntimeInstallHost): Promise<string> {
  const url = micromambaDownloadUrl(host.platform, host.arch);
  if (!url) {
    throw new Error(`No micromamba download URL for platform ${host.platform}/${host.arch}`);
  }
  const dest = downloadedExecutablePath(host);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  host.log("info", `Downloading micromamba from ${url} to ${dest}`);
  await downloadFile(url, dest);
  if (host.platform !== "win32") {
    await fs.chmod(dest, 0o755);
  }
  host.log("info", `micromamba downloaded to ${dest}`);
  reportStatus(host, "micromamba ready");
  return dest;
}

/**
 * The micromamba to run: `MICROMAMBA_EXE`, the bundled binary, one on PATH,
 * one downloaded earlier, else the pinned release downloaded now.
 */
export async function ensureMicromambaAvailable(host: RuntimeInstallHost): Promise<string> {
  const explicit = runsVersion(process.env[MICROMAMBA_ENV_VAR]?.trim());
  if (explicit) {
    host.log("info", `Using micromamba from ${explicit}`);
    return explicit;
  }
  const root = micromambaRootPrefix(host);
  const cached = resolvedExecutables.get(root);
  if (cached) {
    return cached;
  }
  const bundled = await findBundledExecutable(host);
  if (bundled) {
    host.log("info", `Using bundled micromamba at ${bundled}`);
    resolvedExecutables.set(root, bundled);
    return bundled;
  }
  const onPath = runsVersion("micromamba");
  if (onPath) {
    host.log("info", `Using micromamba from system PATH: ${onPath}`);
    return onPath;
  }
  const local = downloadedExecutablePath(host);
  if (await fileExists(local)) {
    host.log("info", `Using previously installed micromamba at ${local}`);
    resolvedExecutables.set(root, local);
    return local;
  }
  host.log("info", "micromamba not found locally — downloading on demand...");
  reportStatus(host, "Downloading micromamba...");
  const downloaded = await downloadMicromamba(host);
  resolvedExecutables.set(root, downloaded);
  return downloaded;
}

interface MicromambaCommandError extends Error {
  lockErrorDetected?: boolean;
}

function micromambaEnv(host: RuntimeInstallHost): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      env[key] = value;
    }
  }
  env.MAMBA_ROOT_PREFIX = micromambaRootPrefix(host);
  if (!env.HOME) {
    env.HOME = os.homedir();
  }
  if (host.platform === "win32") {
    const homeDir = env.HOME || os.homedir();
    if (homeDir) {
      env.USERPROFILE = env.USERPROFILE || homeDir;
      const parsedHome = path.win32.parse(homeDir);
      const drive = parsedHome.root?.replace(/\\$/, "");
      if (drive) {
        env.HOMEDRIVE = env.HOMEDRIVE || drive;
        const relativePath = homeDir.substring(parsedHome.root.length);
        if (relativePath) {
          env.HOMEPATH = env.HOMEPATH || `\\${relativePath.replace(/^\\+/, "")}`;
        }
      }
    }
  }
  return env;
}

function executeMicromamba(
  host: RuntimeInstallHost,
  executable: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  progressAction: string
): Promise<void> {
  const child = spawn(executable, [...args], {
    env,
    stdio: "pipe",
    // Prevent a console window from flashing on Windows while micromamba runs.
    windowsHide: true,
  });
  let lockErrorDetected = false;
  return new Promise<void>((resolve, reject) => {
    child.stdout?.on("data", (data: Buffer) => {
      for (const line of outputLines(data)) {
        reportOutput(host, `micromamba stdout: ${line}`);
      }
    });
    child.stderr?.on("data", (data: Buffer) => {
      for (const line of outputLines(data)) {
        reportOutput(host, `micromamba stderr: ${line}`, "error");
        if (MICROMAMBA_LOCK_ERROR_PATTERN.test(line)) {
          lockErrorDetected = true;
        }
      }
    });
    child.on("close", (code) => {
      if (code === 0) {
        host.progress?.("Python environment", 100, progressAction, "Done");
        resolve();
        return;
      }
      const error: MicromambaCommandError = new Error(`micromamba exited with code ${code}`);
      if (lockErrorDetected) {
        error.lockErrorDetected = true;
      }
      reject(error);
    });
    child.on("error", (error) => {
      reject(new Error(`Failed to run micromamba: ${error.message}`));
    });
  });
}

/**
 * Run one micromamba command. Commands queue on the root prefix: two at once
 * share one package cache and would fail on each other's lock. A lock error
 * clears the lock and retries once.
 */
export async function runMicromambaCommand(
  host: RuntimeInstallHost,
  executable: string,
  args: readonly string[],
  progressAction: string
): Promise<void> {
  if (!executable) {
    throw new Error("micromamba executable path is empty");
  }
  const root = micromambaRootPrefix(host);
  await fs.mkdir(root, { recursive: true });
  const env = micromambaEnv(host);

  const runOnce = async (): Promise<void> => {
    host.log("info", `Running micromamba command: ${executable} ${args.join(" ")}`);
    reportStatus(host, `${progressAction}...`);
    host.progress?.("Python environment", 10, progressAction, "Resolving");
    // A lock younger than the stale threshold may belong to a live
    // micromamba, so only an old one is removed before the command runs.
    await removeStaleLock(host, lockPath(host));
    await executeMicromamba(host, executable, args, env, progressAction);
  };

  await runExclusive(root, async () => {
    try {
      await runOnce();
    } catch (error) {
      if ((error as MicromambaCommandError)?.lockErrorDetected) {
        host.log("warn", "micromamba reported a lock error, forcing lock cleanup and retrying");
        await removeStaleLock(host, lockPath(host), { force: true });
        await runOnce();
      } else {
        throw error;
      }
    }
  });
}
