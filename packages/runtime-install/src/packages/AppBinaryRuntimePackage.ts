import * as path from "node:path";

import {
  BLENDER_SERIES,
  appBinaryInstallStatus,
  appBinaryPath,
  appBinarySupported,
  installAppBinary,
  uninstallAppBinary,
  type AppBinaryId,
  type AppBinaryInstallEvent,
} from "@nodetool-ai/config/app-binary-runtime";
import type {
  RuntimeContext,
  RuntimePackage,
  RuntimeProgress,
  RuntimeResolution,
  RuntimeStatus,
} from "./types.js";

const DETAILS: Record<AppBinaryId, {
  name: string;
  description: string;
  versionRange: string;
  approxSizeMB: number;
  homepage: string;
}> = {
  blender: {
    name: "Blender",
    description:
      `Blender ${BLENDER_SERIES} for the Blender nodes and the Bake with Blender action on 3D timeline clips. Installs the newest ${BLENDER_SERIES} release, checked against the SHA-256 digest Blender publishes.`,
    versionRange: `${BLENDER_SERIES}.x`,
    approxSizeMB: 1100,
    homepage: "https://www.blender.org",
  },
  chrome: {
    name: "Chrome (headless renders)",
    description:
      "Chrome for Testing, the Chrome build Google publishes for automation. Renders 3D models and blockout reference videos headlessly when no Chrome is installed.",
    versionRange: "stable",
    approxSizeMB: 400,
    homepage: "https://googlechromelabs.github.io/chrome-for-testing/",
  },
};

/** The install directory, the one `runtimeLocations()` names for the backend. */
function installDir(id: AppBinaryId, ctx: RuntimeContext): string {
  return path.join(ctx.userDataDir, id);
}

/**
 * An application NodeTool drives as a separate process (Blender, Chrome),
 * downloaded from its publisher and unpacked into the runtime root.
 */
export class AppBinaryRuntimePackage implements RuntimePackage {
  readonly name: string;
  readonly description: string;
  readonly category = "tool" as const;
  readonly versionRange: string;
  readonly approxSizeMB: number;
  readonly homepage: string;
  readonly platforms: NodeJS.Platform[];

  constructor(readonly id: AppBinaryId) {
    const details = DETAILS[id];
    this.name = details.name;
    this.description = details.description;
    this.versionRange = details.versionRange;
    this.approxSizeMB = details.approxSizeMB;
    this.homepage = details.homepage;
    // Linux on ARM has neither publisher's build; the installer says so.
    this.platforms = appBinarySupported(id, process.platform, process.arch)
      ? ["darwin", "linux", "win32"]
      : ["darwin", "win32"];
  }

  async status(ctx: RuntimeContext): Promise<RuntimeStatus> {
    const status = await appBinaryInstallStatus(this.id, installDir(this.id, ctx), ctx.platform);
    return { installed: status.installed, installedVersion: status.version };
  }

  private async *run(ctx: RuntimeContext, signal: AbortSignal): AsyncIterable<RuntimeProgress> {
    const events: AppBinaryInstallEvent[] = [];
    let wake: (() => void) | null = null;
    let finished = false;
    let failure: unknown = null;
    const work = installAppBinary(this.id, {
      installDir: installDir(this.id, ctx),
      platform: ctx.platform,
      arch: ctx.arch,
      signal,
      onEvent: (event) => {
        events.push(event);
        wake?.();
      },
    })
      .catch((error: unknown) => {
        failure = error;
      })
      .finally(() => {
        finished = true;
        wake?.();
      });
    while (!finished || events.length > 0) {
      const event = events.shift();
      if (event) {
        if (event.type === "stage") ctx.log("info", `[${this.id}] ${event.label}`);
        yield event;
        continue;
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
      wake = null;
    }
    await work;
    if (failure) {
      yield { type: "error", message: failure instanceof Error ? failure.message : String(failure) };
      return;
    }
    yield { type: "done" };
  }

  install(ctx: RuntimeContext, signal: AbortSignal): AsyncIterable<RuntimeProgress> {
    return this.run(ctx, signal);
  }

  update(ctx: RuntimeContext, signal: AbortSignal): AsyncIterable<RuntimeProgress> {
    return this.run(ctx, signal);
  }

  repair(ctx: RuntimeContext, signal: AbortSignal): AsyncIterable<RuntimeProgress> {
    return this.run(ctx, signal);
  }

  async uninstall(ctx: RuntimeContext): Promise<void> {
    await uninstallAppBinary(installDir(this.id, ctx));
  }

  async resolve(ctx: RuntimeContext): Promise<RuntimeResolution | null> {
    const dir = installDir(this.id, ctx);
    const status = await appBinaryInstallStatus(this.id, dir, ctx.platform);
    if (!status.installed) return null;
    return { binaries: { [this.id]: appBinaryPath(this.id, dir, ctx.platform) } };
  }
}
