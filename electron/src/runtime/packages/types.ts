/**
 * Runtime Package Interface — see docs/runtime-package-interface.md.
 *
 * One interface every runtime package implements regardless of install
 * backend (conda / npm / electron-bundled). Consumers resolve runtimes by
 * id and get back binary paths and env vars; they don't care how it was
 * installed.
 */

export type RuntimeCategory = "language" | "tool" | "library";

export interface RuntimeContext {
  userDataDir: string;
  condaEnvPath: string;
  optionalNodeRoot: string;
  platform: NodeJS.Platform;
  arch: string;
  log(level: "info" | "warn" | "error", msg: string): void;
}

export interface RuntimeStatus {
  installed: boolean;
  installedVersion?: string;
  latestVersion?: string;
  updateAvailable?: boolean;
  brokenReason?: string;
}

export type RuntimeProgress =
  | { type: "stage"; label: string }
  | { type: "percent"; value: number }
  | { type: "log"; line: string; level?: "info" | "warn" }
  | { type: "done" }
  | { type: "error"; message: string };

export interface RuntimeResolution {
  binPaths?: string[];
  env?: Record<string, string>;
  binaries?: Record<string, string>;
  nodeModulePaths?: string[];
}

export interface RuntimePackage {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: RuntimeCategory;
  readonly approxSizeMB?: number;
  readonly homepage?: string;
  readonly platforms?: NodeJS.Platform[];
  readonly dependsOn?: string[];

  readonly versionRange: string;

  status(ctx: RuntimeContext): Promise<RuntimeStatus>;

  install(ctx: RuntimeContext, signal: AbortSignal): AsyncIterable<RuntimeProgress>;
  update(ctx: RuntimeContext, signal: AbortSignal): AsyncIterable<RuntimeProgress>;
  repair(ctx: RuntimeContext, signal: AbortSignal): AsyncIterable<RuntimeProgress>;
  uninstall(ctx: RuntimeContext): Promise<void>;

  resolve(ctx: RuntimeContext): Promise<RuntimeResolution | null>;
}
