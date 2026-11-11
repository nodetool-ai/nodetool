/**
 * Python node packs (nodetool-huggingface and friends): install, update and
 * remove them in the Python runtime with uv.
 *
 * The policy: one uv command at a time per environment, every installed pack
 * kept in each resolve, torch from the detected PyTorch index with a CPU
 * fallback, and torch wheels of another build reinstalled.
 */
import { spawn } from "node:child_process";

import { MIN_NODETOOL_CORE_VERSION } from "@nodetool-ai/protocol/bridge-protocol";
import { findPythonNodePack, isPythonPackSupported } from "@nodetool-ai/protocol/python-packs";

import { installCondaPackages } from "./conda.js";
import { runExclusive } from "./exclusive.js";
import { fileExists } from "./fs.js";
import { announce, errorMessage, outputLines, reportOutput, reportStatus, type RuntimeInstallHost } from "./host.js";
import { runtimeRegistryFor } from "./packages/registry.js";
import { condaPythonPath, condaUvPath } from "./paths.js";
import { fetchLatestVersionFromSimpleIndex } from "./pypi.js";
import { PYPI_SIMPLE_INDEX_URL } from "./python.js";
import {
  MIN_UV_FOR_TORCH_BACKEND,
  MIN_UV_VERSION,
  detectTorchPlatform,
  getSavedTorchPlatform,
  saveTorchPlatform,
  torchBackendArgs,
  type TorchBackend,
} from "./torch.js";
import { canonicalizePackageName, compareVersions } from "./versions.js";

/** Shape of a single entry from `uv pip list --format=json`. */
export interface PipPackage {
  name: string;
  version: string;
}

/** An installed nodetool-* distribution. */
export interface InstalledPythonPack {
  name: string;
  version: string;
  /** `nodetool-ai/<distribution name>`. */
  repo_id: string;
}

export interface PythonPackResult {
  success: boolean;
  message: string;
}

const TORCH_DEPENDENT_PACKAGES = new Set(["nodetool-huggingface", "nodetool-mlx"]);
const TORCH_FAMILY = ["torch", "torchvision", "torchaudio"];
/** The torch packages uv takes from the `--torch-backend` index. */
const TORCH_INDEX_PACKAGE = /\btorch(?:vision|audio|codec)?\b/;
/** uv's resolver failures, as opposed to network, build or CLI errors. */
const RESOLVE_FAILURE =
  /No solution found|unsatisfiable|not found in the package registry|no version of|no matching distribution/i;

function isPipPackageArray(value: unknown): value is PipPackage[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item): item is PipPackage =>
        typeof item === "object" &&
        item !== null &&
        "name" in item &&
        typeof item.name === "string" &&
        "version" in item &&
        typeof item.version === "string"
    )
  );
}

export function needsTorchPlatformDetection(packageName: string): boolean {
  return TORCH_DEPENDENT_PACKAGES.has(canonicalizePackageName(packageName));
}

/**
 * Detect the GPU platform before installing a torch-dependent pack.
 *
 * Detection runs on every such install, so a new GPU or driver is picked up.
 * A successful result is saved for installs that do not detect (the Python
 * runtime's core install). A failed detection is never saved; the install
 * then uses the last successful detection, or the fallback backend in the
 * failed result.
 */
async function detectTorchBackendForInstall(
  host: RuntimeInstallHost,
  packageNames: readonly string[]
): Promise<TorchBackend | null> {
  if (!packageNames.some(needsTorchPlatformDetection)) {
    return null;
  }
  announce(host, `Detecting GPU platform before installing ${packageNames.join(", ")}...`);
  const result = await detectTorchPlatform(host);
  if (!result.error) {
    saveTorchPlatform(host, result);
    return result.backend;
  }
  const saved = getSavedTorchPlatform(host);
  if (saved) {
    host.log("warn", `Using saved torch platform ${saved.platform} after failed detection`);
    return saved.backend;
  }
  return result.backend;
}

/**
 * Index arguments for every pack install. PyPI is the only package index.
 * Torch packages come from the PyTorch index through `--torch-backend`,
 * which uv applies to the PyTorch packages only and never falls back from.
 * {@link runPackInstall} retries on the CPU index, with a warning, when the
 * GPU index lacks a build. Pre-releases stay off: allowing them backtracked
 * `nodetool-huggingface` into an unbuildable spacy dev sdist and gave core an
 * httpx 1.0 dev release without `AsyncClient`.
 */
function buildInstallIndexArgs(backend: TorchBackend | null): string[] {
  return ["--index-url", PYPI_SIMPLE_INDEX_URL, ...torchBackendArgs(backend)];
}

/**
 * Ensure the Python runtime (python + uv) is installed in the conda env. A
 * pack install before the runtime exists installs the runtime first. Once
 * `uv` exists on disk, the check is a no-op.
 */
async function ensurePythonRuntimeAvailable(host: RuntimeInstallHost): Promise<void> {
  const uvPath = condaUvPath(host.condaEnvPath(), host.platform);
  if (await fileExists(uvPath)) {
    return;
  }
  reportStatus(host, "Setting up Python runtime (one-time, ~1-2 min)...");
  host.log("warn", `uv not found at ${uvPath} — auto-installing Python runtime before uv operation`);

  const result = await runtimeRegistryFor(host).runToCompletion("python", "install");
  if (!result.success) {
    throw new Error(
      `Could not set up Python runtime automatically: ${result.message}. ` +
      `Open the Runtimes panel and install Python manually, then retry.`
    );
  }
  // The install may report success yet land something unexpected.
  if (!(await fileExists(uvPath))) {
    throw new Error(
      `Python runtime install reported success but uv was not found at ${uvPath}. ` +
      `Open the Runtimes panel and reinstall Python.`
    );
  }
}

/** Run uv against the Python runtime's interpreter and return its stdout. */
export async function runUvCommand(
  host: RuntimeInstallHost,
  args: readonly string[],
  options?: { stdin?: string; silent?: boolean }
): Promise<string> {
  await ensurePythonRuntimeAvailable(host);
  const uvPath = condaUvPath(host.condaEnvPath(), host.platform);
  const command = [uvPath, ...args];

  return new Promise((resolve, reject) => {
    host.log("info", `Running uv command: ${command.join(" ")}`);
    const env = host.processEnv();
    // Tell uv which Python to use, and clear the other Python markers.
    env.UV_PYTHON = condaPythonPath(host.condaEnvPath(), host.platform);
    delete env.PYTHONHOME;
    delete env.PYTHONPATH;

    const child = spawn(command[0], command.slice(1), {
      env,
      stdio: "pipe",
      // Prevent a console window from flashing on Windows while uv runs.
      windowsHide: true,
    });
    if (options?.stdin && child.stdin) {
      child.stdin.write(options.stdin);
      child.stdin.end();
    }

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (data: Buffer) => {
      const output = data.toString();
      stdout += output;
      if (!options?.silent) {
        for (const line of outputLines(output)) {
          reportOutput(host, line);
        }
      }
    });
    child.stderr?.on("data", (data: Buffer) => {
      const output = data.toString();
      stderr += output;
      for (const line of outputLines(output)) {
        reportOutput(host, line, "warn");
      }
    });
    // "close" fires after stdout drains; "exit" can fire before the last chunk.
    child.on("close", (code: number | null) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });
    child.on("error", (error) => {
      if (error.message.includes("ENOENT")) {
        reject(new Error(
          `Python environment not properly installed: could not run uv at ${uvPath}. ` +
          `Please use "Reinstall environment" to fix this issue.`
        ));
      } else {
        reject(new Error(`Failed to run command: ${error.message}`));
      }
    });
  });
}

/** The runtime uv's version (`uv 0.11.3 ...` -> `0.11.3`), or null when unreadable. */
async function getUvVersion(host: RuntimeInstallHost): Promise<string | null> {
  try {
    const output = await runUvCommand(host, ["--version"], { silent: true });
    return /^uv\s+(\d+(?:\.\d+)*)/.exec(output.trim())?.[1] ?? null;
  } catch (error: unknown) {
    host.log("warn", `Could not read the uv version: ${errorMessage(error)}`);
    return null;
  }
}

/**
 * The backend to pass to uv. A Python runtime installed by an older release
 * keeps the uv of that time, which rejects newer `--torch-backend` values.
 * Update that uv through conda, and install without a backend (PyPI's torch
 * wheels) when the update fails.
 */
async function ensureUvAcceptsTorchBackend(
  host: RuntimeInstallHost,
  backend: TorchBackend | null
): Promise<TorchBackend | null> {
  if (!backend) {
    return backend;
  }
  const required = MIN_UV_FOR_TORCH_BACKEND[backend];
  const current = await getUvVersion(host);
  if (!current || compareVersions(current, required) >= 0) {
    return backend;
  }

  announce(host, `Updating uv ${current} to ${MIN_UV_VERSION} or newer for the ${backend} PyTorch build...`);
  try {
    await installCondaPackages(host, host.condaEnvPath(), [`uv>=${MIN_UV_VERSION}`], "Updating uv");
    const updated = await getUvVersion(host);
    if (updated && compareVersions(updated, required) >= 0) {
      return backend;
    }
  } catch (error: unknown) {
    host.log("error", `Failed to update uv: ${errorMessage(error)}`);
  }

  announce(
    host,
    `uv ${current} cannot install the ${backend} PyTorch build and could not be updated. ` +
      `Installing PyPI's default torch instead. Reinstall the Python runtime to get the ${backend} build.`,
    "warn"
  );
  return null;
}

/**
 * Whether a failed uv install is a resolve failure involving the torch
 * packages, which come only from the `--torch-backend` index. Such a failure
 * means that index has no build the packs can use.
 */
export function isTorchIndexResolveFailure(message: string): boolean {
  return RESOLVE_FAILURE.test(message) && TORCH_INDEX_PACKAGE.test(message);
}

/**
 * Run a pack install on `backend`. When the GPU index has no torch build the
 * packs can use, retry once on the CPU index and return the warning shown to
 * the user, so the pack still installs.
 */
async function runPackInstall(
  host: RuntimeInstallHost,
  argsFor: (backend: TorchBackend | null) => string[],
  detectedBackend: TorchBackend | null
): Promise<string | undefined> {
  const backend = await ensureUvAcceptsTorchBackend(host, detectedBackend);
  try {
    await runUvCommand(host, argsFor(backend));
    return undefined;
  } catch (error: unknown) {
    if (backend === null || backend === "cpu" || !isTorchIndexResolveFailure(errorMessage(error))) {
      throw error;
    }
    const warning =
      `The PyTorch ${backend} index has no build these packs can use. ` +
      `Installed the CPU build instead, so Python nodes will run on the CPU.`;
    announce(host, warning, "warn");
    await runUvCommand(host, argsFor("cpu"));
    return warning;
  }
}

/**
 * Requirements that keep the installed packs in the resolution, so one
 * install cannot replace another pack's torch or other shared dependency.
 * Each installed pack is held at its installed version or newer, and core at
 * the bridge protocol floor.
 */
export function coInstalledRequirements(
  installed: ReadonlyArray<{ name: string; version: string }>,
  exclude: readonly string[]
): string[] {
  const skip = new Set(exclude.map(canonicalizePackageName));
  const requirements: string[] = [];
  for (const pkg of installed) {
    const name = canonicalizePackageName(pkg.name);
    if (!name.startsWith("nodetool-") || skip.has(name)) {
      continue;
    }
    const floor =
      name === "nodetool-core" && compareVersions(MIN_NODETOOL_CORE_VERSION, pkg.version) > 0
        ? MIN_NODETOOL_CORE_VERSION
        : pkg.version;
    requirements.push(`${name}>=${floor}`);
  }
  return requirements;
}

/**
 * The refusal for a pack outside the catalog, or a catalog pack that does not
 * run on this machine. The repo id may come from a renderer or a command
 * line, and anything that passes here is handed to `uv pip install`, so an id
 * outside the catalog would install an arbitrary PyPI package (and run its
 * build scripts).
 */
export function unsupportedPackMessage(host: RuntimeInstallHost, repoId: string): string | null {
  const pack = findPythonNodePack(repoId);
  if (!pack) {
    return `${repoId} is not a NodeTool package.`;
  }
  if (isPythonPackSupported(pack, host.platform, host.arch, host.osVersion)) {
    return null;
  }
  const where = host.osVersion ? `macOS ${host.osVersion} (${host.arch})` : `${host.platform}-${host.arch}`;
  return (
    `${pack.name} is not available on ${where}.` +
    (pack.platformRequirement ? ` It needs ${pack.platformRequirement}.` : "")
  );
}

async function resolvePackageInstallTarget(
  host: RuntimeInstallHost,
  packageName: string
): Promise<{ installSpec: string; displayVersion: string } | null> {
  const latestVersion = await fetchLatestVersionFromSimpleIndex(host, packageName);
  if (!latestVersion) {
    return null;
  }
  return { installSpec: `${packageName}==${latestVersion}`, displayVersion: latestVersion };
}

/**
 * Every distribution in the runtime Python, from `uv pip list`.
 *
 * Without uv nothing is installed, so this returns an empty list instead of
 * going through `runUvCommand`, which would install the whole Python runtime
 * just because a pack list was read. Install and update pass `throwOnError`:
 * resolving a new pack without the installed packs' pins is how one pack's
 * torch replaces another's.
 */
export async function readPipPackages(host: RuntimeInstallHost, throwOnError: boolean): Promise<PipPackage[]> {
  if (!(await fileExists(condaUvPath(host.condaEnvPath(), host.platform)))) {
    return [];
  }
  try {
    const output = await runUvCommand(host, ["pip", "list", "--format=json"], { silent: true });
    const parsed: unknown = JSON.parse(output);
    return isPipPackageArray(parsed) ? parsed : [];
  } catch (error: unknown) {
    host.log("error", `Failed to list installed Python packages: ${errorMessage(error)}`);
    if (throwOnError) {
      throw new Error(`Could not list the installed Python packages: ${errorMessage(error)}`);
    }
    return [];
  }
}

function toInstalledPythonPacks(pipPackages: readonly PipPackage[]): InstalledPythonPack[] {
  return pipPackages
    .filter((pkg) => pkg.name.startsWith("nodetool-"))
    .map((pkg) => ({ name: pkg.name, version: pkg.version, repo_id: `nodetool-ai/${pkg.name}` }));
}

/** The installed nodetool-* distributions, or an empty list without a Python runtime. */
export async function listInstalledPythonPacks(host: RuntimeInstallHost): Promise<InstalledPythonPack[]> {
  return toInstalledPythonPacks(await readPipPackages(host, false));
}

/**
 * `--reinstall-package` arguments for torch wheels built for another backend.
 *
 * An installed `torch 2.9.0+cpu` already satisfies a pack's `torch`
 * requirement, so `--torch-backend cu128` alone leaves it in place: users who
 * once got CPU torch would keep it through every install and update. The
 * local version tag (`+cpu`, `+cu128`, `+rocm7.2`, `+xpu`) names the build.
 */
export function torchReinstallArgs(
  pipPackages: readonly PipPackage[],
  backend: TorchBackend | null
): string[] {
  // `auto` names no build, and CPU torch is never replaced by another build.
  if (!backend || backend === "cpu" || backend === "auto") {
    return [];
  }
  const args: string[] = [];
  for (const pkg of pipPackages) {
    if (!TORCH_FAMILY.includes(pkg.name.toLowerCase())) {
      continue;
    }
    const localTag = pkg.version.split("+")[1];
    if (localTag !== undefined && localTag !== backend) {
      args.push("--reinstall-package", pkg.name);
    }
  }
  return args;
}

/**
 * Install the newest PyPI release of a catalog pack. One uv command runs at a
 * time per environment: each one snapshots the installed packs to keep them
 * in its resolve, which a parallel install would invalidate.
 */
export async function installPythonPack(host: RuntimeInstallHost, repoId: string): Promise<PythonPackResult> {
  return changePythonPack(host, repoId, "install");
}

/** Reinstall a catalog pack at its newest PyPI release. */
export async function updatePythonPack(host: RuntimeInstallHost, repoId: string): Promise<PythonPackResult> {
  return changePythonPack(host, repoId, "update");
}

async function changePythonPack(
  host: RuntimeInstallHost,
  repoId: string,
  mode: "install" | "update"
): Promise<PythonPackResult> {
  const unsupported = unsupportedPackMessage(host, repoId);
  if (unsupported) {
    return { success: false, message: unsupported };
  }
  return runExclusive(host.condaEnvPath(), async () => {
    try {
      const packageName = repoId.split("/")[1];
      const installTarget = await resolvePackageInstallTarget(host, packageName);
      if (!installTarget) {
        return { success: false, message: `Could not find package ${packageName} on PyPI` };
      }
      const { installSpec, displayVersion } = installTarget;
      if (mode === "install") {
        reportOutput(host, `Installing ${packageName} v${displayVersion}...`);
      } else {
        announce(host, `Updating ${packageName} to v${displayVersion}...`);
      }

      const pipPackages = await readPipPackages(host, true);
      const installed = toInstalledPythonPacks(pipPackages);
      const coInstalled = coInstalledRequirements(installed, [packageName]);
      const backend = await detectTorchBackendForInstall(host, [
        packageName,
        ...installed.map((pkg) => pkg.name),
      ]);

      // One resolve over the pack and every installed pack, so the pack's
      // torch (or other shared pin) has to agree with theirs. An update
      // reinstalls only this pack from a fresh index read; a blanket
      // --reinstall re-downloaded torch every time.
      const updateArgs = mode === "update"
        ? ["--reinstall-package", packageName, "--refresh-package", packageName]
        : [];
      const warning = await runPackInstall(
        host,
        (torchBackend) => [
          "pip",
          "install",
          ...updateArgs,
          ...torchReinstallArgs(pipPackages, torchBackend),
          ...buildInstallIndexArgs(torchBackend),
          "--system",
          installSpec,
          ...coInstalled,
        ],
        backend
      );
      const done = mode === "install"
        ? `Package ${repoId} v${displayVersion} installed successfully from PyPI`
        : `Package ${repoId} updated to v${displayVersion} successfully from PyPI`;
      return { success: true, message: done + (warning ? `. ${warning}` : "") };
    } catch (error: unknown) {
      host.log("error", `Failed to ${mode} package ${repoId}: ${errorMessage(error)}`);
      // Callers add their own "Failed to install package:" framing, so
      // return just the underlying reason.
      return { success: false, message: errorMessage(error) };
    }
  });
}

/** Uninstall a nodetool-* distribution. */
export async function uninstallPythonPack(host: RuntimeInstallHost, repoId: string): Promise<PythonPackResult> {
  // Installed packs are listed as nodetool-ai/<dist name> for every
  // nodetool-* distribution, so that is all a caller may remove.
  const [owner, projectName] = repoId.split("/");
  if (owner !== "nodetool-ai" || !projectName?.startsWith("nodetool-")) {
    return { success: false, message: `${repoId} is not a NodeTool package.` };
  }
  return runExclusive(host.condaEnvPath(), async () => {
    try {
      await runUvCommand(host, ["pip", "uninstall", projectName], { stdin: "y\n" });
      return { success: true, message: `Package ${repoId} uninstalled successfully` };
    } catch (error: unknown) {
      host.log("error", `Failed to uninstall package ${repoId}: ${errorMessage(error)}`);
      return { success: false, message: errorMessage(error) };
    }
  });
}

/**
 * Installed packs that pin a `nodetool-core` other than the installed one,
 * as `uv pip check` reports them. Such a pack cannot load.
 */
export async function getStalePacks(host: RuntimeInstallHost): Promise<InstalledPythonPack[]> {
  const installed = await listInstalledPythonPacks(host);
  // Without a core there is no Python runtime to check, and running uv
  // would install one.
  if (!installed.some((pkg) => canonicalizePackageName(pkg.name) === "nodetool-core")) {
    return [];
  }
  let report: string;
  try {
    report = await runUvCommand(host, ["pip", "check", "--system"], { silent: true });
  } catch (error: unknown) {
    // `uv pip check` exits 1 when it finds incompatibilities and prints them.
    report = errorMessage(error);
  }
  const names = new Set<string>();
  for (const match of report.matchAll(/The package `([^`\s=]+)[^`]*` requires `nodetool-core\b[^`]*`/g)) {
    names.add(canonicalizePackageName(match[1]));
  }
  return installed.filter((pkg) => names.has(canonicalizePackageName(pkg.name)));
}

export interface ExpectedPackageVersion {
  packageName: string;
  currentVersion?: string;
  expectedVersion: string | null;
}

/**
 * Installed packs the host cannot work with: `nodetool-core` below the bridge
 * protocol floor (`MIN_NODETOOL_CORE_VERSION`). Packs are never pinned to the
 * app version. Every pack releases on its own schedule.
 */
export async function checkExpectedPackageVersions(host: RuntimeInstallHost): Promise<ExpectedPackageVersion[]> {
  const packagesNeedingUpdate: ExpectedPackageVersion[] = [];
  try {
    for (const pkg of await listInstalledPythonPacks(host)) {
      if (canonicalizePackageName(pkg.name) !== "nodetool-core" || !pkg.version) {
        continue;
      }
      if (compareVersions(pkg.version, MIN_NODETOOL_CORE_VERSION) < 0) {
        host.log("info", `Package ${pkg.name} ${pkg.version} is below the bridge protocol floor ${MIN_NODETOOL_CORE_VERSION}`);
        packagesNeedingUpdate.push({
          packageName: pkg.name,
          currentVersion: pkg.version,
          expectedVersion: `>=${MIN_NODETOOL_CORE_VERSION}`,
        });
      }
    }
  } catch (error: unknown) {
    host.log("error", `Failed to check expected package versions: ${errorMessage(error)}`);
  }
  return packagesNeedingUpdate;
}

export interface ExpectedPackagesResult {
  success: boolean;
  packagesChecked: number;
  packagesUpdated: number;
  failures: Array<{ packageName: string; error: string }>;
}

/**
 * Bring each pack {@link checkExpectedPackageVersions} reports up to its
 * floor, one uv command per pack, so a failure in one does not block the
 * others. Each command keeps the other installed packs in the resolution.
 */
export async function installExpectedPackages(host: RuntimeInstallHost): Promise<ExpectedPackagesResult> {
  return runExclusive(host.condaEnvPath(), async () => {
    const packagesNeedingUpdate = await checkExpectedPackageVersions(host);
    const failures: Array<{ packageName: string; error: string }> = [];
    let packagesUpdated = 0;

    if (packagesNeedingUpdate.length > 0) {
      const installed = await listInstalledPythonPacks(host);
      const backend = getSavedTorchPlatform(host)?.backend ?? null;

      for (const pkg of packagesNeedingUpdate) {
        const spec = `${pkg.packageName}${pkg.expectedVersion ?? ""}`;
        try {
          announce(host, `Updating ${spec}...`);
          const installArgs = (withPacks: boolean) => (torchBackend: TorchBackend | null) => [
            "pip",
            "install",
            ...buildInstallIndexArgs(torchBackend),
            "--system",
            spec,
            ...(withPacks ? coInstalledRequirements(installed, [pkg.packageName]) : []),
          ];
          try {
            await runPackInstall(host, installArgs(true), backend);
          } catch (resolveError: unknown) {
            if (canonicalizePackageName(pkg.packageName) !== "nodetool-core") {
              throw resolveError;
            }
            // An installed pack that pins an older core (a stale registry
            // pack) makes the joint resolve unsatisfiable. The core floor is
            // what the bridge needs, so install core in its own transaction.
            announce(host, `Could not resolve ${spec} together with the installed packs; installing it alone.`, "warn");
            await runPackInstall(host, installArgs(false), backend);
            const stale = await getStalePacks(host);
            if (stale.length > 0) {
              announce(
                host,
                `${stale.map((p) => p.name).join(", ")} pins an older ` +
                  `nodetool-core and will not load. Remove it from the package notice.`,
                "warn"
              );
            }
          }
          packagesUpdated += 1;
          host.log("info", `Updated ${spec}`);
        } catch (error: unknown) {
          const msg = errorMessage(error);
          host.log("error", `Failed to update ${spec}: ${msg}`);
          failures.push({ packageName: pkg.packageName, error: msg });
        }
      }
    }

    return {
      success: failures.length === 0,
      packagesChecked: packagesNeedingUpdate.length,
      packagesUpdated,
      failures,
    };
  });
}
