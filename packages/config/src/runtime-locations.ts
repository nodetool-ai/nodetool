import yaml from "js-yaml";
import { z } from "zod";
import { getNodeBuiltinSync, safeProcessEnv, safeProcessPlatform } from "./node-import.js";

export type NodetoolHost = "desktop" | "cli" | "npx" | "source" | "docker";

const runtimeSettingsSchema = z.object({ CONDA_ENV: z.string().optional() });
type RuntimeSettings = z.infer<typeof runtimeSettingsSchema>;

export interface RuntimeLocations {
  readonly host: NodetoolHost;
  readonly optionalNodeRoot: string | null;
  readonly uvTools: { readonly tools: string; readonly bin: string; readonly python: string } | null;
  readonly micromambaRoot: string | null;
  readonly condaEnv: string | null;
}

export interface RuntimeLocationOptions {
  readonly desktopUserData?: string;
  readonly platform?: NodeJS.Platform;
  readonly homeDir?: string;
  readonly condaEnv?: string;
  readonly settings?: Readonly<RuntimeSettings>;
}

export function isNodetoolHost(value: string | undefined): value is NodetoolHost {
  return value === "desktop" || value === "cli" || value === "npx" || value === "source" || value === "docker";
}

function nodePaths(platform: string): typeof import("node:path") {
  const paths = getNodeBuiltinSync<typeof import("node:path")>("node:path");
  if (!paths) { throw new Error("Runtime locations require Node.js"); }
  return platform === "win32" ? paths.win32 : paths.posix;
}

/** Electron supplies its userData path. Backend code never derives an Electron directory. */
export function runtimeLocations(
  env: NodeJS.ProcessEnv = safeProcessEnv(),
  options: RuntimeLocationOptions = {}
): RuntimeLocations {
  const hostValue = env["NODETOOL_HOST"] ?? "cli";
  if (!isNodetoolHost(hostValue)) { throw new Error(`Unknown NODETOOL_HOST: ${hostValue}`); }
  const host = hostValue;
  if (host === "docker") {
    return { host, optionalNodeRoot: null, uvTools: null, micromambaRoot: null, condaEnv: null };
  }
  const platform = options.platform ?? safeProcessPlatform();
  const paths = nodePaths(platform);
  const os = getNodeBuiltinSync<typeof import("node:os")>("node:os");
  const fs = getNodeBuiltinSync<typeof import("node:fs")>("node:fs");
  if (!os || !fs) { throw new Error("Runtime locations require Node.js"); }
  const home = options.homeDir ?? env["HOME"] ?? env["USERPROFILE"] ?? os.homedir();
  const dataDir = platform === "win32"
    ? paths.join(env["APPDATA"] ?? paths.join(home, "AppData", "Roaming"), "nodetool")
    : paths.join(env["XDG_DATA_HOME"] ?? paths.join(home, ".local", "share"), "nodetool");
  const desktopUserData = options.desktopUserData ?? env["NODETOOL_DESKTOP_USER_DATA"];
  if (host === "desktop" && !desktopUserData) {
    throw new Error("The desktop host must supply its userData directory");
  }
  const root = host === "desktop" && desktopUserData ? desktopUserData : dataDir;
  const configDir = platform === "win32"
    ? paths.join(env["APPDATA"] ?? home, "nodetool")
    : paths.join(home, ".config", "nodetool");
  const settingsFile = paths.join(configDir, "settings.yaml");
  const condaOverride = env["NODETOOL_CONDA_ENV"]?.trim() || undefined;
  let configuredConda: string | undefined;
  if (!condaOverride && !options.condaEnv) {
    const settings = runtimeSettingsSchema.safeParse(options.settings ?? (fs.existsSync(settingsFile)
      ? yaml.load(fs.readFileSync(settingsFile, "utf8")) : undefined));
    if (settings.success && settings.data.CONDA_ENV?.trim()) {
      configuredConda = settings.data.CONDA_ENV;
    }
  }
  const uvRoot = paths.join(root, "uv-tools");
  const defaultConda = host === "desktop" && platform === "win32" && env["ALLUSERSPROFILE"]
    ? paths.join(env["ALLUSERSPROFILE"], "nodetool", "conda_env")
    : host === "desktop" && platform === "linux" && env["SUDO_USER"]
      ? "/opt/nodetool/conda_env" : paths.join(dataDir, "conda_env");
  return {
    host,
    optionalNodeRoot: paths.join(root, "optional-node"),
    uvTools: { tools: paths.join(uvRoot, "tools"), bin: paths.join(uvRoot, "bin"), python: paths.join(uvRoot, "python") },
    micromambaRoot: paths.join(root, "micromamba"),
    condaEnv: condaOverride ?? options.condaEnv ?? configuredConda ?? defaultConda
  };
}

export function runtimeBinPath(
  locations: RuntimeLocations,
  platform: string = safeProcessPlatform()
): string[] {
  const paths = nodePaths(platform);
  const conda = locations.condaEnv;
  const bins = conda === null ? [] : platform === "win32"
    ? [conda, paths.join(conda, "Library", "mingw-w64", "bin"), paths.join(conda, "Library", "usr", "bin"), paths.join(conda, "Library", "bin"), paths.join(conda, "Scripts")]
    : [paths.join(conda, "bin"), paths.join(conda, "lib")];
  if (locations.optionalNodeRoot) { bins.push(paths.join(locations.optionalNodeRoot, "node_modules", ".bin")); }
  if (locations.uvTools) { bins.push(locations.uvTools.bin); }
  return bins;
}

/** Set managed paths before imports. Existing overrides win, including absent-on-disk paths. */
export function applyRuntimeEnv(
  env: NodeJS.ProcessEnv = safeProcessEnv(),
  options: RuntimeLocationOptions = {}
): void {
  const locations = runtimeLocations(env, options);
  const platform = options.platform ?? safeProcessPlatform();
  const paths = nodePaths(platform);
  if (env["NODETOOL_HOST"] === undefined) { env["NODETOOL_HOST"] = locations.host; }
  if (locations.optionalNodeRoot && env["NODETOOL_OPTIONAL_NODE_MODULES"] === undefined) {
    env["NODETOOL_OPTIONAL_NODE_MODULES"] = paths.join(locations.optionalNodeRoot, "node_modules");
  }
  const current = (env["PATH"] ?? "").split(paths.delimiter).filter(Boolean);
  const bins = runtimeBinPath(locations, platform);
  const existing = new Set(current.map((entry) => platform === "win32" ? entry.toLowerCase() : entry));
  const added = bins.filter((entry) => !existing.has(platform === "win32" ? entry.toLowerCase() : entry));
  if (added.length > 0) { env["PATH"] = [...added, ...current].join(paths.delimiter); }
  if (locations.uvTools) {
    env["UV_TOOL_DIR"] ??= locations.uvTools.tools;
    env["UV_TOOL_BIN_DIR"] ??= locations.uvTools.bin;
    env["UV_PYTHON_INSTALL_DIR"] ??= locations.uvTools.python;
  }
}
