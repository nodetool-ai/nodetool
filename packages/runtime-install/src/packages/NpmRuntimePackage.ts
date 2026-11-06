import { spawn } from "node:child_process";
import * as fsp from "node:fs/promises";
import * as path from "node:path";

import { runExclusive } from "../exclusive.js";
import { fileExists } from "../fs.js";
import { outputLines, reportOutput } from "../host.js";
import type {
  RuntimePackage,
  RuntimeContext,
  RuntimeStatus,
  RuntimeProgress,
  RuntimeResolution,
  RuntimeCategory,
} from "./types.js";

interface NpmRuntimePackageOptions {
  id: string;
  name: string;
  description: string;
  category: RuntimeCategory;
  versionRange: string;
  /** Full npm install specs, e.g. ["@huggingface/transformers@3.0.0"] */
  npmPackages: string[];
  /** Bare package names used for status / uninstall, e.g. ["@huggingface/transformers"] */
  packageNames: string[];
  approxSizeMB?: number;
  homepage?: string;
  platforms?: NodeJS.Platform[];
  dependsOn?: string[];
}

/**
 * A runtime package backed by npm packages installed under
 * `<dataDir>/optional-node` (the optional-node root).
 */
export class NpmRuntimePackage implements RuntimePackage {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: RuntimeCategory;
  readonly approxSizeMB?: number;
  readonly homepage?: string;
  readonly platforms?: NodeJS.Platform[];
  readonly dependsOn?: string[];
  readonly versionRange: string;

  readonly npmPackages: string[];
  readonly packageNames: string[];

  constructor(opts: NpmRuntimePackageOptions) {
    this.id = opts.id;
    this.name = opts.name;
    this.description = opts.description;
    this.category = opts.category;
    this.versionRange = opts.versionRange;
    this.npmPackages = opts.npmPackages;
    this.packageNames = opts.packageNames;
    this.approxSizeMB = opts.approxSizeMB;
    this.homepage = opts.homepage;
    this.platforms = opts.platforms;
    this.dependsOn = opts.dependsOn;
  }

  private nodeModulesPath(ctx: RuntimeContext): string {
    return path.join(ctx.optionalNodeRoot, "node_modules");
  }

  private packagePath(ctx: RuntimeContext, packageName: string): string {
    return path.join(this.nodeModulesPath(ctx), ...packageName.split("/"));
  }

  private async readInstalledVersion(ctx: RuntimeContext): Promise<string | undefined> {
    const pkgJsonPath = path.join(this.packagePath(ctx, this.packageNames[0]), "package.json");
    try {
      const raw = await fsp.readFile(pkgJsonPath, "utf8");
      const parsed = JSON.parse(raw) as { version?: string };
      return parsed.version;
    } catch {
      return undefined;
    }
  }

  /** Pinned version, derived from the first npm spec (e.g. "pkg@1.2.3" → "1.2.3"). */
  private pinnedVersion(): string | undefined {
    const spec = this.npmPackages[0] ?? "";
    // For scoped pkgs the @ in @scope/pkg@1.2.3 is at index 0 — split at last @
    const at = spec.lastIndexOf("@");
    if (at <= 0) return undefined;
    return spec.slice(at + 1) || undefined;
  }

  async status(ctx: RuntimeContext): Promise<RuntimeStatus> {
    const checks = await Promise.all(
      this.packageNames.map((name) =>
        fileExists(path.join(this.packagePath(ctx, name), "package.json"))
      )
    );
    const allInstalled = checks.every(Boolean);
    if (!allInstalled) {
      const missing = this.packageNames.filter((_, i) => !checks[i]);
      if (checks.some(Boolean)) {
        return {
          installed: true,
          brokenReason: `Missing packages: ${missing.join(", ")}`,
        };
      }
      return { installed: false };
    }
    const installedVersion = await this.readInstalledVersion(ctx);
    const latestVersion = this.pinnedVersion();
    return {
      installed: true,
      installedVersion,
      latestVersion,
      updateAvailable:
        Boolean(installedVersion && latestVersion && installedVersion !== latestVersion),
    };
  }

  private async ensureRoot(ctx: RuntimeContext): Promise<void> {
    await fsp.mkdir(ctx.optionalNodeRoot, { recursive: true });
    const packageJsonPath = path.join(ctx.optionalNodeRoot, "package.json");
    try {
      await fsp.access(packageJsonPath);
    } catch {
      await fsp.writeFile(
        packageJsonPath,
        JSON.stringify({ private: true, type: "module" }, null, 2),
        "utf8"
      );
    }
  }

  /** `npm <args> --prefix <root> [--cache <dir>]`, queued on the npm root. */
  private async runNpm(
    ctx: RuntimeContext,
    args: string[],
    signal: AbortSignal | undefined,
    onLog: (level: "info" | "warn", line: string) => void,
  ): Promise<void> {
    const npm = ctx.host.npmInvocation();
    if (!npm) {
      throw new Error(
        "npm not found. Reinstall the NodeTool environment to restore the bundled Node.js/npm runtime."
      );
    }
    await this.ensureRoot(ctx);
    const cacheArgs: string[] = [];
    if (ctx.host.npmCacheDir) {
      await fsp.mkdir(ctx.host.npmCacheDir, { recursive: true });
      cacheArgs.push("--cache", ctx.host.npmCacheDir);
    }
    const command = [npm.command, ...npm.baseArgs, ...args, "--prefix", ctx.optionalNodeRoot, ...cacheArgs];
    // Node pack installs share this root, so they queue on the same key.
    return runExclusive(ctx.optionalNodeRoot, () => new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error("aborted"));
        return;
      }
      ctx.log("info", `Running npm command: ${command.join(" ")}`);
      const child = spawn(command[0], command.slice(1), {
        env: ctx.host.processEnv(),
        stdio: "pipe",
        windowsHide: true,
      });
      const onAbort = () => {
        child.kill();
      };
      signal?.addEventListener("abort", onAbort);

      let stderr = "";
      child.stdout?.on("data", (data: Buffer) => {
        for (const line of outputLines(data)) {
          reportOutput(ctx.host, line);
          onLog("info", line);
        }
      });
      child.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
        for (const line of outputLines(data)) {
          reportOutput(ctx.host, line, "warn");
          onLog("warn", line);
        }
      });
      child.on("close", (code) => {
        signal?.removeEventListener("abort", onAbort);
        if (signal?.aborted) {
          reject(new Error("aborted"));
        } else if (code === 0) {
          resolve();
        } else {
          reject(new Error(`npm failed with code ${code}: ${stderr}`));
        }
      });
      child.on("error", (error) => {
        signal?.removeEventListener("abort", onAbort);
        reject(error);
      });
    }));
  }

  async *install(ctx: RuntimeContext, signal: AbortSignal): AsyncIterable<RuntimeProgress> {
    yield { type: "stage", label: `Installing ${this.name}` };
    const queue: RuntimeProgress[] = [];
    try {
      await this.runNpm(ctx, ["install", ...this.npmPackages], signal, (level, line) => {
        queue.push({ type: "log", level, line });
      });
      for (const item of queue) yield item;
      yield { type: "done" };
    } catch (error) {
      for (const item of queue) yield item;
      yield { type: "error", message: error instanceof Error ? error.message : String(error) };
    }
  }

  async *update(ctx: RuntimeContext, signal: AbortSignal): AsyncIterable<RuntimeProgress> {
    const current = await this.status(ctx);
    if (!current.installed) {
      yield { type: "error", message: `${this.name} is not installed — install it first.` };
      return;
    }
    if (current.installedVersion && this.pinnedVersion() === current.installedVersion) {
      yield { type: "stage", label: `${this.name} is already at the target version.` };
      yield { type: "done" };
      return;
    }
    // Uninstall then install — keeps behavior identical to the previous flow.
    try {
      await this.uninstall(ctx);
    } catch (error) {
      yield { type: "log", level: "warn", line: `Uninstall before update failed: ${error}` };
    }
    yield* this.install(ctx, signal);
  }

  async *repair(ctx: RuntimeContext, signal: AbortSignal): AsyncIterable<RuntimeProgress> {
    yield { type: "stage", label: `Repairing ${this.name}` };
    yield* this.install(ctx, signal);
  }

  async uninstall(ctx: RuntimeContext): Promise<void> {
    await this.runNpm(ctx, ["uninstall", ...this.packageNames], undefined, () => {});
  }

  async resolve(ctx: RuntimeContext): Promise<RuntimeResolution | null> {
    const status = await this.status(ctx);
    if (!status.installed) return null;
    return {
      nodeModulePaths: [this.nodeModulesPath(ctx)],
    };
  }
}
