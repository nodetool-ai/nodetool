import { spawn } from "child_process";
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
import { uvToolDirs } from "./uvToolDirs";

interface UvToolRuntimePackageOptions {
  id: string;
  name: string;
  description: string;
  category: RuntimeCategory;
  versionRange: string;
  /** PyPI requirement passed to `uv tool install` (e.g. "manimgx"). */
  toolSpec: string;
  /** Python version the tool runs on. uv downloads it when it is missing. */
  python: string;
  /** Executable the tool installs, without `.exe`. */
  verifyBinary: string;
  approxSizeMB?: number;
  homepage?: string;
  platforms?: NodeJS.Platform[];
}

/** The conda environment's uv, which the Python runtime installs. */
function uvPath(ctx: RuntimeContext): string {
  return ctx.platform === "win32"
    ? path.join(ctx.condaEnvPath, "Library", "bin", "uv.exe")
    : path.join(ctx.condaEnvPath, "bin", "uv");
}

/**
 * The environment for uv: the app's process environment without the conda
 * Python markers, plus the tool directories. `only-managed` keeps the tool on
 * a Python uv owns, so removing a system Python cannot break it.
 */
function uvEnv(ctx: RuntimeContext, base: Record<string, string>): Record<string, string> {
  const env = { ...base };
  for (const key of ["PYTHONPATH", "PYTHONHOME", "VIRTUAL_ENV", "UV_PYTHON"]) {
    delete env[key];
  }
  const dirs = uvToolDirs(ctx.userDataDir);
  env.UV_TOOL_DIR = dirs.tools;
  env.UV_TOOL_BIN_DIR = dirs.bin;
  env.UV_PYTHON_INSTALL_DIR = dirs.python;
  env.UV_PYTHON_PREFERENCE = "only-managed";
  return env;
}

/**
 * Run uv with argv (no shell), reporting each output line to `onLine`.
 * Rejects with the last lines of output on a non-zero exit or an abort.
 */
export function runUv(
  ctx: RuntimeContext,
  args: string[],
  env: Record<string, string>,
  signal: AbortSignal | undefined,
  onLine: (line: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(uvPath(ctx), args, { env, stdio: "pipe", windowsHide: true });
    const tail: string[] = [];
    const onData = (chunk: Buffer) => {
      for (const line of chunk.toString("utf8").split(/\r?\n/)) {
        if (line.trim() === "") continue;
        tail.push(line);
        if (tail.length > 20) tail.shift();
        onLine(line);
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    const onAbort = () => child.kill();
    signal?.addEventListener("abort", onAbort, { once: true });
    child.on("error", (error) => {
      signal?.removeEventListener("abort", onAbort);
      reject(error);
    });
    child.on("close", (code) => {
      signal?.removeEventListener("abort", onAbort);
      if (signal?.aborted) {
        reject(new Error("aborted"));
      } else if (code === 0) {
        resolve();
      } else {
        reject(new Error(`uv ${args[0]} ${args[1]} exited with code ${code}:\n${tail.join("\n")}`));
      }
    });
  });
}

/**
 * A runtime package installed with `uv tool install`: a Python command-line
 * tool in its own virtual environment, on a Python uv downloads. Use it for a
 * tool whose Python requirement the conda environment's Python cannot meet.
 */
export class UvToolRuntimePackage implements RuntimePackage {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: RuntimeCategory;
  readonly approxSizeMB?: number;
  readonly homepage?: string;
  readonly platforms?: NodeJS.Platform[];
  /** uv comes with the Python runtime. */
  readonly dependsOn = ["python"];
  readonly versionRange: string;

  readonly toolSpec: string;
  readonly python: string;
  readonly verifyBinary: string;

  constructor(opts: UvToolRuntimePackageOptions) {
    this.id = opts.id;
    this.name = opts.name;
    this.description = opts.description;
    this.category = opts.category;
    this.versionRange = opts.versionRange;
    this.toolSpec = opts.toolSpec;
    this.python = opts.python;
    this.verifyBinary = opts.verifyBinary;
    this.approxSizeMB = opts.approxSizeMB;
    this.homepage = opts.homepage;
    this.platforms = opts.platforms;
  }

  /** The tool's name in uv, the spec without a version constraint. */
  private get toolName(): string {
    return this.toolSpec.split(/[<>=!~;[\s]/, 1)[0];
  }

  private binaryPath(ctx: RuntimeContext): string {
    const exe = ctx.platform === "win32" ? `${this.verifyBinary}.exe` : this.verifyBinary;
    return path.join(uvToolDirs(ctx.userDataDir).bin, exe);
  }

  async status(ctx: RuntimeContext): Promise<RuntimeStatus> {
    return { installed: await fileExists(this.binaryPath(ctx)) };
  }

  private async uv(ctx: RuntimeContext, args: string[], signal?: AbortSignal): Promise<void> {
    const { getProcessEnv } = await import("../../config");
    await runUv(ctx, args, uvEnv(ctx, getProcessEnv()), signal, (line) =>
      ctx.log("info", `[${this.id}] ${line}`),
    );
  }

  private async *lifecycle(
    ctx: RuntimeContext,
    label: string,
    args: string[],
    signal: AbortSignal,
  ): AsyncIterable<RuntimeProgress> {
    yield { type: "stage", label };
    try {
      await this.uv(ctx, args, signal);
      if (!(await fileExists(this.binaryPath(ctx)))) {
        throw new Error(`uv finished but ${this.binaryPath(ctx)} is missing`);
      }
      yield { type: "done" };
    } catch (error) {
      yield { type: "error", message: error instanceof Error ? error.message : String(error) };
    }
  }

  install(ctx: RuntimeContext, signal: AbortSignal): AsyncIterable<RuntimeProgress> {
    return this.lifecycle(
      ctx,
      `Installing ${this.name} (Python ${this.python})`,
      ["tool", "install", "--force", "--python", this.python, this.toolSpec],
      signal,
    );
  }

  update(ctx: RuntimeContext, signal: AbortSignal): AsyncIterable<RuntimeProgress> {
    return this.lifecycle(ctx, `Updating ${this.name}`, ["tool", "upgrade", this.toolName], signal);
  }

  /** A reinstall rebuilds the tool's environment from scratch. */
  repair(ctx: RuntimeContext, signal: AbortSignal): AsyncIterable<RuntimeProgress> {
    return this.lifecycle(
      ctx,
      `Repairing ${this.name}`,
      ["tool", "install", "--force", "--reinstall", "--python", this.python, this.toolSpec],
      signal,
    );
  }

  async uninstall(ctx: RuntimeContext): Promise<void> {
    await this.uv(ctx, ["tool", "uninstall", this.toolName]);
  }

  async resolve(ctx: RuntimeContext): Promise<RuntimeResolution | null> {
    if (!(await fileExists(this.binaryPath(ctx)))) return null;
    return {
      binPaths: [uvToolDirs(ctx.userDataDir).bin],
      binaries: { [this.verifyBinary]: this.binaryPath(ctx) },
    };
  }
}
