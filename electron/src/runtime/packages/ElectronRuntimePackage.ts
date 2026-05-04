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

export interface ElectronRuntimePackageOptions {
  id: string;
  name: string;
  description: string;
  category: RuntimeCategory;
  versionRange: string;
  /**
   * Logical-name → resolver returning the absolute path of the bundled binary,
   * or undefined if not available on this platform.
   */
  binaries?: Record<string, (ctx: RuntimeContext) => string | undefined>;
  approxSizeMB?: number;
  homepage?: string;
  platforms?: NodeJS.Platform[];
}

/**
 * A runtime package provided by Electron itself (Node.js, etc).
 *
 * `install()` is a no-op (yields `done` immediately), `uninstall()` is a
 * no-op, `status()` is always installed.
 */
export class ElectronRuntimePackage implements RuntimePackage {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: RuntimeCategory;
  readonly approxSizeMB?: number;
  readonly homepage?: string;
  readonly platforms?: NodeJS.Platform[];
  readonly versionRange: string;

  private readonly binaryResolvers: Record<string, (ctx: RuntimeContext) => string | undefined>;

  constructor(opts: ElectronRuntimePackageOptions) {
    this.id = opts.id;
    this.name = opts.name;
    this.description = opts.description;
    this.category = opts.category;
    this.versionRange = opts.versionRange;
    this.binaryResolvers = opts.binaries ?? {};
    this.approxSizeMB = opts.approxSizeMB;
    this.homepage = opts.homepage;
    this.platforms = opts.platforms;
  }

  async status(_ctx: RuntimeContext): Promise<RuntimeStatus> {
    return { installed: true };
  }

  async *install(_ctx: RuntimeContext, _signal: AbortSignal): AsyncIterable<RuntimeProgress> {
    yield { type: "done" };
  }

  async *update(_ctx: RuntimeContext, _signal: AbortSignal): AsyncIterable<RuntimeProgress> {
    yield { type: "done" };
  }

  async *repair(_ctx: RuntimeContext, _signal: AbortSignal): AsyncIterable<RuntimeProgress> {
    yield { type: "done" };
  }

  async uninstall(_ctx: RuntimeContext): Promise<void> {
    // No-op — the runtime is bundled with Electron.
  }

  async resolve(ctx: RuntimeContext): Promise<RuntimeResolution | null> {
    const binaries: Record<string, string> = {};
    const binPaths = new Set<string>();
    for (const [logical, fn] of Object.entries(this.binaryResolvers)) {
      const absolute = fn(ctx);
      if (absolute && (await fileExists(absolute))) {
        binaries[logical] = absolute;
        binPaths.add(path.dirname(absolute));
      }
    }
    return {
      binaries: Object.keys(binaries).length > 0 ? binaries : undefined,
      binPaths: binPaths.size > 0 ? Array.from(binPaths) : undefined,
    };
  }
}
