import { spawn } from "child_process";
import { logMessage } from "./logger";
import { getProcessEnv, getUVPath } from "./config";
import { 
  PackageInfo, 
  PackageModel, 
  PackageListResponse, 
  InstalledPackageListResponse,
  PackageResponse 
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