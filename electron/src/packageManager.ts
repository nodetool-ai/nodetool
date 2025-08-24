import { spawn } from "child_process";
import { logMessage } from "./logger";
import { getProcessEnv, getUVPath } from "./config";
import {
  PackageInfo,
  PackageModel,
  PackageListResponse,
  InstalledPackageListResponse,
  PackageResponse,
  PackageNode
} from "./types";
import * as https from "https";

/**
 * Package Manager Module
 * 
 * This module handles Python package management operations using uv.
 * It provides functionality to list, install, and uninstall packages
 * directly through the Node.js process without relying on the Python API.
 */

const REGISTRY_URL = "https://raw.githubusercontent.com/nodetool-ai/nodetool-registry/main/index.json";
const METADATA_PATH = "src/nodetool/package_metadata";

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
          const packages = registryData.packages || [];
          resolve({
            packages: packages as PackageInfo[],
            count: packages.length
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

export async function fetchAllNodes(forceRefresh: boolean = false): Promise<PackageNode[]> {
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
    console.log("allNodes", allNodes);
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
    listInstalledPackages().catch(() => ({ packages: [], count: 0 }))
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
    return sorted.map((n) => ({ ...n, installed: installedRepoIds.has(n.package || "") }));
  }

  // --- Lightweight fuzzy matching similar to NodeMenuStore ---
  const normalize = (s: string) => s.toLowerCase();
  const tokenize = (s: string) =>
    normalize(s)
      .split(/[\s.,\-_]+/)
      .filter((t) => t.length > 0);

  const sequentialMatchScore = (needle: string, haystack: string): number => {
    // Returns a score in [0, 0.6] based on sequential char match and gap penalty
    const n = normalize(needle);
    const h = normalize(haystack);
    if (!n || !h) return 0;
    let qi = 0;
    let lastIndex = -1;
    let gaps = 0;
    for (let i = 0; i < h.length && qi < n.length; i++) {
      if (h[i] === n[qi]) {
        if (lastIndex >= 0) gaps += i - lastIndex - 1;
        lastIndex = i;
        qi += 1;
      }
    }
    const ratio = qi / n.length;
    if (ratio === 0) return 0;
    const gapPenalty = Math.min(gaps / Math.max(n.length, 1), 1);
    return 0.6 * ratio * (1 - 0.5 * gapPenalty);
  };

  const substringScore = (needle: string, haystack: string): number => {
    // Returns a score in [0, 1] with boosts for prefix and word-boundary matches
    const n = normalize(needle);
    const h = normalize(haystack);
    if (!n || !h) return 0;
    const idx = h.indexOf(n);
    if (idx < 0) return 0;
    const isPrefix = idx === 0;
    const isWordBoundary = idx > 0 ? /[^a-z0-9]/.test(h[idx - 1]) : true;
    const lengthBoost = Math.min(n.length / Math.max(h.length, n.length), 1);
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
      { key: "description", weight: 0.6 }
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

  return scored.map((s) => ({ ...s.node, installed: installedRepoIds.has(s.node.package || "") }));
}

export async function getPackageForNodeType(nodeType: string): Promise<string | null> {
  const nodes = await fetchAllNodes();
  const match = nodes.find((n) => n.node_type === nodeType);
  return match?.package ?? null;
}

/**
 * Run a uv command
 */
async function runUvCommand(args: string[], options?: { stdin?: string }): Promise<string> {
  const uvPath = getUVPath();
  const command = [uvPath, ...args];

  return new Promise((resolve, reject) => {
    logMessage(`Running uv command: ${command.join(" ")}`);

    const process = spawn(command[0], command.slice(1), {
      env: getProcessEnv(),
      stdio: "pipe"
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
      logMessage(output.trim());
    });

    process.stderr?.on("data", (data: Buffer) => {
      const output = data.toString();
      stderr += output;
      logMessage(output.trim(), "warn");
    });

    process.on("exit", (code: number | null) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });

    process.on("error", (error) => {
      reject(new Error(`Failed to run command: ${error.message}`));
    });
  });
}

/**
 * List installed packages
 */
export async function listInstalledPackages(): Promise<InstalledPackageListResponse> {
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
          description: "",  // uv pip list doesn't provide description
          version: pkg.version,
          authors: [],
          repo_id: "nodetool-ai/" + pkg.name,
          nodes: [],
          examples: [],
          assets: []
        } as PackageModel;
      });

    return {
      packages: nodetoolPackages,
      count: nodetoolPackages.length
    };
  } catch (error: any) {
    logMessage(`Failed to list installed packages: ${error.message}`, "error");
    return { packages: [], count: 0 };
  }
}

/**
 * Install a package
 */
export async function installPackage(repoId: string): Promise<PackageResponse> {
  try {
    const installUrl = `git+https://github.com/${repoId}.git`;

    const args = [
      "pip",
      "install",
      "--index-strategy",
      "unsafe-best-match",
      "--system",
      installUrl
    ];

    // Add extra index URL for CUDA packages on non-macOS platforms
    if (process.platform !== "darwin") {
      args.push("--extra-index-url", "https://download.pytorch.org/whl/cu121");
    }

    await runUvCommand(args);

    return {
      success: true,
      message: `Package ${repoId} installed successfully`
    };
  } catch (error: any) {
    logMessage(`Failed to install package ${repoId}: ${error.message}`, "error");
    return {
      success: false,
      message: `Failed to install package: ${error.message}`
    };
  }
}

/**
 * Uninstall a package
 */
export async function uninstallPackage(repoId: string): Promise<PackageResponse> {
  try {
    // Extract project name from repo_id (e.g., "owner/project" -> "project")
    const projectName = repoId.split("/")[1];

    // Use uv pip uninstall
    await runUvCommand(["pip", "uninstall", projectName], { stdin: "y\n" });

    return {
      success: true,
      message: `Package ${repoId} uninstalled successfully`
    };
  } catch (error: any) {
    logMessage(`Failed to uninstall package ${repoId}: ${error.message}`, "error");
    return {
      success: false,
      message: `Failed to uninstall package: ${error.message}`
    };
  }
}

/**
 * Update a package
 */
export async function updatePackage(repoId: string): Promise<PackageResponse> {
  try {
    const installUrl = `git+https://github.com/${repoId}.git`;

    const args = [
      "pip",
      "install",
      "--upgrade",
      "--index-strategy",
      "unsafe-best-match",
      "--system",
      installUrl
    ];

    // Add extra index URL for CUDA packages on non-macOS platforms
    if (process.platform !== "darwin") {
      args.push("--extra-index-url", "https://download.pytorch.org/whl/cu121");
    }

    await runUvCommand(args);

    return {
      success: true,
      message: `Package ${repoId} updated successfully`
    };
  } catch (error: any) {
    logMessage(`Failed to update package ${repoId}: ${error.message}`, "error");
    return {
      success: false,
      message: `Failed to update package: ${error.message}`
    };
  }
}

/**
 * Validate repository ID format
 */
export function validateRepoId(repoId: string): { valid: boolean; error?: string } {
  if (!repoId) {
    return { valid: false, error: "Repository ID cannot be empty" };
  }

  const pattern = /^[a-zA-Z0-9][-a-zA-Z0-9_]*\/[a-zA-Z0-9][-a-zA-Z0-9_]*$/;
  if (!pattern.test(repoId)) {
    return {
      valid: false,
      error: `Invalid repository ID format: ${repoId}. Must be in the format <owner>/<project>`
    };
  }

  return { valid: true };
}