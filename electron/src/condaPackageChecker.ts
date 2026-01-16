/**
 * Conda Package Checker Module
 *
 * This module handles detection of conda package updates by comparing
 * installed packages in the conda environment against the lock file.
 * When differences are detected, it can trigger installation/upgrade
 * of the required packages using micromamba.
 */

import { spawn } from "child_process";
import { promises as fs } from "fs";
import { app } from "electron";
import * as path from "path";

import { logMessage } from "./logger";
import { getCondaEnvPath, getCondaLockFilePath } from "./config";
import { emitBootMessage, emitServerLog } from "./events";
import { fileExists } from "./utils";

/**
 * Represents a conda package with name and optional version
 */
export interface CondaPackageSpec {
  name: string;
  version?: string;
  buildString?: string;
}

/**
 * Result of comparing installed packages vs lock file
 */
export interface CondaPackageCheckResult {
  needsUpdate: boolean;
  missingPackages: CondaPackageSpec[];
  outdatedPackages: Array<{
    name: string;
    installedVersion: string;
    expectedVersion: string;
  }>;
  extraPackages: CondaPackageSpec[];
}

const MICROMAMBA_ENV_VAR = "MICROMAMBA_EXE";
const MICROMAMBA_EXECUTABLE_NAME =
  process.platform === "win32" ? "micromamba.exe" : "micromamba";
const MICROMAMBA_BUNDLED_DIR_NAME = "micromamba";

// Pattern for detecting version constraints like >=, <=, >, <, !=
const VERSION_CONSTRAINT_PATTERN = /[<>!]/;
// Pattern for matching package names
const PACKAGE_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
// Pattern for matching conda package specs with version constraints
const PACKAGE_WITH_CONSTRAINT_PATTERN = /^([a-zA-Z0-9_-]+)([><=!].*)$/;
// Pattern for detecting pip section markers
const PIP_SECTION_PATTERN = /^-\s*pip:?$/;

/**
 * Check if a line marks the end of the dependencies section
 */
function isEndOfDependenciesSection(line: string, trimmed: string, inDependencies: boolean): boolean {
  if (!inDependencies) return false;
  if (trimmed.length === 0) return false;
  if (line.startsWith(" ") || line.startsWith("\t")) return false;
  if (trimmed.startsWith("-")) return false;
  return true;
}

/**
 * Check if a line is a pip section marker
 */
function isPipSectionMarker(trimmed: string): boolean {
  return PIP_SECTION_PATTERN.test(trimmed);
}

/**
 * Extract base version without build metadata (e.g., "1.2.3+build" -> "1.2.3")
 */
function getBaseVersion(version: string): string {
  return version.split("+")[0];
}

/**
 * Get candidate directories for finding bundled micromamba
 */
function getCandidateMicromambaResourceDirs(): string[] {
  const dirs = new Set<string>();

  if (app.isPackaged) {
    dirs.add(process.resourcesPath);
  } else {
    dirs.add(path.join(app.getAppPath(), "resources"));
    dirs.add(path.resolve(__dirname, "..", "resources"));
  }

  return Array.from(dirs);
}

/**
 * Find the bundled micromamba executable
 */
async function findBundledMicromambaExecutable(): Promise<string | null> {
  const binaryName = MICROMAMBA_EXECUTABLE_NAME;
  const platform = process.platform;
  const arch = process.arch;

  let platformDir: string;
  if (platform === "win32") {
    platformDir = "win-64";
  } else if (platform === "darwin") {
    platformDir = arch === "arm64" ? "osx-arm64" : "osx-64";
  } else if (platform === "linux") {
    platformDir = arch === "arm64" ? "linux-aarch64" : "linux-64";
  } else {
    return null;
  }

  for (const baseDir of getCandidateMicromambaResourceDirs()) {
    const platformSpecificPath = path.join(
      baseDir,
      MICROMAMBA_BUNDLED_DIR_NAME,
      platformDir,
      platform === "win32" ? "Library/bin/micromamba.exe" : "bin/micromamba"
    );
    if (await fileExists(platformSpecificPath)) {
      return platformSpecificPath;
    }

    const legacyPath = path.join(
      baseDir,
      MICROMAMBA_BUNDLED_DIR_NAME,
      binaryName
    );
    if (await fileExists(legacyPath)) {
      return legacyPath;
    }
  }

  return null;
}

/**
 * Get the micromamba executable path
 */
async function getMicromambaExecutable(): Promise<string> {
  const explicit = process.env[MICROMAMBA_ENV_VAR]?.trim();
  if (explicit) {
    return explicit;
  }

  const bundled = await findBundledMicromambaExecutable();
  if (bundled) {
    return bundled;
  }

  throw new Error("micromamba executable not found");
}

/**
 * Parse a conda lock file and extract package specifications
 * The lock file format is YAML with dependencies listed as:
 *   - packagename=version=buildstring
 *   - packagename=version
 *   - packagename
 */
export async function parseCondaLockFile(
  lockFilePath: string
): Promise<CondaPackageSpec[]> {
  if (!(await fileExists(lockFilePath))) {
    throw new Error(`Lock file not found: ${lockFilePath}`);
  }

  const content = await fs.readFile(lockFilePath, "utf-8");
  const packages: CondaPackageSpec[] = [];

  // Find the dependencies section
  const lines = content.split("\n");
  let inDependencies = false;
  let inPipSection = false;
  let pipSectionIndent = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    const indent = line.length - line.trimStart().length;

    if (trimmed === "dependencies:") {
      inDependencies = true;
      continue;
    }

    // Exit dependencies section when we hit a non-indented line that's not empty
    if (isEndOfDependenciesSection(line, trimmed, inDependencies)) {
      break;
    }

    // Check if we're entering pip section
    if (inDependencies && isPipSectionMarker(trimmed)) {
      inPipSection = true;
      pipSectionIndent = indent;
      continue;
    }

    // Check if we're exiting pip section (back to conda deps at same or less indentation)
    if (inPipSection && indent <= pipSectionIndent && trimmed.startsWith("- ")) {
      inPipSection = false;
    }

    // Skip pip dependencies
    if (inPipSection) {
      continue;
    }

    if (inDependencies && trimmed.startsWith("-")) {
      // Parse the package spec
      const spec = trimmed.substring(1).trim();
      if (!spec) continue;

      // Skip pip marker
      if (spec === "pip:" || spec === "pip") {
        continue;
      }

      const packageSpec = parsePackageSpec(spec);
      if (packageSpec) {
        packages.push(packageSpec);
      }
    }
  }

  return packages;
}

/**
 * Parse a single package specification string
 * Formats:
 *   - packagename=version=buildstring
 *   - packagename=version
 *   - packagename>=version,<version
 *   - packagename
 */
function parsePackageSpec(spec: string): CondaPackageSpec | null {
  if (!spec) return null;

  // Handle exact version specs like name=version=buildstring or name=version first
  // (this is the most common format in lock files)
  const eqParts = spec.split("=");
  if (eqParts.length >= 2 && eqParts[0] && !VERSION_CONSTRAINT_PATTERN.test(eqParts[0])) {
    return {
      name: eqParts[0],
      version: eqParts[1] || undefined,
      buildString: eqParts[2] || undefined,
    };
  }

  // Handle version constraints like >=6,<7
  const constraintMatch = spec.match(PACKAGE_WITH_CONSTRAINT_PATTERN);
  if (constraintMatch) {
    return {
      name: constraintMatch[1],
      version: constraintMatch[2],
    };
  }

  // Just a package name
  return {
    name: spec,
  };
}

/**
 * Get installed packages from the conda environment using micromamba
 */
export async function getInstalledCondaPackages(): Promise<CondaPackageSpec[]> {
  const condaEnvPath = getCondaEnvPath();
  
  if (!(await fileExists(condaEnvPath))) {
    logMessage(`Conda environment not found at ${condaEnvPath}`);
    return [];
  }

  try {
    const micromambaExecutable = await getMicromambaExecutable();
    const output = await runMicromambaList(micromambaExecutable, condaEnvPath);
    return parseMicromambaListOutput(output);
  } catch (error: any) {
    logMessage(`Failed to get installed conda packages: ${error.message}`, "error");
    return [];
  }
}

/**
 * Run micromamba list command and return output
 */
async function runMicromambaList(
  micromambaExecutable: string,
  envPrefix: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ["list", "--prefix", envPrefix, "--json"];
    const proc = spawn(micromambaExecutable, args, {
      stdio: "pipe",
      env: {
        ...process.env,
        MAMBA_ROOT_PREFIX: path.join(app.getPath("userData"), "micromamba"),
      },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("exit", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`micromamba list failed with code ${code}: ${stderr}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to run micromamba: ${err.message}`));
    });
  });
}

/**
 * Parse the JSON output from micromamba list
 */
function parseMicromambaListOutput(output: string): CondaPackageSpec[] {
  try {
    const packages = JSON.parse(output);
    if (!Array.isArray(packages)) {
      return [];
    }

    return packages.map((pkg: any) => ({
      name: pkg.name,
      version: pkg.version,
      buildString: pkg.build_string,
    }));
  } catch (error: any) {
    logMessage(`Failed to parse micromamba list output: ${error.message}`, "warn");
    return [];
  }
}

/**
 * Compare installed packages against the lock file
 */
export async function checkCondaPackages(): Promise<CondaPackageCheckResult> {
  const lockFilePath = getCondaLockFilePath();
  
  logMessage(`Checking conda packages against lock file: ${lockFilePath}`);

  let expectedPackages: CondaPackageSpec[];
  try {
    expectedPackages = await parseCondaLockFile(lockFilePath);
  } catch (error: any) {
    logMessage(`Failed to parse lock file: ${error.message}`, "error");
    return {
      needsUpdate: false,
      missingPackages: [],
      outdatedPackages: [],
      extraPackages: [],
    };
  }

  const installedPackages = await getInstalledCondaPackages();
  
  // Create a map for quick lookup of installed packages
  const installedMap = new Map<string, CondaPackageSpec>();
  for (const pkg of installedPackages) {
    installedMap.set(pkg.name.toLowerCase(), pkg);
  }

  // Create a map for quick lookup of expected packages
  const expectedMap = new Map<string, CondaPackageSpec>();
  for (const pkg of expectedPackages) {
    expectedMap.set(pkg.name.toLowerCase(), pkg);
  }

  const missingPackages: CondaPackageSpec[] = [];
  const outdatedPackages: Array<{
    name: string;
    installedVersion: string;
    expectedVersion: string;
  }> = [];
  const extraPackages: CondaPackageSpec[] = [];

  // Check for missing or outdated packages
  for (const expected of expectedPackages) {
    const installed = installedMap.get(expected.name.toLowerCase());
    
    if (!installed) {
      missingPackages.push(expected);
    } else if (expected.version && installed.version) {
      // Only compare versions if both have exact versions (not constraints)
      const expectedVersion = expected.version.replace(/^=/, "");
      if (!VERSION_CONSTRAINT_PATTERN.test(expectedVersion) && installed.version !== expectedVersion) {
        // Check if the version is actually different (handling build strings)
        const installedBase = getBaseVersion(installed.version);
        const expectedBase = getBaseVersion(expectedVersion);
        if (installedBase !== expectedBase) {
          outdatedPackages.push({
            name: expected.name,
            installedVersion: installed.version,
            expectedVersion: expectedVersion,
          });
        }
      }
    }
  }

  // Check for extra packages (installed but not in lock file)
  // Note: This is informational - we generally don't remove extra packages
  for (const installed of installedPackages) {
    if (!expectedMap.has(installed.name.toLowerCase())) {
      extraPackages.push(installed);
    }
  }

  const needsUpdate = missingPackages.length > 0 || outdatedPackages.length > 0;

  if (needsUpdate) {
    logMessage(
      `Conda package check: ${missingPackages.length} missing, ${outdatedPackages.length} outdated`
    );
    for (const pkg of missingPackages) {
      logMessage(`  Missing: ${pkg.name}${pkg.version ? `=${pkg.version}` : ""}`);
    }
    for (const pkg of outdatedPackages) {
      logMessage(`  Outdated: ${pkg.name} (${pkg.installedVersion} -> ${pkg.expectedVersion})`);
    }
  } else {
    logMessage("Conda packages are up to date");
  }

  return {
    needsUpdate,
    missingPackages,
    outdatedPackages,
    extraPackages,
  };
}

/**
 * Update conda packages to match the lock file
 * This runs micromamba install with the lock file to sync packages
 */
export async function updateCondaPackagesFromLockFile(): Promise<void> {
  const lockFilePath = getCondaLockFilePath();
  const condaEnvPath = getCondaEnvPath();

  logMessage(`Updating conda packages from lock file: ${lockFilePath}`);
  emitBootMessage("Updating conda packages...");

  if (!(await fileExists(lockFilePath))) {
    throw new Error(`Lock file not found: ${lockFilePath}`);
  }

  const micromambaExecutable = await getMicromambaExecutable();

  // Use micromamba update to sync packages with the lock file
  const args = [
    "install",
    "--yes",
    "--prefix",
    condaEnvPath,
    "--file",
    lockFilePath,
    "--strict-channel-priority",
  ];

  await runMicromambaInstall(micromambaExecutable, args);

  logMessage("Conda packages updated successfully");
  emitBootMessage("Conda packages updated");
}

/**
 * Run micromamba install command
 */
async function runMicromambaInstall(
  micromambaExecutable: string,
  args: string[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    logMessage(`Running: ${micromambaExecutable} ${args.join(" ")}`);

    const proc = spawn(micromambaExecutable, args, {
      stdio: "pipe",
      env: {
        ...process.env,
        MAMBA_ROOT_PREFIX: path.join(app.getPath("userData"), "micromamba"),
      },
    });

    proc.stdout?.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        logMessage(`micromamba: ${line}`);
        emitServerLog(`micromamba: ${line}`);
      }
    });

    proc.stderr?.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        logMessage(`micromamba stderr: ${line}`, "warn");
        emitServerLog(`micromamba stderr: ${line}`);
      }
    });

    proc.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`micromamba install failed with exit code ${code}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to run micromamba: ${err.message}`));
    });
  });
}

/**
 * Check and update conda packages if needed
 * This is the main entry point for the package check on startup
 */
export async function checkAndUpdateCondaPackages(): Promise<void> {
  try {
    logMessage("=== Starting Conda Package Check ===");

    const result = await checkCondaPackages();

    if (result.needsUpdate) {
      logMessage(
        `Found ${result.missingPackages.length} missing and ${result.outdatedPackages.length} outdated packages`
      );
      await updateCondaPackagesFromLockFile();
    }

    logMessage("=== Conda Package Check Complete ===");
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logMessage(`Conda package check failed: ${errorMessage}`, "error");
    if (errorStack) {
      logMessage(`Stack trace: ${errorStack}`, "error");
    }
    // Don't throw - allow startup to continue even if package check fails
  }
}
