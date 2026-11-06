import { logMessage } from "./logger";
import {
  PYTHON_NODE_PACKS,
  findPythonNodePack,
  isPythonPackSupported,
} from "@nodetool-ai/protocol/python-packs";
import {
  NpmRuntimePackage,
  RUNTIME_PACKAGES,
  RUNTIME_PACKAGE_IDS as REGISTRY_RUNTIME_PACKAGE_IDS,
  buildRuntimeContext,
  canonicalizePackageName,
  checkExpectedPackageVersions as checkExpectedPythonPackageVersions,
  compareVersions,
  fetchLatestVersionFromSimpleIndex as fetchLatestPythonVersion,
  getStalePacks as getStalePythonPacks,
  httpsGet,
  installExpectedPackages as installExpectedPythonPackages,
  installPythonPack,
  isKnownRuntimePackageId,
  listInstalledPythonPacks,
  uninstallPythonPack,
  updatePythonPack,
  type ExpectedPackageVersion,
  type ExpectedPackagesResult,
  type InstalledPythonPack,
} from "@nodetool-ai/runtime-install";
import { emitBootMessage } from "./events";
import {
  PackageInfo,
  PackageModel,
  PackageListResponse,
  InstalledPackageListResponse,
  PackageResponse,
  PackageNode,
  PackageUpdateInfo,
} from "./types";
import type { RuntimePackageId, RuntimePackageStatus } from "./types.d";
import { getCondaEnvPath } from "./config";
import { getDesktopRuntimeHost, getDesktopRuntimeRegistry } from "./runtimeHost";

/**
 * Package Manager Module
 *
 * The desktop Package Manager's catalog, node search and update checks, and
 * the IPC-facing install entry points. Python packs and runtime packages
 * install through `@nodetool-ai/runtime-install`.
 */

/** Extract the message from an unknown catch-clause error. */
function errorMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const METADATA_PATH = "src/nodetool/package_metadata";

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
        (await fetchLatestPythonVersion(getDesktopRuntimeHost(), packageName));
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
        latest = await fetchLatestPythonVersion(getDesktopRuntimeHost(), pkg.name);
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

function toPackageModel(pkg: InstalledPythonPack): PackageModel {
  return {
    name: pkg.name,
    description: "",
    version: pkg.version,
    authors: [],
    repo_id: pkg.repo_id,
    nodes: [],
    examples: [],
    assets: [],
  };
}

/** Installed Python packs, without update information. */
async function listPythonInstalledPackages(): Promise<PackageModel[]> {
  return (await listInstalledPythonPacks(getDesktopRuntimeHost())).map(toPackageModel);
}

/**
 * List installed npm runtime packages from the optional-node directory.
 */
async function listNpmInstalledPackages(): Promise<PackageModel[]> {
  try {
    const ctx = buildRuntimeContext(getDesktopRuntimeHost());
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

/** Whether the id names an npm runtime package rather than a Python pack. */
function isNpmRuntimePackage(repoId: string): repoId is RuntimePackageId {
  return isRuntimePackageId(repoId) && RUNTIME_PACKAGES[repoId] instanceof NpmRuntimePackage;
}

/** Install the newest PyPI release of a Python pack, or an npm runtime package by id. */
export async function installPackage(repoId: string): Promise<PackageResponse> {
  if (isNpmRuntimePackage(repoId)) {
    return installRuntimePackage(repoId);
  }
  return installPythonPack(getDesktopRuntimeHost(), repoId);
}

/** Uninstall a Python pack, or an npm runtime package by id. */
export async function uninstallPackage(repoId: string): Promise<PackageResponse> {
  if (isNpmRuntimePackage(repoId)) {
    return uninstallRuntimePackage(repoId);
  }
  return uninstallPythonPack(getDesktopRuntimeHost(), repoId);
}

/** Reinstall a Python pack at its newest PyPI release, or update an npm runtime package. */
export async function updatePackage(repoId: string): Promise<PackageResponse> {
  if (isNpmRuntimePackage(repoId)) {
    return getDesktopRuntimeRegistry().runToCompletion(repoId, "update");
  }
  return updatePythonPack(getDesktopRuntimeHost(), repoId);
}

/**
 * Installed packs that pin a `nodetool-core` other than the installed one.
 * The renderer offers to remove each through {@link uninstallPackage}.
 */
export async function getStalePacks(): Promise<PackageModel[]> {
  return (await getStalePythonPacks(getDesktopRuntimeHost())).map(toPackageModel);
}

/** Installed packs below the bridge protocol floor. */
export async function checkExpectedPackageVersions(): Promise<ExpectedPackageVersion[]> {
  return checkExpectedPythonPackageVersions(getDesktopRuntimeHost());
}

/** Bring each pack {@link checkExpectedPackageVersions} reports up to its floor. */
export async function installExpectedPackages(): Promise<ExpectedPackagesResult> {
  return installExpectedPythonPackages(getDesktopRuntimeHost());
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
// System-level runtime packages, installed on demand from the Package
// Manager. The registry is the desktop host's one from runtimeHost.ts.
// =============================================================================

function isRuntimePackageId(id: string): id is RuntimePackageId {
  return isKnownRuntimePackageId(id);
}

/** All valid runtime package IDs — sourced from the runtime registry. */
export const RUNTIME_PACKAGE_IDS: readonly RuntimePackageId[] =
  REGISTRY_RUNTIME_PACKAGE_IDS;

/**
 * Check the installation status of all runtime packages.
 * Delegates to the runtime registry.
 */
export async function getRuntimePackageStatuses(): Promise<RuntimePackageStatus[]> {
  const registry = getDesktopRuntimeRegistry();
  const statuses = await registry.statuses();
  return statuses.map((s) => {
    const pkg = RUNTIME_PACKAGES[s.id];
    return {
      id: s.id,
      name: pkg.name,
      description: pkg.description,
      installed: s.installed,
      bundled: s.bundled,
      installing: registry.isInstalling(s.id),
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
    getDesktopRuntimeHost().setCondaEnvPath(installLocation);
  }

  emitBootMessage(`Installing ${pkg.name}...`);
  logMessage(`Installing runtime: ${packageId}`);

  const result = await getDesktopRuntimeRegistry().runToCompletion(packageId, "install");
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
  return getDesktopRuntimeRegistry().runToCompletion(packageId, "update");
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
    await getDesktopRuntimeRegistry().uninstall(packageId);
    return { success: true, message: `${pkg.name} removed successfully` };
  } catch (error: unknown) {
    logMessage(`Failed to uninstall runtime package ${packageId}: ${errorMsg(error)}`, "error");
    return { success: false, message: `Failed to uninstall: ${errorMsg(error)}` };
  }
}
