import { spawn } from "child_process";
import { app } from "electron";
import { logMessage } from "./logger";
import { getProcessEnv, getUVPath, getPythonPath } from "./config";
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
import { getTorchIndexUrl } from "./torchPlatformCache";
import { fileExists } from "./utils";

/**
 * Package Manager Module
 *
 * This module handles Python package management operations using uv.
 * It provides functionality to list, install, and uninstall packages
 * directly through the Node.js process without relying on the Python API.
 */

// Nodetool wheel-based package index (PEP 503 compliant)
const PACKAGE_INDEX_URL =
  "https://nodetool-ai.github.io/nodetool-registry/simple/";
// Primary PyPI simple index to resolve all other packages
const PYPI_SIMPLE_INDEX_URL = "https://pypi.org/simple";
// Legacy JSON registry for backward compatibility
const REGISTRY_URL =
  "https://raw.githubusercontent.com/nodetool-ai/nodetool-registry/main/index.json";
const METADATA_PATH = "src/nodetool/package_metadata";

// Get the app version dynamically from Electron's app.getVersion()
function getAppVersion(): string {
  try {
    return app.getVersion();
  } catch {
    return "0.0.0";
  }
}

// Get all installed nodetool-* pip packages (excluding torchruntime which has separate installation)
async function getInstalledNodetoolPackages(): Promise<string[]> {
  try {
    const output = await runUvCommand(["pip", "list", "--format=json"]);
    const allPackages = JSON.parse(output);
    return allPackages
      .filter((pkg: any) => pkg.name.startsWith("nodetool-"))
      .map((pkg: any) => pkg.name);
  } catch (error: any) {
    logMessage(`Failed to list installed packages: ${error.message}`, "error");
    return [];
  }
}

// Export a function to get expected version for a specific package
export function getExpectedVersion(packageName: string): string | null {
  return getAppVersion();
}

// Export a function to get all packages that need version checking
export async function getPackagesWithVersionRequirements(): Promise<string[]> {
  return await getInstalledNodetoolPackages();
}

// Simple in-memory cache for nodes
let nodeCache: PackageNode[] | null = null;

/**
 * Fetch available packages from the registry
 */
export async function fetchAvailablePackages(): Promise<PackageListResponse> {
  return new Promise((resolve, reject) => {
    https.get(REGISTRY_URL, (response) => {
      let data = "";

      response.on("data", (chunk) => {
        data += chunk;
      });

      response.on("end", () => {
        try {
          const registryData = JSON.parse(data);
          const packages = (registryData.packages || []).map((pkg: any) => ({
            name: pkg.name,
            description: pkg.description ?? "",
            repo_id: pkg.repo_id,
            namespaces: pkg.namespaces,
            version:
              pkg.version ??
              pkg.latestVersion ??
              pkg.latest_version ??
              undefined,
          })) as PackageInfo[];
          resolve({
            packages,
            count: packages.length,
          });
        } catch (error) {
          reject(new Error(`Failed to parse registry data: ${error}`));
        }
      });

      response.on("error", (error) => {
        reject(new Error(`Failed to fetch registry: ${error.message}`));
      });
    });
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

async function fetchLatestVersionFromSimpleIndex(
  packageName: string
): Promise<string | null> {
  try {
    const normalized = canonicalizePackageName(packageName).replace(/-/g, "-");
    const url = `${PACKAGE_INDEX_URL}${normalized}/`;
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

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort(compareVersions);
    return candidates[candidates.length - 1];
  } catch (error: any) {
    logMessage(
      `Failed to fetch latest version for ${packageName}: ${error.message}`,
      "warn"
    );
    return null;
  }
}

async function fetchPackageNodes(repoId: string): Promise<PackageNode[]> {
  try {
    const packageName = repoId.split("/")[1];
    const url = `https://raw.githubusercontent.com/${repoId}/main/${METADATA_PATH}/${packageName}.json`;
    const jsonText = await httpsGet(url);
    const metadata = JSON.parse(jsonText);
    const nodes: PackageNode[] = (metadata.nodes || []).map((node: any) => ({
      ...node,
      package: repoId,
    }));
    return nodes;
  } catch (error: any) {
    logMessage(`Error fetching nodes from ${repoId}: ${error.message}`, "warn");
    return [];
  }
}

export async function fetchAllNodes(
  forceRefresh: boolean = false
): Promise<PackageNode[]> {
  if (nodeCache && !forceRefresh) {
    return nodeCache;
  }
  try {
    const { packages } = await fetchAvailablePackages();
    const tasks = packages.map((pkg) => fetchPackageNodes(pkg.repo_id));
    const results = await Promise.allSettled(tasks);
    const allNodes: PackageNode[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        allNodes.push(...result.value);
      }
    }
    nodeCache = allNodes;
    return allNodes;
  } catch (error: any) {
    logMessage(`Failed to fetch all nodes: ${error.message}`, "error");
    return [];
  }
}

export function clearNodeCache(): void {
  nodeCache = null;
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

  const fieldWeights: Array<{
    key: keyof PackageNode;
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
          const value = (node[key] as unknown as string) || "";
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
    } catch (error: any) {
      logMessage(
        `Failed to fetch package registry for update check: ${error.message}`,
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
      ].filter(Boolean) as string[];
      for (const key of keys) {
        if (!versionHints.has(key)) {
          versionHints.set(key, pkg.version as string);
        }
      }
    }

    const updateChecks = installedPackages.map(async (pkg) => {
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
  } catch (error: any) {
    logMessage(`Failed to check for package updates: ${error.message}`, "warn");
    return [];
  }
}

export async function getPackageForNodeType(
  nodeType: string
): Promise<string | null> {
  const nodes = await fetchAllNodes();
  const match = nodes.find((n) => n.node_type === nodeType);
  return match?.package ?? null;
}

/**
 * Run a uv command
 */
async function runUvCommand(
  args: string[],
  options?: { stdin?: string }
): Promise<string> {
  const uvPath = getUVPath();
  const pythonPath = getPythonPath();
  const command = [uvPath, ...args];

  // Check if uv executable exists before attempting to spawn
  const uvExists = await fileExists(uvPath);
  if (!uvExists) {
    const errorMsg = `Python environment not properly installed: uv executable not found at ${uvPath}. ` +
      `Please use "Reinstall environment" to set up the Python environment correctly.`;
    logMessage(errorMsg, "error");
    throw new Error(errorMsg);
  }

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
      const lines = output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      for (const line of lines) {
        logMessage(line);
        emitServerLog(line);
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
 * Internal function to list installed packages without version checking
 * Used by both listInstalledPackages and checkForPackageUpdates to avoid circular dependency
 */
async function listInstalledPackagesInternal(): Promise<PackageModel[]> {
  try {
    // Use uv pip list to get all installed packages
    const output = await runUvCommand(["pip", "list", "--format=json"]);
    const allPackages = JSON.parse(output);

    // Filter for nodetool packages
    const nodetoolPackages = allPackages
      .filter((pkg: any) => pkg.name.startsWith("nodetool-"))
      .map((pkg: any) => {
        return {
          name: pkg.name,
          description: "", // uv pip list doesn't provide description
          version: pkg.version,
          authors: [],
          repo_id: "nodetool-ai/" + pkg.name,
          nodes: [],
          examples: [],
          assets: [],
        } as PackageModel;
      });

    return nodetoolPackages;
  } catch (error: any) {
    logMessage(`Failed to list installed packages: ${error.message}`, "error");
    return [];
  }
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
  } catch (error: any) {
    logMessage(`Failed to list installed packages: ${error.message}`, "error");
    return { packages: [], count: 0 };
  }
}

/**
 * Install a package using wheel-based package index
 * Always fetches the latest version from the simple index and installs that specific version
 */
export async function installPackage(repoId: string): Promise<PackageResponse> {
  try {
    const packageName = repoId.split("/")[1];

    // Fetch the latest version from the simple index
    const latestVersion = await fetchLatestVersionFromSimpleIndex(packageName);
    if (!latestVersion) {
      return {
        success: false,
        message: `Could not find package ${packageName} in the package index`,
      };
    }

    const packageSpec = `${packageName}==${latestVersion}`;
    const message = `Installing ${packageName} v${latestVersion}...`;
    logMessage(message);
    emitServerLog(message);

    const args = [
      "pip",
      "install",
      "--prerelease=allow",
      "--index-url",
      PYPI_SIMPLE_INDEX_URL,
      "--extra-index-url",
      PACKAGE_INDEX_URL,
      "--index-strategy",
      "unsafe-best-match",
      "--system",
      packageSpec,
    ];

    // Add PyTorch index URL based on detected platform
    const torchIndexUrl = getTorchIndexUrl();
    if (torchIndexUrl) {
      logMessage(`Adding PyTorch index for package installation: ${torchIndexUrl}`);
      args.push("--extra-index-url", torchIndexUrl);
    }

    await runUvCommand(args);

    return {
      success: true,
      message: `Package ${repoId} v${latestVersion} installed successfully from wheel index`,
    };
  } catch (error: any) {
    logMessage(
      `Failed to install package ${repoId}: ${error.message}`,
      "error"
    );
    return {
      success: false,
      message: `Failed to install package: ${error.message}`,
    };
  }
}

/**
 * Uninstall a package
 */
export async function uninstallPackage(
  repoId: string
): Promise<PackageResponse> {
  try {
    // Extract project name from repo_id (e.g., "owner/project" -> "project")
    const projectName = repoId.split("/")[1];

    // Use uv pip uninstall
    await runUvCommand(["pip", "uninstall", projectName], { stdin: "y\n" });

    return {
      success: true,
      message: `Package ${repoId} uninstalled successfully`,
    };
  } catch (error: any) {
    logMessage(
      `Failed to uninstall package ${repoId}: ${error.message}`,
      "error"
    );
    return {
      success: false,
      message: `Failed to uninstall package: ${error.message}`,
    };
  }
}

/**
 * Update a package using wheel-based package index
 * Always fetches the latest version from the simple index and installs that specific version
 * Forces a true reinstall by clearing the uv cache and reinstalling the package
 */
export async function updatePackage(repoId: string): Promise<PackageResponse> {
  try {
    const packageName = repoId.split("/")[1];

    // Fetch the latest version from the simple index
    const latestVersion = await fetchLatestVersionFromSimpleIndex(packageName);
    if (!latestVersion) {
      return {
        success: false,
        message: `Could not find package ${packageName} in the package index`,
      };
    }

    const packageSpec = `${packageName}==${latestVersion}`;
    const message = `Updating ${packageName} to v${latestVersion}...`;
    logMessage(message);
    emitServerLog(message);
    emitBootMessage(message);

    const args = [
      "pip",
      "install",
      "--upgrade",
      "--reinstall",  // Force reinstall even if same version
      "--refresh",    // Clear cache and fetch fresh from index
      "--prerelease=allow",
      "--index-url",
      PYPI_SIMPLE_INDEX_URL,
      "--extra-index-url",
      PACKAGE_INDEX_URL,
      "--index-strategy",
      "unsafe-best-match",
      "--system",
      packageSpec,
    ];

    // Add PyTorch index URL based on detected platform
    const torchIndexUrl = getTorchIndexUrl();
    if (torchIndexUrl) {
      logMessage(`Adding PyTorch index for package update: ${torchIndexUrl}`);
      args.push("--extra-index-url", torchIndexUrl);
    }

    await runUvCommand(args);

    return {
      success: true,
      message: `Package ${repoId} updated to v${latestVersion} successfully from wheel index`,
    };
  } catch (error: any) {
    logMessage(`Failed to update package ${repoId}: ${error.message}`, "error");
    return {
      success: false,
      message: `Failed to update package: ${error.message}`,
    };
  }
}

/**
 * Get installation information for a package
 */
export function getPackageInstallationInfo(repoId: string): {
  packageName: string;
  repoId: string;
  wheelCommand: string;
  gitCommand: string;
  packageIndexUrl: string;
} {
  const packageName = repoId.split("/")[1];

  return {
    packageName,
    repoId,
    wheelCommand: `uv pip install --index-url ${PYPI_SIMPLE_INDEX_URL} --extra-index-url ${PACKAGE_INDEX_URL} ${packageName}`,
    gitCommand: `uv pip install git+https://github.com/${repoId}.git`,
    packageIndexUrl: PACKAGE_INDEX_URL,
  };
}

/**
 * Get the recommended install command for a package
 */
export function getInstallCommandForPackage(repoId: string): string {
  const packageName = repoId.split("/")[1];
  return `uv pip install --index-url ${PYPI_SIMPLE_INDEX_URL} --extra-index-url ${PACKAGE_INDEX_URL} ${packageName}`;
}

export { PACKAGE_INDEX_URL };

/**
 * Check a single package version against expected version
 * Returns { needsUpdate: true } if version doesn't match, { currentVersion: "x.y.z" } if ok
 */
export async function checkPackageVersion(
  packageName: string
): Promise<{ needsUpdate: boolean; currentVersion?: string; expectedVersion?: string }> {
  const expectedVersion = getExpectedVersion(packageName);

  if (!expectedVersion) {
    return { needsUpdate: false };
  }

  try {
    const output = await runUvCommand(["pip", "show", packageName]);
    const versionMatch = output.match(/^Version: (.+)$/m);
    const currentVersion = versionMatch ? versionMatch[1] : null;

    if (!currentVersion) {
      logMessage(`Package ${packageName} not installed, needs installation`);
      return { needsUpdate: true, expectedVersion };
    }

    const versionsMatch = compareVersions(currentVersion, expectedVersion);
    if (versionsMatch !== 0) {
      logMessage(
        `Package ${packageName} version mismatch: installed=${currentVersion}, expected=${expectedVersion}`
      );
      return { needsUpdate: true, currentVersion, expectedVersion };
    }

    return { needsUpdate: false, currentVersion };
  } catch (error: any) {
    if (error.message.includes("package not found")) {
      logMessage(`Package ${packageName} not installed, needs installation`);
      return { needsUpdate: true, expectedVersion };
    }
    logMessage(
      `Failed to check version for ${packageName}: ${error.message}`,
      "warn"
    );
    return { needsUpdate: false };
  }
}

/**
 * Check all expected package versions
 * Returns list of packages that need to be installed/updated
 */
export async function checkExpectedPackageVersions(): Promise<
  Array<{
    packageName: string;
    currentVersion?: string;
    expectedVersion: string | null;
  }>
> {
  const packagesToCheck = await getPackagesWithVersionRequirements();
  const packagesNeedingUpdate: Array<{
    packageName: string;
    currentVersion?: string;
    expectedVersion: string | null;
  }> = [];

  const expectedVersion = getAppVersion();

  for (const packageName of packagesToCheck) {
    const result = await checkPackageVersion(packageName);
    if (result.needsUpdate) {
      packagesNeedingUpdate.push({
        packageName,
        currentVersion: result.currentVersion,
        expectedVersion,
      });
    }
  }

  return packagesNeedingUpdate;
}

/**
 * Install or update packages to their expected versions
 * Returns summary of installation results
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
    const packageNames = packagesNeedingUpdate.map((p) => p.packageName).join(", ");
    logMessage(`Installing expected packages: ${packageNames}`);

    const expectedVersion = getAppVersion();
    const packageSpecs = packagesNeedingUpdate.map(
      (p) => `${p.packageName}==${expectedVersion}`
    );

    try {
      const message = `Installing ${packagesNeedingUpdate.length} packages (v${expectedVersion})...`;
      logMessage(message);
      emitServerLog(message);
      emitBootMessage(message);

      const args = [
        "pip",
        "install",
        "--prerelease=allow",
        "--index-url",
        PYPI_SIMPLE_INDEX_URL,
        "--extra-index-url",
        PACKAGE_INDEX_URL,
        "--index-strategy",
        "unsafe-best-match",
        "--system",
        ...packageSpecs,
      ];

      const torchIndexUrl = getTorchIndexUrl();
      if (torchIndexUrl) {
        args.push("--extra-index-url", torchIndexUrl);
      }

      await runUvCommand(args);
      const successMessage = `Successfully installed ${packageNames} (v${expectedVersion})`;
      logMessage(successMessage);
      emitServerLog(successMessage);
      emitBootMessage(successMessage);

      packagesUpdated = packagesNeedingUpdate.length;
    } catch (error: any) {
      logMessage(`Failed to install packages: ${error.message}`, "error");
      for (const pkg of packagesNeedingUpdate) {
        failures.push({
          packageName: pkg.packageName,
          error: error.message,
        });
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
export function validateRepoId(repoId: string): {
  valid: boolean;
  error?: string;
} {
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
