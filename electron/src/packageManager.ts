import { spawn } from "child_process";
import { logMessage } from "./logger";
import {
  getProcessEnv,
  getPythonPath,
  getCondaEnvPath,
  getUVPath,
} from "./config";
import {
  PYTHON_NODE_PACKS,
  findPythonNodePack,
  isPythonPackSupported,
} from "@nodetool-ai/protocol/python-packs";
import { MIN_NODETOOL_CORE_VERSION } from "@nodetool-ai/protocol/bridge-protocol";


/** Extract the message from an unknown catch-clause error. */
function errorMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Shape of a single entry from `uv pip list --format=json`. */
interface PipPackage {
  name: string;
  version: string;
}

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
  packageNames: readonly string[]
): Promise<TorchBackend | null> {
  if (!packageNames.some(needsTorchPlatformDetection)) {
    return null;
  }

  const message = `Detecting GPU platform before installing ${packageNames.join(", ")}...`;
  logMessage(message);
  emitServerLog(message);
  emitBootMessage(message);

  const result = await detectTorchPlatform();
  if (!result.error) {
    saveTorchPlatform(result);
    return result.backend;
  }
  const saved = getSavedTorchPlatform();
  if (saved) {
    logMessage(`Using saved torch platform ${saved.platform} after failed detection`, "warn");
    return saved.backend;
  }
  return result.backend;
}

import { emitServerLog, emitBootMessage } from "./events";
import {
  PackageInfo,
  PackageModel,
  PackageListResponse,
  InstalledPackageListResponse,
  PackageResponse,
  PackageNode,
  PackageUpdateInfo,
} from "./types";
import * as https from "https";
import {
  getSavedTorchPlatform,
  saveTorchPlatform,
  torchBackendArgs,
} from "./torchPlatformCache";
import {
  MIN_UV_FOR_TORCH_BACKEND,
  MIN_UV_VERSION,
  detectTorchPlatform,
  type TorchBackend,
} from "./torchruntime";
import { fileExists } from "./utils";
import { RUNTIME_PACKAGES } from "./runtime/packages/definitions";
import {
  RUNTIME_PACKAGE_IDS as REGISTRY_RUNTIME_PACKAGE_IDS,
  buildRuntimeContext,
  runLifecycleToCompletion,
  runtimeRegistry,
} from "./runtime/packages/registry";
import { NpmRuntimePackage } from "./runtime/packages/NpmRuntimePackage";

/**
 * Package Manager Module
 *
 * This module handles Python package management operations using uv.
 * It provides functionality to list, install, and uninstall packages
 * directly through the Node.js process without relying on the Python API.
 */

// PyPI simple index. Every Python node pack installs from here.
const PYPI_SIMPLE_INDEX_URL = "https://pypi.org/simple";
const METADATA_PATH = "src/nodetool/package_metadata";
const TORCH_DEPENDENT_PACKAGES = new Set(["nodetool-huggingface", "nodetool-mlx"]);

let nodeCache: PackageNode[] | null = null;

/** The macOS product version (`14.5`), or undefined off macOS. */
function macOSVersion(): string | undefined {
  return process.platform === "darwin" ? process.getSystemVersion() : undefined;
}

/**
 * The packages the package manager offers: the Python node packs in the
 * embedded catalog, then the npm runtime packages.
 */
export async function fetchAvailablePackages(): Promise<PackageListResponse> {
  const packages: PackageInfo[] = PYTHON_NODE_PACKS.filter((pack) =>
    isPythonPackSupported(pack, process.platform, process.arch, macOSVersion())
  ).map((pack) => ({
    name: pack.name,
    description: pack.description,
    repo_id: pack.repo_id,
    namespaces: [...pack.namespaces],
  }));
  const npmPackages = getNpmAvailablePackages();
  return {
    packages: [...packages, ...npmPackages],
    count: packages.length + npmPackages.length,
  };
}

function getNpmAvailablePackages(): PackageInfo[] {
  return (Object.entries(RUNTIME_PACKAGES) as [RuntimePackageId, typeof RUNTIME_PACKAGES[RuntimePackageId]][])
    .filter((entry): entry is [RuntimePackageId, NpmRuntimePackage] => entry[1] instanceof NpmRuntimePackage)
    .map(([id, npmPkg]) => {
      const firstSpec = npmPkg.npmPackages[0] || "";
      const at = firstSpec.lastIndexOf("@");
      const version = at > 0 ? firstSpec.slice(at + 1) : undefined;
      return {
        name: npmPkg.name,
        description: npmPkg.description,
        repo_id: id,
        version,
      };
    });
}

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve(body));
    });
    req.on("error", (err) => reject(err));
    req.setTimeout(30000, () => {
      req.destroy(new Error(`Request timeout for ${url}`));
    });
  });
}

function canonicalizePackageName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

function stripFileExtension(filename: string): string {
  const base = filename.replace(/#.*/, "");
  if (base.toLowerCase().endsWith(".tar.gz")) {
    return base.slice(0, -7);
  }
  return base.replace(/\.(whl|zip|tar|gz)$/gi, "");
}

function extractVersionFromFilename(
  filename: string,
  packageName: string
): string | null {
  const sanitized = filename.trim();
  if (!sanitized) return null;
  const baseName = stripFileExtension(sanitized.split("/").pop() || sanitized);
  const parts = baseName.split("-");
  if (parts.length < 2) {
    return null;
  }
  const canonicalPackage = canonicalizePackageName(packageName);
  const canonicalFileName = canonicalizePackageName(parts[0]);
  if (canonicalPackage !== canonicalFileName) {
    return null;
  }
  return parts[1] || null;
}

function tokenizeVersion(version: string): string[] {
  const normalized = version
    .replace(/([0-9])([a-zA-Z])/g, "$1.$2")
    .replace(/([a-zA-Z])([0-9])/g, "$1.$2");
  return normalized.split(/[.\-_+]/).filter(Boolean);
}

/**
 * Whether a PEP 440 version is a final release (or a post-release of one).
 * Pre-releases (`a`, `b`, `rc`) and dev releases are never install targets.
 */
function isFinalRelease(version: string): boolean {
  return /^\d+(?:\.\d+)*(?:[._-]?post\d*)?(?:\+[a-z0-9.]+)?$/i.test(version);
}

function compareVersions(a: string, b: string): number {
  if (a === b) return 0;
  const tokensA = tokenizeVersion(a);
  const tokensB = tokenizeVersion(b);
  const length = Math.max(tokensA.length, tokensB.length);

  for (let i = 0; i < length; i += 1) {
    const segA = tokensA[i];
    const segB = tokensB[i];

    if (segA === undefined) return -1;
    if (segB === undefined) return 1;
    if (segA === segB) continue;

    const numA = Number(segA);
    const numB = Number(segB);
    const isNumA = Number.isInteger(numA);
    const isNumB = Number.isInteger(numB);

    if (isNumA && isNumB) {
      if (numA > numB) return 1;
      if (numA < numB) return -1;
      continue;
    }

    if (isNumA) return 1;
    if (isNumB) return -1;

    const cmp = segA.localeCompare(segB);
    if (cmp !== 0) return cmp;
  }

  return 0;
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

/** The runtime uv's version (`uv 0.11.3 ...` -> `0.11.3`), or null when unreadable. */
async function getUvVersion(): Promise<string | null> {
  try {
    const output = await runUvCommand(["--version"], { silent: true });
    return /^uv\s+(\d+(?:\.\d+)*)/.exec(output.trim())?.[1] ?? null;
  } catch (error: unknown) {
    logMessage(`Could not read the uv version: ${errorMsg(error)}`, "warn");
    return null;
  }
}

/**
 * The backend to pass to uv. A Python runtime installed by an older app keeps
 * the uv of that time, which rejects newer `--torch-backend` values. Update
 * that uv through conda, and install without a backend (PyPI's torch wheels)
 * when the update fails.
 */
async function ensureUvAcceptsTorchBackend(
  backend: TorchBackend | null
): Promise<TorchBackend | null> {
  if (!backend) {
    return backend;
  }
  const required = MIN_UV_FOR_TORCH_BACKEND[backend];
  const current = await getUvVersion();
  if (!current || compareVersions(current, required) >= 0) {
    return backend;
  }

  const message = `Updating uv ${current} to ${MIN_UV_VERSION} or newer for the ${backend} PyTorch build...`;
  logMessage(message);
  emitServerLog(message);
  emitBootMessage(message);
  try {
    const { installCondaPackageBySpec } = await import("./installer");
    await installCondaPackageBySpec(getCondaEnvPath(), [`uv>=${MIN_UV_VERSION}`], "Updating uv");
    const updated = await getUvVersion();
    if (updated && compareVersions(updated, required) >= 0) {
      return backend;
    }
  } catch (error: unknown) {
    logMessage(`Failed to update uv: ${errorMsg(error)}`, "error");
  }

  const warning =
    `uv ${current} cannot install the ${backend} PyTorch build and could not be updated. ` +
    `Installing PyPI's default torch instead. Reinstall the Python runtime to get the ${backend} build.`;
  logMessage(warning, "warn");
  emitServerLog(warning);
  emitBootMessage(warning);
  return null;
}

/** The torch packages uv takes from the `--torch-backend` index. */
const TORCH_INDEX_PACKAGE = /\btorch(?:vision|audio|codec)?\b/;
/** uv's resolver failures, as opposed to network, build or CLI errors. */
const RESOLVE_FAILURE =
  /No solution found|unsatisfiable|not found in the package registry|no version of|no matching distribution/i;

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
  argsFor: (backend: TorchBackend | null) => string[],
  detectedBackend: TorchBackend | null
): Promise<string | undefined> {
  const backend = await ensureUvAcceptsTorchBackend(detectedBackend);
  try {
    await runUvCommand(argsFor(backend));
    return undefined;
  } catch (error: unknown) {
    if (backend === null || backend === "cpu" || !isTorchIndexResolveFailure(errorMsg(error))) {
      throw error;
    }
    const warning =
      `The PyTorch ${backend} index has no build these packs can use. ` +
      `Installed the CPU build instead, so Python nodes will run on the CPU.`;
    logMessage(warning, "warn");
    emitServerLog(warning);
    emitBootMessage(warning);
    await runUvCommand(argsFor("cpu"));
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
  installed: readonly PackageModel[],
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
      name === "nodetool-core" &&
      compareVersions(MIN_NODETOOL_CORE_VERSION, pkg.version) > 0
        ? MIN_NODETOOL_CORE_VERSION
        : pkg.version;
    requirements.push(`${name}>=${floor}`);
  }
  return requirements;
}

/** The refusal for a catalog pack that does not run on this machine. */
function unsupportedPackMessage(repoId: string): string | null {
  const pack = findPythonNodePack(repoId);
  const osVersion = macOSVersion();
  if (!pack || isPythonPackSupported(pack, process.platform, process.arch, osVersion)) {
    return null;
  }
  const where = osVersion
    ? `macOS ${osVersion} (${process.arch})`
    : `${process.platform}-${process.arch}`;
  return (
    `${pack.name} is not available on ${where}.` +
    (pack.platformRequirement ? ` It needs ${pack.platformRequirement}.` : "")
  );
}

async function resolvePackageInstallTarget(
  packageName: string
): Promise<{ installSpec: string; displayVersion: string } | null> {
  const latestVersion = await fetchLatestVersionFromSimpleIndex(packageName);
  if (!latestVersion) {
    return null;
  }

  return {
    installSpec: `${packageName}==${latestVersion}`,
    displayVersion: latestVersion,
  };
}

async function fetchLatestVersionFromSimpleIndex(
  packageName: string
): Promise<string | null> {
  try {
    const normalized = canonicalizePackageName(packageName).replace(/-/g, "-");
    const url = `${PYPI_SIMPLE_INDEX_URL}/${normalized}/`;
    const html = await httpsGet(url);

    const candidates: string[] = [];
    const anchorMatches = html.matchAll(/>([^<>]+)</g);
    for (const match of anchorMatches) {
      const version = extractVersionFromFilename(match[1], packageName);
      if (version) {
        candidates.push(version);
      }
    }

    if (candidates.length === 0) {
      const hrefMatches = html.matchAll(/href="([^"]+)"/gi);
      for (const match of hrefMatches) {
        const version = extractVersionFromFilename(match[1], packageName);
        if (version) {
          candidates.push(version);
        }
      }
    }

    const releases = candidates.filter(isFinalRelease);
    if (releases.length === 0) {
      return null;
    }

    releases.sort(compareVersions);
    return releases[releases.length - 1];
  } catch (error: unknown) {
    logMessage(
      `Failed to fetch latest version for ${packageName}: ${errorMsg(error)}`,
      "warn"
    );
    return null;
  }
}

/**
 * Node list of a pack, read from its package metadata at the release tag
 * (`v<version>`): the installed version, or the newest PyPI release when the
 * pack is not installed. Falls back to `main` only when no version is known
 * or the tag has no metadata file.
 */
async function fetchPackageNodes(
  repoId: string,
  version: string | null
): Promise<PackageNode[]> {
  const packageName = repoId.split("/")[1];
  const refs = version ? [`v${version}`, "main"] : ["main"];
  for (const ref of refs) {
    try {
      const url = `https://raw.githubusercontent.com/${repoId}/${ref}/${METADATA_PATH}/${packageName}.json`;
      const jsonText = await httpsGet(url);
      const metadata = JSON.parse(jsonText) as { nodes?: Partial<PackageNode>[] };
      return (metadata.nodes || []).map((node) => ({
        ...node,
        package: repoId,
      } as PackageNode));
    } catch (error: unknown) {
      logMessage(`Error fetching nodes from ${repoId}@${ref}: ${errorMsg(error)}`, "warn");
    }
  }
  return [];
}

let nodeCacheKey: string | null = null;

async function fetchAllNodes(
  forceRefresh: boolean = false
): Promise<PackageNode[]> {
  try {
    const [{ packages }, installed] = await Promise.all([
      fetchAvailablePackages(),
      listPythonInstalledPackages(),
    ]);
    const installedVersions = new Map(
      installed.map((pkg) => [canonicalizePackageName(pkg.name), pkg.version])
    );
    const pythonPacks = packages.filter((pkg) => findPythonNodePack(pkg.repo_id));
    const cacheKey = pythonPacks
      .map((pkg) => `${pkg.repo_id}@${installedVersions.get(canonicalizePackageName(pkg.repo_id.split("/")[1])) ?? ""}`)
      .join(",");
    if (nodeCache && !forceRefresh && cacheKey === nodeCacheKey) {
      return nodeCache;
    }
    const tasks = pythonPacks.map(async (pkg) => {
      const packageName = pkg.repo_id.split("/")[1];
      const version =
        installedVersions.get(canonicalizePackageName(packageName)) ??
        (await fetchLatestVersionFromSimpleIndex(packageName));
      return fetchPackageNodes(pkg.repo_id, version);
    });
    const results = await Promise.allSettled(tasks);
    const allNodes: PackageNode[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        allNodes.push(...result.value);
      }
    }
    nodeCache = allNodes;
    nodeCacheKey = cacheKey;
    return allNodes;
  } catch (error: unknown) {
    logMessage(`Failed to fetch all nodes: ${errorMsg(error)}`, "error");
    return [];
  }
}

export async function searchNodes(query: string = ""): Promise<PackageNode[]> {
  const [nodes, installed] = await Promise.all([
    fetchAllNodes(),
    listInstalledPackages().catch(() => ({ packages: [], count: 0 })),
  ]);
  const installedRepoIds = new Set(
    (installed.packages || []).map((p) => p.repo_id)
  );
  const trimmed = (query || "").trim();
  if (!trimmed) {
    // Sort uninstalled first, then by namespace/title for stability
    const sorted = [...nodes].sort((a, b) => {
      const ai = installedRepoIds.has(a.package || "") ? 1 : 0;
      const bi = installedRepoIds.has(b.package || "") ? 1 : 0;
      if (ai !== bi) return ai - bi;
      const nsCmp = (a.namespace || "").localeCompare(b.namespace || "");
      if (nsCmp !== 0) return nsCmp;
      return (a.title || "").localeCompare(b.title || "");
    });
    // Attach installed flag for consumers
    return sorted.map((n) => ({
      ...n,
      installed: installedRepoIds.has(n.package || ""),
    }));
  }

  // --- Lightweight fuzzy matching similar to NodeMenuStore ---
  const normalize = (s: string) => s.toLowerCase();
  const tokenize = (s: string) =>
    normalize(s)
      .split(/[\s.,\-_]+/)
      .filter((t) => t.length > 0);

  const sequentialMatchScore = (needle: string, haystack: string): number => {
    // Returns a score in [0, 0.6] based on sequential char match and gap penalty
    const normalizedNeedle = normalize(needle);
    const normalizedHaystack = normalize(haystack);
    if (!normalizedNeedle || !normalizedHaystack) return 0;
    let queryIndex = 0;
    let lastIndex = -1;
    let gaps = 0;
    for (let i = 0; i < normalizedHaystack.length && queryIndex < normalizedNeedle.length; i++) {
      if (normalizedHaystack[i] === normalizedNeedle[queryIndex]) {
        if (lastIndex >= 0) gaps += i - lastIndex - 1;
        lastIndex = i;
        queryIndex += 1;
      }
    }
    const ratio = queryIndex / normalizedNeedle.length;
    if (ratio === 0) return 0;
    const gapPenalty = Math.min(gaps / Math.max(normalizedNeedle.length, 1), 1);
    return 0.6 * ratio * (1 - 0.5 * gapPenalty);
  };

  const substringScore = (needle: string, haystack: string): number => {
    // Returns a score in [0, 1] with boosts for prefix and word-boundary matches
    const normalizedNeedle = normalize(needle);
    const normalizedHaystack = normalize(haystack);
    if (!normalizedNeedle || !normalizedHaystack) return 0;
    const indexFound = normalizedHaystack.indexOf(normalizedNeedle);
    if (indexFound < 0) return 0;
    const isPrefix = indexFound === 0;
    const isWordBoundary = indexFound > 0 ? /[^a-z0-9]/.test(normalizedHaystack[indexFound - 1]) : true;
    const lengthBoost = Math.min(normalizedNeedle.length / Math.max(normalizedHaystack.length, normalizedNeedle.length), 1);
    let score = 0.7 + 0.3 * lengthBoost;
    if (isPrefix) score += 0.15;
    else if (isWordBoundary) score += 0.05;
    return Math.min(score, 1);
  };

  const scoreField = (q: string, value?: string): number => {
    if (!value) return 0;
    const sub = substringScore(q, value);
    if (sub > 0) return sub;
    return sequentialMatchScore(q, value);
  };

  type PackageNodeStringKey = "title" | "namespace" | "node_type" | "description";
  const fieldWeights: Array<{
    key: PackageNodeStringKey;
    weight: number;
  }> = [
    { key: "title", weight: 1.0 },
    { key: "namespace", weight: 0.85 },
    { key: "node_type", weight: 0.8 },
    { key: "description", weight: 0.6 },
  ];

  const tokens = tokenize(trimmed);
  const noSpace = normalize(trimmed.replace(/\s+/g, ""));
  const effectiveTokens = tokens.length > 0 ? tokens : [normalize(trimmed)];

  const scored = nodes
    .map((node) => {
      const tokenScores: number[] = [];
      for (const token of effectiveTokens) {
        let bestForToken = 0;
        for (const { key, weight } of fieldWeights) {
          const value = node[key] || "";
          const base = scoreField(token, value);
          bestForToken = Math.max(bestForToken, base * weight);
        }
        // Also try token without spaces against title and namespace for friendlier matching
        if (noSpace && noSpace !== token) {
          bestForToken = Math.max(
            bestForToken,
            0.9 * scoreField(noSpace, node.title || ""),
            0.85 * scoreField(noSpace, node.namespace || "")
          );
        }
        tokenScores.push(bestForToken);
      }
      // Average across tokens to avoid bias towards more tokens
      const averageScore =
        tokenScores.length > 0
          ? tokenScores.reduce((a, b) => a + b, 0) / tokenScores.length
          : 0;
      return { node, score: averageScore };
    })
    .filter((entry) => entry.score >= 0.15)
    .sort((a, b) => {
      const ai = installedRepoIds.has(a.node.package || "") ? 1 : 0;
      const bi = installedRepoIds.has(b.node.package || "") ? 1 : 0;
      if (ai !== bi) return ai - bi;
      if (b.score !== a.score) return b.score - a.score;
      const nsCmp = (a.node.namespace || "").localeCompare(
        b.node.namespace || ""
      );
      if (nsCmp !== 0) return nsCmp;
      return (a.node.title || "").localeCompare(b.node.title || "");
    });

  return scored.map((s) => ({
    ...s.node,
    installed: installedRepoIds.has(s.node.package || ""),
  }));
}

export async function checkForPackageUpdates(): Promise<PackageUpdateInfo[]> {
  try {
    const installedPackages = await listInstalledPackagesInternal();
    if (!installedPackages.length) {
      return [];
    }

    let registryPackages: PackageInfo[] = [];
    try {
      const registry = await fetchAvailablePackages();
      registryPackages = registry.packages;
    } catch (error: unknown) {
      logMessage(
        `Failed to fetch package registry for update check: ${errorMsg(error)}`,
        "warn"
      );
    }

    const versionHints = new Map<string, string>();
    for (const pkg of registryPackages) {
      if (!pkg.version) continue;
      const keys = [
        pkg.name?.toLowerCase(),
        canonicalizePackageName(pkg.name || ""),
        pkg.repo_id?.toLowerCase(),
      ].filter((v): v is string => typeof v === "string" && v.length > 0);
      for (const key of keys) {
        if (!versionHints.has(key)) {
          versionHints.set(key, pkg.version);
        }
      }
    }

    const updateChecks = installedPackages.map(async (pkg) => {
      // For npm runtime packages, compare installed version against pinned version
      const runtimePkg = isRuntimePackageId(pkg.repo_id) ? RUNTIME_PACKAGES[pkg.repo_id] : undefined;
      if (runtimePkg instanceof NpmRuntimePackage) {
        const firstSpec = runtimePkg.npmPackages[0] || "";
        const at = firstSpec.lastIndexOf("@");
        const pinnedVersion = at > 0 ? firstSpec.slice(at + 1) : undefined;
        if (pinnedVersion && pinnedVersion !== pkg.version) {
          return {
            name: pkg.name,
            repo_id: pkg.repo_id,
            installedVersion: pkg.version,
            latestVersion: pinnedVersion,
          };
        }
        return null;
      }

      const keyCandidates = [
        pkg.name.toLowerCase(),
        canonicalizePackageName(pkg.name),
        pkg.repo_id.toLowerCase(),
      ];

      let latest: string | null = null;
      for (const key of keyCandidates) {
        const hint = versionHints.get(key);
        if (hint) {
          latest = hint;
          break;
        }
      }

      if (!latest) {
        latest = await fetchLatestVersionFromSimpleIndex(pkg.name);
      }

      if (!latest) {
        return null;
      }

      return compareVersions(latest, pkg.version) > 0
        ? {
            name: pkg.name,
            repo_id: pkg.repo_id,
            installedVersion: pkg.version,
            latestVersion: latest,
          }
        : null;
    });

    const results = await Promise.all(updateChecks);
    return results.filter((entry): entry is PackageUpdateInfo => entry !== null);
  } catch (error: unknown) {
    logMessage(`Failed to check for package updates: ${errorMsg(error)}`, "warn");
    return [];
  }
}

/**
 * Ensure the Python runtime (python + uv) is installed in the conda env.
 *
 * After the install-wizard refactor (commits 08534478e / a6a392c47), Python
 * is an opt-in runtime that the user installs from the Runtimes panel. Any
 * `uv` operation triggered before that runtime is installed (e.g. clicking
 * "Install" on a Python package in the Package Manager) used to fail with
 * "uv executable not found", with no recovery path inside the Package
 * Manager UI. We now install the Python runtime on demand the first time
 * a uv command is requested, then proceed.
 *
 * This is idempotent: once `uv` exists on disk, the check is a no-op.
 */
async function ensurePythonRuntimeAvailable(): Promise<void> {
  const uvPath = getUVPath();
  if (await fileExists(uvPath)) {
    return;
  }

  emitBootMessage("Setting up Python runtime (one-time, ~1-2 min)...");
  logMessage(
    `uv not found at ${uvPath} — auto-installing Python runtime before uv operation`,
    "warn"
  );

  const result = await installRuntimePackage("python");
  if (!result.success) {
    throw new Error(
      `Could not set up Python runtime automatically: ${result.message}. ` +
      `Open the Runtimes panel and install Python manually, then retry.`
    );
  }

  // Belt-and-braces: verify uv really did appear, in case the install
  // reported success but landed something unexpected.
  if (!(await fileExists(uvPath))) {
    throw new Error(
      `Python runtime install reported success but uv was not found at ${uvPath}. ` +
      `Open the Runtimes panel and reinstall Python.`
    );
  }
}

/**
 * Run a uv command
 */
async function runUvCommand(
  args: string[],
  options?: { stdin?: string; silent?: boolean }
): Promise<string> {
  await ensurePythonRuntimeAvailable();

  const uvPath = getUVPath();
  const pythonPath = getPythonPath();
  const command = [uvPath, ...args];

  return new Promise((resolve, reject) => {
    logMessage(`Running uv command: ${command.join(" ")}`);

    const env = getProcessEnv();
    // Set UV_PYTHON to explicitly tell uv which Python to use
    env.UV_PYTHON = pythonPath;
    // Clear any other Python environment variables
    delete env.PYTHONHOME;
    delete env.PYTHONPATH;

    const process = spawn(command[0], command.slice(1), {
      env,
      stdio: "pipe",
      // Prevent a console window from flashing on Windows while uv runs.
      windowsHide: true,
    });

    if (options?.stdin && process.stdin) {
      process.stdin.write(options.stdin);
      process.stdin.end();
    }

    let stdout = "";
    let stderr = "";

    process.stdout?.on("data", (data: Buffer) => {
      const output = data.toString();
      stdout += output;
      if (!options?.silent) {
        const lines = output
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        for (const line of lines) {
          logMessage(line);
          emitServerLog(line);
        }
      }
    });

    process.stderr?.on("data", (data: Buffer) => {
      const output = data.toString();
      stderr += output;
      const lines = output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      for (const line of lines) {
        logMessage(line, "warn");
        emitServerLog(line);
      }
    });

    process.on("exit", (code: number | null) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });

    process.on("error", (error) => {
      // Provide a more helpful error message for ENOENT
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

/**
 * Internal function to list installed Python packages without version checking.
 */
async function listPythonInstalledPackages(): Promise<PackageModel[]> {
  try {
    const output = await runUvCommand(["pip", "list", "--format=json"], { silent: true });
    const parsed: unknown = JSON.parse(output);
    const allPackages = isPipPackageArray(parsed) ? parsed : [];

    return allPackages
      .filter((pkg) => pkg.name.startsWith("nodetool-"))
      .map((pkg) => ({
        name: pkg.name,
        description: "",
        version: pkg.version,
        authors: [],
        repo_id: "nodetool-ai/" + pkg.name,
        nodes: [],
        examples: [],
        assets: [],
      }));
  } catch (error: unknown) {
    logMessage(`Failed to list installed Python packages: ${errorMsg(error)}`, "error");
    return [];
  }
}

/**
 * List installed npm runtime packages from the optional-node directory.
 */
async function listNpmInstalledPackages(): Promise<PackageModel[]> {
  try {
    const ctx = buildRuntimeContext();
    const packages: PackageModel[] = [];
    for (const [id, pkg] of Object.entries(RUNTIME_PACKAGES) as [RuntimePackageId, typeof RUNTIME_PACKAGES[RuntimePackageId]][]) {
      if (!(pkg instanceof NpmRuntimePackage)) continue;
      const status = await pkg.status(ctx);
      if (!status.installed) continue;
      packages.push({
        name: pkg.name,
        description: pkg.description,
        version: status.installedVersion ?? "unknown",
        authors: [],
        repo_id: id,
        nodes: [],
        examples: [],
        assets: [],
      });
    }
    return packages;
  } catch (error: unknown) {
    logMessage(`Failed to list installed npm packages: ${errorMsg(error)}`, "warn");
    return [];
  }
}

/**
 * Internal function to list installed packages without version checking
 * Used by both listInstalledPackages and checkForPackageUpdates to avoid circular dependency
 */
async function listInstalledPackagesInternal(): Promise<PackageModel[]> {
  const [pythonPackages, npmPackages] = await Promise.all([
    listPythonInstalledPackages(),
    listNpmInstalledPackages(),
  ]);
  return [...pythonPackages, ...npmPackages];
}

/**
 * List installed packages with upgrade information
 */
export async function listInstalledPackages(): Promise<InstalledPackageListResponse> {
  try {
    const nodetoolPackages = await listInstalledPackagesInternal();

    // Check for available updates
    const updateInfo = await checkForPackageUpdates();
    const updateMap = new Map(
      updateInfo.map((info) => [info.name, info.latestVersion])
    );

    // Enrich packages with update information
    const enrichedPackages = nodetoolPackages.map((pkg: PackageModel) => {
      const latestVersion = updateMap.get(pkg.name);
      return {
        ...pkg,
        latestVersion: latestVersion || pkg.version,
        hasUpdate: latestVersion ? latestVersion !== pkg.version : false,
      };
    });

    return {
      packages: enrichedPackages,
      count: enrichedPackages.length,
    };
  } catch (error: unknown) {
    logMessage(`Failed to list installed packages: ${errorMsg(error)}`, "error");
    return { packages: [], count: 0 };
  }
}

/**
 * Install a package using wheel-based package index
 * Always fetches the latest version from the simple index and installs that specific version
 */
export async function installPackage(repoId: string): Promise<PackageResponse> {
  // Route npm runtime packages to the runtime installer
  if (isRuntimePackageId(repoId)) {
    const runtimePkg = RUNTIME_PACKAGES[repoId];
    if (runtimePkg instanceof NpmRuntimePackage) {
      return installRuntimePackage(repoId);
    }
  }

  const unsupported = unsupportedPackMessage(repoId);
  if (unsupported) {
    return { success: false, message: unsupported };
  }

  try {
    const packageName = repoId.split("/")[1];

    const installTarget = await resolvePackageInstallTarget(packageName);
    if (!installTarget) {
      return {
        success: false,
        message: `Could not find package ${packageName} on PyPI`,
      };
    }

    const { installSpec, displayVersion } = installTarget;
    const message = `Installing ${packageName} v${displayVersion}...`;
    logMessage(message);
    emitServerLog(message);

    const installed = await listPythonInstalledPackages();
    const coInstalled = coInstalledRequirements(installed, [packageName]);
    const backend = await detectTorchBackendForInstall([
      packageName,
      ...installed.map((pkg) => pkg.name),
    ]);

    // One resolve over the new pack and every installed pack, so the new
    // pack's torch (or other shared pin) has to agree with theirs.
    const warning = await runPackInstall(
      (torchBackend) => [
        "pip",
        "install",
        ...buildInstallIndexArgs(torchBackend),
        "--system",
        installSpec,
        ...coInstalled,
      ],
      backend
    );

    return {
      success: true,
      message:
        `Package ${repoId} v${displayVersion} installed successfully from PyPI` +
        (warning ? `. ${warning}` : ""),
    };
  } catch (error: unknown) {
    logMessage(
      `Failed to install package ${repoId}: ${errorMsg(error)}`,
      "error"
    );
    // Renderer prepends its own "Failed to install package:" framing, so
    // return just the underlying reason to avoid duplicated prefixes in
    // user-facing dialogs.
    return {
      success: false,
      message: errorMsg(error),
    };
  }
}

/**
 * Uninstall a package
 */
export async function uninstallPackage(
  repoId: string
): Promise<PackageResponse> {
  if (isRuntimePackageId(repoId)) {
    const runtimePkg = RUNTIME_PACKAGES[repoId];
    if (runtimePkg instanceof NpmRuntimePackage) {
      return uninstallRuntimePackage(repoId);
    }
  }

  try {
    // Extract project name from repo_id (e.g., "owner/project" -> "project")
    const projectName = repoId.split("/")[1];

    // Use uv pip uninstall
    await runUvCommand(["pip", "uninstall", projectName], { stdin: "y\n" });

    return {
      success: true,
      message: `Package ${repoId} uninstalled successfully`,
    };
  } catch (error: unknown) {
    logMessage(
      `Failed to uninstall package ${repoId}: ${errorMsg(error)}`,
      "error"
    );
    // Renderer prepends its own "Failed to uninstall package:" framing.
    return {
      success: false,
      message: errorMsg(error),
    };
  }
}

/**
 * Update a package using wheel-based package index
 * Always fetches the latest version from the simple index and installs that specific version
 * Forces a true reinstall by clearing the uv cache and reinstalling the package
 */
export async function updatePackage(repoId: string): Promise<PackageResponse> {
  if (isRuntimePackageId(repoId)) {
    const runtimePkg = RUNTIME_PACKAGES[repoId];
    if (runtimePkg instanceof NpmRuntimePackage) {
      return runLifecycleToCompletion(repoId, "update");
    }
  }

  const unsupported = unsupportedPackMessage(repoId);
  if (unsupported) {
    return { success: false, message: unsupported };
  }

  try {
    const packageName = repoId.split("/")[1];

    const installTarget = await resolvePackageInstallTarget(packageName);
    if (!installTarget) {
      return {
        success: false,
        message: `Could not find package ${packageName} on PyPI`,
      };
    }

    const { installSpec, displayVersion } = installTarget;
    const message = `Updating ${packageName} to v${displayVersion}...`;
    logMessage(message);
    emitServerLog(message);
    emitBootMessage(message);

    const installed = await listPythonInstalledPackages();
    const coInstalled = coInstalledRequirements(installed, [packageName]);
    const backend = await detectTorchBackendForInstall([
      packageName,
      ...installed.map((pkg) => pkg.name),
    ]);

    // Reinstall only this pack from a fresh index read. The other installed
    // packs stay in the resolve so the update cannot break them, and they are
    // not reinstalled (a blanket --reinstall re-downloaded torch every time).
    const warning = await runPackInstall(
      (torchBackend) => [
        "pip",
        "install",
        "--reinstall-package",
        packageName,
        "--refresh-package",
        packageName,
        ...buildInstallIndexArgs(torchBackend),
        "--system",
        installSpec,
        ...coInstalled,
      ],
      backend
    );

    return {
      success: true,
      message:
        `Package ${repoId} updated to v${displayVersion} successfully from PyPI` +
        (warning ? `. ${warning}` : ""),
    };
  } catch (error: unknown) {
    logMessage(`Failed to update package ${repoId}: ${errorMsg(error)}`, "error");
    // Renderer prepends its own "Failed to update package:" framing.
    return {
      success: false,
      message: errorMsg(error),
    };
  }
}

/**
 * Installed packs the app cannot work with: `nodetool-core` below the bridge
 * protocol floor (`MIN_NODETOOL_CORE_VERSION`). Packs are never pinned to the
 * app version. Every pack releases on its own schedule, and the app version
 * is not a version any pack publishes.
 */
export async function checkExpectedPackageVersions(): Promise<
  Array<{
    packageName: string;
    currentVersion?: string;
    expectedVersion: string | null;
  }>
> {
  const packagesNeedingUpdate: Array<{
    packageName: string;
    currentVersion?: string;
    expectedVersion: string | null;
  }> = [];

  try {
    const installedPackages = await listPythonInstalledPackages();
    for (const pkg of installedPackages) {
      if (canonicalizePackageName(pkg.name) !== "nodetool-core" || !pkg.version) {
        continue;
      }
      if (compareVersions(pkg.version, MIN_NODETOOL_CORE_VERSION) < 0) {
        logMessage(
          `Package ${pkg.name} ${pkg.version} is below the bridge protocol floor ${MIN_NODETOOL_CORE_VERSION}`
        );
        packagesNeedingUpdate.push({
          packageName: pkg.name,
          currentVersion: pkg.version,
          expectedVersion: `>=${MIN_NODETOOL_CORE_VERSION}`,
        });
      }
    }
  } catch (error: unknown) {
    logMessage(
      `Failed to check expected package versions: ${errorMsg(error)}`,
      "error"
    );
  }

  return packagesNeedingUpdate;
}

/**
 * Bring each pack {@link checkExpectedPackageVersions} reports up to its
 * floor, one uv command per pack, so a failure in one does not block the
 * others. Each command keeps the other installed packs in the resolution.
 */
export async function installExpectedPackages(): Promise<{
  success: boolean;
  packagesChecked: number;
  packagesUpdated: number;
  failures: Array<{ packageName: string; error: string }>;
}> {
  const packagesNeedingUpdate = await checkExpectedPackageVersions();
  const failures: Array<{ packageName: string; error: string }> = [];
  let packagesUpdated = 0;

  if (packagesNeedingUpdate.length > 0) {
    const installed = await listPythonInstalledPackages();
    const backend = getSavedTorchPlatform()?.backend ?? null;

    for (const pkg of packagesNeedingUpdate) {
      const spec = `${pkg.packageName}${pkg.expectedVersion ?? ""}`;
      try {
        const message = `Updating ${spec}...`;
        logMessage(message);
        emitServerLog(message);
        emitBootMessage(message);

        await runPackInstall(
          (torchBackend) => [
            "pip",
            "install",
            ...buildInstallIndexArgs(torchBackend),
            "--system",
            spec,
            ...coInstalledRequirements(installed, [pkg.packageName]),
          ],
          backend
        );
        packagesUpdated += 1;
        logMessage(`Updated ${spec}`);
      } catch (error: unknown) {
        const msg = errorMsg(error);
        logMessage(`Failed to update ${spec}: ${msg}`, "error");
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
}

/**
 * Validate repository ID format
 */
export function validateRepoId(repoId: string) {
  if (!repoId) {
    return { valid: false, error: "Repository ID cannot be empty" };
  }

  const pattern = /^[a-zA-Z0-9][-a-zA-Z0-9_]*\/[a-zA-Z0-9][-a-zA-Z0-9_]*$/;
  if (!pattern.test(repoId)) {
    return {
      valid: false,
      error: `Invalid repository ID format: ${repoId}. Must be in the format <owner>/<project>`,
    };
  }

  return { valid: true };
}

// =============================================================================
// Runtime Package Management
// =============================================================================
// These functions manage "system-level" runtime packages that were previously
// handled by the install wizard. They are now exposed through the package
// manager UI so users can install them on-demand without blocking the app.
// =============================================================================

import type { RuntimePackageId, RuntimePackageStatus } from "./types.d";

function isRuntimePackageId(id: string): id is RuntimePackageId {
  return id in RUNTIME_PACKAGES;
}

/** All valid runtime package IDs — sourced from the runtime registry. */
export const RUNTIME_PACKAGE_IDS: readonly RuntimePackageId[] =
  REGISTRY_RUNTIME_PACKAGE_IDS;

/**
 * Check the installation status of all runtime packages.
 * Delegates to the runtime registry.
 */
export async function getRuntimePackageStatuses(): Promise<RuntimePackageStatus[]> {
  const statuses = await runtimeRegistry.statuses();
  return statuses.map((s) => {
    const pkg = RUNTIME_PACKAGES[s.id];
    return {
      id: s.id,
      name: pkg.name,
      description: pkg.description,
      installed: s.installed,
      installing: runtimeRegistry.isInstalling(s.id),
      installedVersion: s.installedVersion,
      latestVersion: s.latestVersion,
      updateAvailable: s.updateAvailable,
    };
  });
}

/**
 * Get the current conda environment install location, or the default if not set.
 */
export function getCondaInstallLocation(): string {
  return getCondaEnvPath();
}

/**
 * Install a runtime package. Delegates to the registry while preserving the
 * `installLocation` shortcut used by the install wizard for conda.
 */
export async function installRuntimePackage(
  packageId: RuntimePackageId,
  installLocation?: string,
): Promise<{ success: boolean; message: string }> {
  const pkg = RUNTIME_PACKAGES[packageId];
  if (!pkg) {
    return { success: false, message: `Unknown runtime: ${packageId}` };
  }

  if (installLocation) {
    const { setCondaInstallLocation } = await import("./installer");
    setCondaInstallLocation(installLocation);
  }

  emitBootMessage(`Installing ${pkg.name}...`);
  logMessage(`Installing runtime: ${packageId}`);

  const result = await runLifecycleToCompletion(packageId, "install");
  if (result.success) {
    return { success: true, message: `${pkg.name} installed successfully` };
  }
  logMessage(`Failed to install runtime package ${packageId}: ${result.message}`, "error");
  return { success: false, message: `Failed to install: ${result.message}` };
}

/**
 * Reinstall a runtime package at the version this build pins. Delegates to
 * the registry's `update` lifecycle.
 */
export async function updateRuntimePackage(
  packageId: RuntimePackageId,
): Promise<{ success: boolean; message: string }> {
  logMessage(`Updating runtime: ${packageId}`);
  return runLifecycleToCompletion(packageId, "update");
}

/**
 * Uninstall a runtime package. Delegates to the registry.
 */
export async function uninstallRuntimePackage(
  packageId: RuntimePackageId,
): Promise<{ success: boolean; message: string }> {
  const pkg = RUNTIME_PACKAGES[packageId];
  if (!pkg) {
    return { success: false, message: `Unknown runtime: ${packageId}` };
  }

  try {
    logMessage(`Uninstalling runtime: ${packageId}`);
    emitBootMessage(`Removing ${pkg.name}...`);
    await runtimeRegistry.uninstall(packageId);
    return { success: true, message: `${pkg.name} removed successfully` };
  } catch (error: unknown) {
    logMessage(`Failed to uninstall runtime package ${packageId}: ${errorMsg(error)}`, "error");
    return { success: false, message: `Failed to uninstall: ${errorMsg(error)}` };
  }
}
