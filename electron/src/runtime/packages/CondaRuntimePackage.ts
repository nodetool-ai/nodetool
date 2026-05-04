import * as path from "path";
import { fileExists } from "../../utils";
import {
  RuntimePackage,
  RuntimeContext,
  RuntimeStatus,
  RuntimeProgress,
  RuntimeResolution,
  RuntimeCategory,
} from "./types";

export interface CondaRuntimePackageOptions {
  id: string;
  name: string;
  description: string;
  category: RuntimeCategory;
  versionRange: string;
  /** conda package specs (e.g. ["ffmpeg>=6,<7", "x264"]) */
  condaPackages: string[];
  /** Binary name (without .exe) used to verify the install */
  verifyBinary: string;
  /** Extra binaries exposed by `resolve()` (logical name → binary basename) */
  extraBinaries?: Record<string, string>;
  /** Windows subdirectory under conda env where the binary lives */
  windowsBinSubdir?: string;
  approxSizeMB?: number;
  homepage?: string;
  platforms?: NodeJS.Platform[];
  dependsOn?: string[];
  /** Optional post-install hook (e.g. installing pip packages for python) */
  postInstall?: (ctx: RuntimeContext) => Promise<void>;
}

/**
 * A runtime package backed by a conda environment.
 */
export class CondaRuntimePackage implements RuntimePackage {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: RuntimeCategory;
  readonly approxSizeMB?: number;
  readonly homepage?: string;
  readonly platforms?: NodeJS.Platform[];
  readonly dependsOn?: string[];
  readonly versionRange: string;

  readonly condaPackages: string[];
  readonly verifyBinary: string;
  readonly extraBinaries: Record<string, string>;
  readonly windowsBinSubdir?: string;
  readonly postInstall?: (ctx: RuntimeContext) => Promise<void>;

  constructor(opts: CondaRuntimePackageOptions) {
    this.id = opts.id;
    this.name = opts.name;
    this.description = opts.description;
    this.category = opts.category;
    this.versionRange = opts.versionRange;
    this.condaPackages = opts.condaPackages;
    this.verifyBinary = opts.verifyBinary;
    this.extraBinaries = opts.extraBinaries ?? {};
    this.windowsBinSubdir = opts.windowsBinSubdir;
    this.approxSizeMB = opts.approxSizeMB;
    this.homepage = opts.homepage;
    this.platforms = opts.platforms;
    this.dependsOn = opts.dependsOn;
    this.postInstall = opts.postInstall;
  }

  private binDir(ctx: RuntimeContext): string {
    return ctx.platform === "win32"
      ? path.join(ctx.condaEnvPath, this.windowsBinSubdir ?? ".")
      : path.join(ctx.condaEnvPath, "bin");
  }

  private binaryPath(ctx: RuntimeContext, binaryName: string): string {
    const exe = ctx.platform === "win32" ? `${binaryName}.exe` : binaryName;
    return path.join(this.binDir(ctx), exe);
  }

  async status(ctx: RuntimeContext): Promise<RuntimeStatus> {
    const envExists = await fileExists(path.join(ctx.condaEnvPath, "conda-meta"));
    if (!envExists) {
      return { installed: false };
    }
    const verifyOk = await fileExists(this.binaryPath(ctx, this.verifyBinary));
    if (!verifyOk) {
      return { installed: false };
    }
    // Check extra binaries — partial install if any are missing
    for (const [logical, basename] of Object.entries(this.extraBinaries)) {
      if (!(await fileExists(this.binaryPath(ctx, basename)))) {
        return {
          installed: true,
          brokenReason: `Missing binary: ${logical} (${basename})`,
        };
      }
    }
    return { installed: true };
  }

  async *install(ctx: RuntimeContext, signal: AbortSignal): AsyncIterable<RuntimeProgress> {
    yield { type: "stage", label: `Installing ${this.name}` };
    try {
      const { ensureCondaEnvironment, installCondaPackageBySpec } = await import("../../installer");
      if (signal.aborted) throw new Error("aborted");

      yield { type: "stage", label: "Preparing conda environment" };
      const condaEnvPath = await ensureCondaEnvironment();

      if (this.condaPackages.length > 0) {
        yield { type: "stage", label: `Installing conda packages: ${this.condaPackages.join(", ")}` };
        await installCondaPackageBySpec(condaEnvPath, this.condaPackages, `Installing ${this.name}`);
      }

      if (this.postInstall) {
        yield { type: "stage", label: "Running post-install" };
        await this.postInstall(ctx);
      }

      yield { type: "done" };
    } catch (error) {
      yield { type: "error", message: error instanceof Error ? error.message : String(error) };
    }
  }

  async *update(ctx: RuntimeContext, signal: AbortSignal): AsyncIterable<RuntimeProgress> {
    const current = await this.status(ctx);
    if (!current.installed) {
      yield { type: "error", message: `${this.name} is not installed — install it first.` };
      return;
    }
    // For conda runtimes update is implemented as re-running install with the
    // same specs; micromamba will move to the newest matching version.
    yield* this.install(ctx, signal);
  }

  async *repair(ctx: RuntimeContext, signal: AbortSignal): AsyncIterable<RuntimeProgress> {
    yield { type: "stage", label: `Repairing ${this.name}` };
    yield* this.install(ctx, signal);
  }

  async uninstall(ctx: RuntimeContext): Promise<void> {
    const { removeCondaPackageBySpec } = await import("../../installer");
    await removeCondaPackageBySpec(ctx.condaEnvPath, this.condaPackages, `Removing ${this.name}`);
  }

  async resolve(ctx: RuntimeContext): Promise<RuntimeResolution | null> {
    const status = await this.status(ctx);
    if (!status.installed) return null;

    const binaries: Record<string, string> = {
      [this.verifyBinary]: this.binaryPath(ctx, this.verifyBinary),
    };
    for (const [logical, basename] of Object.entries(this.extraBinaries)) {
      binaries[logical] = this.binaryPath(ctx, basename);
    }
    return {
      binPaths: [this.binDir(ctx)],
      binaries,
    };
  }
}
