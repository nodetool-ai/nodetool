import { spawn, spawnSync } from "child_process";
import * as path from "path";
import * as fsp from "fs/promises";
import { fileExists } from "../../utils";
import { logMessage } from "../../logger";
import { emitServerLog } from "../../events";
import { getProcessEnv } from "../../config";
import {
  RuntimePackage,
  RuntimeContext,
  RuntimeStatus,
  RuntimeProgress,
  RuntimeResolution,
  RuntimeCategory,
} from "./types";

export interface NpmRuntimePackageOptions {
  id: string;
  name: string;
  description: string;
  category: RuntimeCategory;
  versionRange: string;
  /** Full npm install specs, e.g. ["@anthropic-ai/claude-agent-sdk@0.2.126"] */
  npmPackages: string[];
  /** Bare package names used for status / uninstall, e.g. ["@anthropic-ai/claude-agent-sdk"] */
  packageNames: string[];
  approxSizeMB?: number;
  homepage?: string;
  platforms?: NodeJS.Platform[];
  dependsOn?: string[];
}

function resolveNpmExecutable(): string {
  const candidates =
    process.platform === "win32" ? ["npm.cmd", "npm"] : ["npm"];
  for (const candidate of candidates) {
    try {
      const result = spawnSync(candidate, ["--version"], {
        stdio: "ignore",
        shell: process.platform === "win32",
      });
      if (result.status === 0) return candidate;
    } catch {
      // continue
    }
  }
  return "";
}

/**
 * A runtime package backed by npm packages installed under
 * `<userData>/optional-node` (the optional-node root).
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

  private async runNpm(
    ctx: RuntimeContext,
    args: string[],
    signal: AbortSignal,
    onLog: (level: "info" | "warn", line: string) => void,
  ): Promise<void> {
    const npmPath = resolveNpmExecutable();
    if (!npmPath) {
      throw new Error(
        "npm not found in PATH. Install Node.js (which includes npm) to install JavaScript packages."
      );
    }
    await this.ensureRoot(ctx);
    const cacheDir = path.join(ctx.userDataDir, "npm-cache");
    await fsp.mkdir(cacheDir, { recursive: true });

    const command = [npmPath, ...args, "--prefix", ctx.optionalNodeRoot, "--cache", cacheDir];
    return new Promise<void>((resolve, reject) => {
      logMessage(`Running npm command: ${command.join(" ")}`);
      const child = spawn(command[0], command.slice(1), {
        env: getProcessEnv(),
        stdio: "pipe",
        windowsHide: true,
      });

      const onAbort = () => {
        child.kill();
      };
      signal.addEventListener("abort", onAbort);

      let stderr = "";
      child.stdout?.on("data", (data: Buffer) => {
        const output = data.toString();
        for (const line of output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
          logMessage(line);
          emitServerLog(line);
          onLog("info", line);
        }
      });
      child.stderr?.on("data", (data: Buffer) => {
        const output = data.toString();
        stderr += output;
        for (const line of output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
          logMessage(line, "warn");
          emitServerLog(line);
          onLog("warn", line);
        }
      });
      child.on("exit", (code) => {
        signal.removeEventListener("abort", onAbort);
        if (signal.aborted) {
          reject(new Error("aborted"));
        } else if (code === 0) {
          resolve();
        } else {
          reject(new Error(`npm failed with code ${code}: ${stderr}`));
        }
      });
      child.on("error", (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      });
    });
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
    const npmPath = resolveNpmExecutable();
    if (!npmPath) {
      throw new Error("npm not found in PATH.");
    }
    await this.ensureRoot(ctx);
    const cacheDir = path.join(ctx.userDataDir, "npm-cache");
    const args = ["uninstall", ...this.packageNames, "--prefix", ctx.optionalNodeRoot, "--cache", cacheDir];
    await new Promise<void>((resolve, reject) => {
      const child = spawn(npmPath, args, {
        env: getProcessEnv(),
        stdio: "pipe",
        windowsHide: true,
      });
      let stderr = "";
      child.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });
      child.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error(`npm uninstall failed: ${stderr}`))
      );
      child.on("error", reject);
    });
  }

  async resolve(ctx: RuntimeContext): Promise<RuntimeResolution | null> {
    const status = await this.status(ctx);
    if (!status.installed) return null;
    return {
      nodeModulePaths: [this.nodeModulesPath(ctx)],
    };
  }
}

/** Exported for tests / callers that need to ensure npm exists. */
export const _internal = { resolveNpmExecutable };
