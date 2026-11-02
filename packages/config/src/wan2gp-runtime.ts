/**
 * The Wan2GP runtime: the release NodeTool pins, where it is installed, and
 * the installer the desktop Package Manager and `nodetool runtime add wan2gp`
 * share.
 *
 * The source is the upstream GitHub archive of the pinned commit. Wan2GP's own
 * unattended installer (`setup.py install --env uv --auto`) then builds its
 * Python environment: it reads the GPU, picks the matching Python, PyTorch
 * and attention kernels, and installs Wan2GP's requirements with uv. NodeTool
 * starts the installed server on demand (`wan2gp-server.ts` in the runtime).
 *
 * Each release goes into its own directory, because the environment's
 * interpreter links into it by absolute path. `current.json` names the release
 * that runs. An update leaves the previous release in place until the new one
 * is complete. Model weights live in `ckpts/` beside the releases, linked into
 * each one, so an update keeps them.
 */
import { z } from "zod";
import { importNodeBuiltin, safeProcessEnv } from "./node-import.js";
import { readZipEntries } from "./sd-cpp-runtime.js";

/** Wan2GP v19.02, MCP API v2.1. */
export const WAN2GP_COMMIT = "616e60506aff10086bbbde02a3bf4554c572adde";
export const WAN2GP_VERSION = "v19.02";

const ARCHIVE_URL = `https://codeload.github.com/deepbeepmeep/Wan2GP/zip/${WAN2GP_COMMIT}`;
const MARKER_FILE = "current.json";
/** Entries of the install directory that outlive a release. */
const SHARED_ENTRIES = new Set([MARKER_FILE, "python", "ckpts"]);
const markerSchema = z.object({
  commit: z.string(),
  version: z.string(),
  release: z.string()
});

export interface Wan2GPInstallStatus {
  installed: boolean;
  version?: string;
  commit?: string;
  /** The Wan2GP source directory, which `wgp.py` runs from. */
  sourceDir?: string;
  /** The interpreter of Wan2GP's environment. */
  python?: string;
}

function venvPython(sourceDir: string, platform: string, join: (...parts: string[]) => string): string {
  return platform === "win32"
    ? join(sourceDir, "env_uv", "Scripts", "python.exe")
    : join(sourceDir, "env_uv", "bin", "python");
}

export async function wan2gpInstallStatus(installDir: string, platform: string): Promise<Wan2GPInstallStatus> {
  const fs = await importNodeBuiltin<typeof import("node:fs/promises")>("node:fs/promises");
  const path = await importNodeBuiltin<typeof import("node:path")>("node:path");
  if (!fs || !path) return { installed: false };
  try {
    const marker = markerSchema.parse(JSON.parse(await fs.readFile(path.join(installDir, MARKER_FILE), "utf8")));
    const sourceDir = path.join(installDir, marker.release, "Wan2GP");
    const python = venvPython(sourceDir, platform, path.join);
    await fs.access(path.join(sourceDir, "wgp.py"));
    await fs.access(python);
    return { installed: true, version: marker.version, commit: marker.commit, sourceDir, python };
  } catch {
    return { installed: false };
  }
}

export type Wan2GPInstallEvent =
  | { type: "stage"; label: string }
  | { type: "percent"; value: number }
  | { type: "log"; line: string };

export interface Wan2GPInstallOptions {
  installDir: string;
  platform: string;
  /** A Python 3.10 or newer to run Wan2GP's installer with. */
  python: string;
  /** The uv executable Wan2GP's installer creates its environment with. */
  uv: string;
  /** One of Wan2GP's hardware profiles, such as RTX_40, instead of the detected one. */
  profile?: string;
  signal?: AbortSignal;
  onEvent?: (event: Wan2GPInstallEvent) => void;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
  /** Injected in tests: a commit other than the pinned one. */
  commit?: string;
  archiveUrl?: string;
}

/** Environment for the installer: no inherited Python markers, uv first on PATH. */
function installerEnv(
  uvDir: string,
  pythonDir: string,
  delimiter: string,
  base: Record<string, string | undefined>
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(base)) {
    if (value !== undefined) env[key] = value;
  }
  for (const key of ["PYTHONPATH", "PYTHONHOME", "VIRTUAL_ENV", "CONDA_PREFIX", "UV_PYTHON", "PIP_REQUIRE_VIRTUALENV"]) {
    delete env[key];
  }
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === "PATH") ?? "PATH";
  env[pathKey] = [uvDir, env[pathKey]].filter(Boolean).join(delimiter);
  // The Python uv downloads for the environment stays inside the install.
  env.UV_PYTHON_INSTALL_DIR = pythonDir;
  env.UV_PYTHON_PREFERENCE = "only-managed";
  env.PYTHONUNBUFFERED = "1";
  return env;
}

/**
 * Download the pinned source, run Wan2GP's unattended installer, and make
 * the result the current release. Rejects with the installer's last lines
 * of output when it fails, for example on a machine whose GPU has no
 * Wan2GP profile.
 */
export async function installWan2GP(options: Wan2GPInstallOptions): Promise<Wan2GPInstallStatus> {
  const { installDir, platform, signal, onEvent } = options;
  const commit = options.commit ?? WAN2GP_COMMIT;
  const fs = await importNodeBuiltin<typeof import("node:fs/promises")>("node:fs/promises");
  const path = await importNodeBuiltin<typeof import("node:path")>("node:path");
  const zlib = await importNodeBuiltin<typeof import("node:zlib")>("node:zlib");
  const childProcess = await importNodeBuiltin<typeof import("node:child_process")>("node:child_process");
  if (!fs || !path || !zlib || !childProcess) {
    throw new Error("Installing Wan2GP requires Node.js");
  }

  onEvent?.({ type: "stage", label: `Downloading Wan2GP ${WAN2GP_VERSION}` });
  const response = await (options.fetchImpl ?? fetch)(options.archiveUrl ?? ARCHIVE_URL, { signal, redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Download of Wan2GP ${commit.slice(0, 7)} failed: HTTP ${response.status}`);
  }
  const archive = Buffer.from(await response.arrayBuffer());

  const release = commit.slice(0, 12);
  const releaseDir = path.join(installDir, release);
  const sourceDir = path.join(releaseDir, "Wan2GP");
  onEvent?.({ type: "stage", label: "Unpacking Wan2GP" });
  await fs.rm(releaseDir, { recursive: true, force: true });
  await fs.mkdir(sourceDir, { recursive: true });
  const root = path.resolve(sourceDir);
  let unpacked = 0;
  for (const entry of readZipEntries(archive, zlib)) {
    // GitHub archives hold one top folder, Wan2GP-<commit>/.
    const slash = entry.name.indexOf("/");
    const relative = slash >= 0 ? entry.name.slice(slash + 1) : "";
    if (!relative) continue;
    const target = path.resolve(root, relative);
    if (!target.startsWith(root + path.sep)) {
      throw new Error(`The Wan2GP archive holds an entry outside its root: ${entry.name}`);
    }
    if (relative.endsWith("/")) {
      await fs.mkdir(target, { recursive: true });
      continue;
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, entry.data);
    unpacked += 1;
  }
  await fs.access(path.join(sourceDir, "setup.py")).catch(() => {
    throw new Error(`The Wan2GP archive has no setup.py (${unpacked} files unpacked)`);
  });
  // Wan2GP looks for weights in ./ckpts. Point every release at one folder.
  const weights = path.join(installDir, "ckpts");
  await fs.mkdir(weights, { recursive: true });
  await fs.rm(path.join(sourceDir, "ckpts"), { recursive: true, force: true });
  await fs.symlink(weights, path.join(sourceDir, "ckpts"), platform === "win32" ? "junction" : "dir");

  onEvent?.({ type: "stage", label: "Installing Wan2GP's Python environment" });
  const args = ["setup.py", "install", "--env", "uv", "--auto"];
  if (options.profile) args.push("--profile", options.profile);
  const env = installerEnv(path.dirname(options.uv), path.join(installDir, "python"), path.delimiter, safeProcessEnv());
  await new Promise<void>((resolve, reject) => {
    const child = childProcess.spawn(options.python, args, {
      cwd: sourceDir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    const tail: string[] = [];
    const onData = (chunk: Buffer): void => {
      for (const line of chunk.toString("utf8").split(/\r?\n/)) {
        if (!line.trim()) continue;
        tail.push(line);
        if (tail.length > 30) tail.shift();
        // setup.py announces each step as ">>> Running: <command>".
        const step = /^>>> Running(?: \(Shell\))?: (.+)$/.exec(line.trim());
        if (step) onEvent?.({ type: "stage", label: step[1].slice(0, 160) });
        onEvent?.({ type: "log", line });
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    const onAbort = (): void => {
      child.kill();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    child.once("error", (error) => {
      signal?.removeEventListener("abort", onAbort);
      reject(new Error(`Could not start Wan2GP's installer with ${options.python}: ${error.message}`));
    });
    child.once("close", (code, killSignal) => {
      signal?.removeEventListener("abort", onAbort);
      if (signal?.aborted) {
        reject(signal.reason instanceof Error ? signal.reason : new Error("Wan2GP install cancelled"));
      } else if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Wan2GP's installer failed (${code ?? killSignal}):\n${tail.join("\n")}`));
      }
    });
  });

  await fs.access(venvPython(sourceDir, platform, path.join)).catch(() => {
    throw new Error("Wan2GP's installer finished but created no env_uv environment");
  });
  await fs.writeFile(
    path.join(installDir, MARKER_FILE),
    `${JSON.stringify({ commit, version: WAN2GP_VERSION, release })}\n`
  );
  // The new release runs now. Remove the ones before it.
  for (const name of await fs.readdir(installDir)) {
    if (name !== release && !SHARED_ENTRIES.has(name)) {
      await fs.rm(path.join(installDir, name), { recursive: true, force: true });
    }
  }
  onEvent?.({ type: "percent", value: 100 });
  return wan2gpInstallStatus(installDir, platform);
}

export async function uninstallWan2GP(installDir: string): Promise<void> {
  const fs = await importNodeBuiltin<typeof import("node:fs/promises")>("node:fs/promises");
  await fs?.rm(installDir, { recursive: true, force: true });
}
