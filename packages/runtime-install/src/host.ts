/**
 * What an installer needs from the process that runs it. The desktop app,
 * the CLI and any other Node host implement this once; the install code
 * never reads Electron, a window or a settings file on its own.
 */

export type RuntimeLogLevel = "info" | "warn" | "error";

/** How to invoke npm: the executable plus the arguments before the npm subcommand. */
export interface NpmInvocation {
  readonly command: string;
  readonly baseArgs: readonly string[];
}

/** Host settings the installer reads and writes, such as the saved GPU detection. */
export interface RuntimeSettingsStore {
  read(key: string): unknown;
  write(key: string, value: unknown): void;
}

export interface RuntimeInstallHost {
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  /**
   * The host's runtime root. `optional-node`, `uv-tools`, `micromamba`,
   * `sd-cpp` and `wan2gp` live directly below it, as
   * `runtimeLocations()` in `@nodetool-ai/config` names them.
   */
  readonly dataDir: string;
  /** The npm cache, or null for npm's default cache. */
  readonly npmCacheDir: string | null;
  /** The macOS product version (`14.5`), used for pack platform checks. */
  readonly osVersion?: string;
  /** The conda environment every conda and Python runtime installs into. */
  condaEnvPath(): string;
  /** Record a new conda environment location. */
  setCondaEnvPath(location: string): void;
  /**
   * Where to create the conda environment when it does not exist yet. The
   * desktop app asks the user. Without it the installer uses `condaEnvPath()`.
   */
  chooseNewCondaEnvPath?(): Promise<string>;
  /** The environment for child processes (npm, uv, micromamba, Python). */
  processEnv(): Record<string, string>;
  /** The npm to run, or null when none is available. */
  npmInvocation(): NpmInvocation | null;
  /**
   * Directories that may hold a bundled micromamba, laid out as
   * `micromamba/<conda platform>/bin/micromamba`.
   */
  micromambaResourceDirs(): readonly string[];
  readonly settings: RuntimeSettingsStore;
  log(level: RuntimeLogLevel, message: string): void;
  /** One line of child-process output. Defaults to `log`. */
  output?(line: string, level: RuntimeLogLevel): void;
  /** A short status line, such as the desktop boot screen shows. */
  status?(message: string): void;
  /** Coarse progress of a long step. */
  progress?(component: string, percent: number, action: string, eta?: string): void;
}

/** Report one output line through the host. */
export function reportOutput(host: RuntimeInstallHost, line: string, level: RuntimeLogLevel = "info"): void {
  if (host.output) {
    host.output(line, level);
  } else {
    host.log(level, line);
  }
}

/** Report a status line, and log it when the host shows no status. */
export function reportStatus(host: RuntimeInstallHost, message: string): void {
  if (host.status) {
    host.status(message);
  } else {
    host.log("info", message);
  }
}

/** Log, stream and show one message, as a long install step does. */
export function announce(host: RuntimeInstallHost, message: string, level: RuntimeLogLevel = "info"): void {
  reportOutput(host, message, level);
  host.status?.(message);
}

/** Split child-process output into trimmed, non-empty lines. */
export function outputLines(chunk: Buffer | string): string[] {
  return chunk
    .toString()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
