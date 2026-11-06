import * as path from "node:path";

/** The conda environment's Python interpreter. */
export function condaPythonPath(envPath: string, platform: NodeJS.Platform): string {
  return platform === "win32" ? path.join(envPath, "python.exe") : path.join(envPath, "bin", "python");
}

/** The conda environment's uv, which the Python runtime installs. */
export function condaUvPath(envPath: string, platform: NodeJS.Platform): string {
  return platform === "win32"
    ? path.join(envPath, "Library", "bin", "uv.exe")
    : path.join(envPath, "bin", "uv");
}

/** The conda environment's Node.js, when one is installed there. */
export function condaNodePath(envPath: string, platform: NodeJS.Platform): string {
  return platform === "win32" ? path.join(envPath, "node.exe") : path.join(envPath, "bin", "node");
}

/** The npm root that npm runtime packages and node packs install into. */
export function optionalNodeRoot(dataDir: string): string {
  return path.join(dataDir, "optional-node");
}

/**
 * Where uv keeps tools and the Pythons they run on. The host's PATH includes
 * `bin`, so a tool is found as soon as it is installed.
 */
export function uvToolDirs(dataDir: string): { tools: string; bin: string; python: string } {
  const root = path.join(dataDir, "uv-tools");
  return {
    tools: path.join(root, "tools"),
    bin: path.join(root, "bin"),
    python: path.join(root, "python"),
  };
}
