/**
 * The runtime install host for a plain Node.js process: the CLI, a server or
 * a native editor. Locations come from `runtimeLocations()` for the
 * process's `NODETOOL_HOST`, and settings go to the shared `settings.yaml`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import * as path from "node:path";

import yaml from "js-yaml";
import { applyRuntimeEnv, nodetoolSettingsFile, runtimeLocations } from "@nodetool-ai/config";
import { findNpmCli } from "@nodetool-ai/pack-manager/npm-runner";

import type { NpmInvocation, RuntimeInstallHost, RuntimeLogLevel, RuntimeSettingsStore } from "./host.js";

export interface NodeRuntimeHostOptions {
  /** The process environment the host reads and children inherit. */
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly arch?: string;
  readonly log?: (level: RuntimeLogLevel, message: string) => void;
  readonly output?: (line: string, level: RuntimeLogLevel) => void;
  readonly status?: (message: string) => void;
  /** Directories with a bundled micromamba, if the host ships one. */
  readonly micromambaResourceDirs?: readonly string[];
  /** Override the settings file, for tests. */
  readonly settingsFile?: string;
}

/** Markers of an activated conda or virtual environment that would redirect uv and Python. */
const INHERITED_ENV_MARKERS = [
  "CONDA_PREFIX",
  "CONDA_DEFAULT_ENV",
  "CONDA_PROMPT_MODIFIER",
  "CONDA_SHLVL",
  "CONDA_EXE",
  "CONDA_PYTHON_EXE",
  "_CE_CONDA",
  "_CE_M",
  "VIRTUAL_ENV",
  "PYTHONHOME",
  "PYTHONPATH",
  "UV_PYTHON",
  "UV_PROJECT_ENVIRONMENT",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A YAML settings file, read on every access and replaced atomically on write. */
export function yamlSettingsStore(file: string): RuntimeSettingsStore {
  const readAll = (): Record<string, unknown> => {
    if (!existsSync(file)) {
      return {};
    }
    const text = readFileSync(file, "utf8");
    const loaded: unknown = text.trim() === "" ? undefined : yaml.load(text);
    return isRecord(loaded) ? loaded : {};
  };
  return {
    read: (key) => readAll()[key],
    write: (key, value) => {
      const settings = { ...readAll(), [key]: value };
      mkdirSync(path.dirname(file), { recursive: true });
      const temp = `${file}.${process.pid}.tmp`;
      writeFileSync(temp, yaml.dump(settings), "utf8");
      renameSync(temp, file);
    },
  };
}

/** The macOS product version (`14.5`), read from `sw_vers`. */
function macOSProductVersion(): string | undefined {
  try {
    const result = spawnSync("sw_vers", ["-productVersion"], { encoding: "utf8" });
    return result.status === 0 ? result.stdout.trim() || undefined : undefined;
  } catch {
    return undefined;
  }
}

/** npm-cli.js run with this Node, else `npm` on PATH outside Windows. */
function nodeNpmInvocation(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): NpmInvocation | null {
  const cli = findNpmCli(process.execPath, platform, env["PATH"] ?? "");
  if (cli) {
    return { command: process.execPath, baseArgs: [cli] };
  }
  return platform === "win32" ? null : { command: "npm", baseArgs: [] };
}

/**
 * Build the host. Throws on a host that installs nothing at run time
 * (`NODETOOL_HOST=docker`).
 */
export function createNodeRuntimeHost(options: NodeRuntimeHostOptions = {}): RuntimeInstallHost {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const locations = runtimeLocations(env, { platform });
  if (!locations.optionalNodeRoot || !locations.condaEnv) {
    throw new Error(`The ${locations.host} host does not install runtimes. Build them into the image instead.`);
  }
  const dataDir = path.dirname(locations.optionalNodeRoot);
  const settingsFile = options.settingsFile ?? nodetoolSettingsFile(env, { platform });
  const settings = yamlSettingsStore(settingsFile);
  let condaEnv = locations.condaEnv;
  const log = options.log ?? ((level: RuntimeLogLevel, message: string) => {
    if (level !== "info") {
      process.stderr.write(`${message}\n`);
    }
  });

  return {
    platform,
    arch: options.arch ?? process.arch,
    dataDir,
    npmCacheDir: null,
    osVersion: platform === "darwin" ? macOSProductVersion() : undefined,
    condaEnvPath: () => condaEnv,
    setCondaEnvPath(location) {
      condaEnv = location;
      // An explicit NODETOOL_CONDA_ENV is not a choice to record.
      if (!env["NODETOOL_CONDA_ENV"]?.trim() && settings.read("CONDA_ENV") !== location) {
        settings.write("CONDA_ENV", location);
      }
    },
    processEnv() {
      const child: Record<string, string> = {};
      for (const [key, value] of Object.entries(env)) {
        if (typeof value === "string") {
          child[key] = value;
        }
      }
      for (const key of INHERITED_ENV_MARKERS) {
        delete child[key];
      }
      child["PYTHONUNBUFFERED"] = "1";
      child["PYTHONNOUSERSITE"] = "1";
      child["NODETOOL_CONDA_ENV"] ??= condaEnv;
      applyRuntimeEnv(child, { platform, condaEnv });
      return child;
    },
    npmInvocation: () => nodeNpmInvocation(platform, env),
    micromambaResourceDirs: () => options.micromambaResourceDirs ?? [],
    settings,
    log,
    ...(options.output && { output: options.output }),
    ...(options.status && { status: options.status }),
  };
}
