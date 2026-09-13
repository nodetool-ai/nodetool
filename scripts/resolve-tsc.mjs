import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_TSC_VERSION = "7";
export const DEFAULT_TSC_HEAP_MB = 8192;

const COMPILER_PACKAGES = {
  "6": "typescript",
  "7": "@typescript/native"
};

const COMPILER_BIN_NAMES = {
  "6": ["tsc6", "tsc"],
  "7": ["tsc", "tsc7"]
};

const defaultRootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Validate the low-level compiler selector used by repository scripts.
 * Keeping this validation here makes malformed values fail before npm starts
 * a compiler process with an accidental fallback.
 */
export function validateTscVersion(value = DEFAULT_TSC_VERSION) {
  const version = String(value);
  if (version !== "6" && version !== "7") {
    throw new Error(
      `run-tsc: invalid NODETOOL_TSC_VERSION=${JSON.stringify(value)}; ` +
        "expected 6 or 7"
    );
  }
  return version;
}

function packagePath(packageRoot, packageName) {
  return join(packageRoot, "node_modules", ...packageName.split("/"));
}

/** Find an installed package by walking from a project towards the repo root. */
export function findNearestPackageRoot(
  startDir,
  packageName,
  rootDir = process.cwd(),
  exists = existsSync
) {
  let dir = resolve(startDir);
  const root = resolve(rootDir);
  for (;;) {
    const candidate = packagePath(dir, packageName);
    if (exists(join(candidate, "package.json"))) {
      return candidate;
    }
    if (dir === root) {
      break;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  const rootCandidate = packagePath(root, packageName);
  return exists(join(rootCandidate, "package.json")) ? rootCandidate : null;
}

function readPackageMetadata(packageRoot) {
  try {
    return JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  } catch (error) {
    throw new Error(`run-tsc: unable to read ${join(packageRoot, "package.json")}: ${error.message}`);
  }
}

function binValue(metadata, version) {
  const bin = metadata.bin;
  if (typeof bin === "string") {
    return bin;
  }
  if (bin && typeof bin === "object") {
    for (const name of COMPILER_BIN_NAMES[version]) {
      if (typeof bin[name] === "string") {
        return bin[name];
      }
    }
    const values = Object.values(bin);
    if (values.length === 1 && typeof values[0] === "string") {
      return values[0];
    }
  }
  return null;
}

/**
 * Resolve the selected compiler's package metadata and executable.
 * TypeScript 6 is the JavaScript compatibility compiler. TypeScript 7 is the
 * native compiler and must be executed directly rather than through Node.
 */
export function resolveTsc({
  version = process.env.NODETOOL_TSC_VERSION ?? DEFAULT_TSC_VERSION,
  startDir = process.cwd(),
  rootDir = defaultRootDir,
  platform = process.platform,
  arch = process.arch,
  exists = existsSync
} = {}) {
  const selectedVersion = validateTscVersion(version);
  const packageName = COMPILER_PACKAGES[selectedVersion];
  const packageRoot = findNearestPackageRoot(startDir, packageName, rootDir, exists);
  if (!packageRoot) {
    throw new Error(
      `run-tsc: TypeScript ${selectedVersion} package ${packageName} was not found ` +
        `from ${resolve(startDir)} or ${resolve(rootDir)}. ` +
        `Run npm install to install ${packageName}.`
    );
  }

  const metadata = readPackageMetadata(packageRoot);
  let platformPackageName = null;
  let platformPackageRoot = null;
  let binPath;
  if (selectedVersion === "7") {
    platformPackageName = `@typescript/typescript-${platform}-${arch}`;
    platformPackageRoot = findNearestPackageRoot(
      packageRoot,
      platformPackageName,
      rootDir,
      exists
    );
    if (!platformPackageRoot) {
      throw new Error(
        `run-tsc: TypeScript 7 native package ${platformPackageName} was not found ` +
          `from ${packageRoot} or ${resolve(rootDir)}. ` +
          `Run npm install on a supported platform to install ${platformPackageName}.`
      );
    }
    binPath = resolve(
      platformPackageRoot,
      "lib",
      platform === "win32" ? "tsc.exe" : "tsc"
    );
    if (platform === "win32" && binPath.length >= 248 && !binPath.startsWith("\\\\?\\")) {
      binPath = `\\\\?\\${binPath}`;
    }
  } else {
    const relativeBin = binValue(metadata, selectedVersion);
    if (!relativeBin) {
      throw new Error(
        `run-tsc: package ${packageName} at ${packageRoot} does not declare a ` +
          `TypeScript ${selectedVersion} executable in package.json bin`
      );
    }
    binPath = resolve(packageRoot, relativeBin);
  }

  if (!exists(binPath)) {
    throw new Error(
      `run-tsc: TypeScript ${selectedVersion} executable ${binPath} is missing. ` +
        `Run npm install to restore ${platformPackageName ?? packageName}.`
    );
  }
  let executable = false;
  try {
    executable = (statSync(binPath).mode & 0o111) !== 0;
  } catch {
    // The existence callback is injectable for resolution tests. A real
    // invocation will fail with the normal spawn error if stat is unavailable.
  }

  return {
    version: selectedVersion,
    packageName,
    packageRoot,
    platformPackageName,
    platformPackageRoot,
    metadata,
    binPath,
    executable,
    isJavaScript: selectedVersion === "6"
  };
}

export function typeScriptBuildEnv(baseEnv = process.env, version = DEFAULT_TSC_VERSION) {
  const env = { ...baseEnv };
  if (validateTscVersion(version) !== "6") {
    return env;
  }
  const configured = env.NODETOOL_TSC_HEAP_MB;
  const heapMb = configured && /^\d+$/.test(configured) ? Number(configured) : DEFAULT_TSC_HEAP_MB;
  const existing = env.NODE_OPTIONS ?? "";
  if (!/--max[-_]old[-_]space[-_]size=\d+/i.test(existing)) {
    env.NODE_OPTIONS = [existing, `--max-old-space-size=${heapMb}`]
      .filter(Boolean)
      .join(" ")
      .trim();
  }
  return env;
}

export function getTscCommand(options = {}) {
  const selectedVersion =
    options.version ?? (options.env ?? process.env).NODETOOL_TSC_VERSION ?? DEFAULT_TSC_VERSION;
  const compiler = resolveTsc({ ...options, version: selectedVersion });
  const args = options.args ?? [];
  return {
    compiler,
    command: compiler.isJavaScript ? process.execPath : compiler.binPath,
    args: compiler.isJavaScript ? [compiler.binPath, ...args] : args,
    env: typeScriptBuildEnv(options.env ?? process.env, compiler.version),
    cwd: options.cwd ?? options.startDir ?? process.cwd()
  };
}

// Descriptive aliases keep the resolver usable from scripts whose purpose is
// broader than the historical `run-tsc` entry point.
export const resolveTypeScriptCompiler = resolveTsc;
export const getTypeScriptCompilerCommand = getTscCommand;
