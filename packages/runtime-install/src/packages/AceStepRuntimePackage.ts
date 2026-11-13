import * as path from "node:path";

import {
  ACESTEP_COMMIT,
  ACESTEP_COMMIT_SHORT,
  aceServerPath,
  aceStepAsset,
  aceStepInstallStatus,
  installAceStep,
  uninstallAceStep,
  type AceStepInstallEvent,
} from "@nodetool-ai/config/acestep-runtime";
import type {
  RuntimeContext,
  RuntimePackage,
  RuntimeProgress,
  RuntimeResolution,
  RuntimeStatus,
} from "./types.js";

/** The install directory, the one `runtimeLocations().aceStep` names for the backend. */
function installDir(ctx: RuntimeContext): string {
  return path.join(ctx.userDataDir, "acestep");
}

/**
 * The acestep.cpp `ace-server` build NodeTool signs and hosts. The ACE-Step
 * provider starts it on demand. The archive exists for macOS on Apple silicon
 * only, so other platforms report no install target and an install fails with
 * a message that says so. The models download separately
 * (`downloadAceStepModels` in `@nodetool-ai/websocket`).
 */
export class AceStepRuntimePackage implements RuntimePackage {
  readonly id = "acestep";
  readonly name = "ACE-Step (ace-server)";
  readonly description =
    "Local music generation server (ace-server) for the ACE-Step provider. Runs text-to-music, repaint and lego with Metal on macOS with Apple silicon. The models download separately on first use.";
  readonly category = "tool" as const;
  readonly versionRange = ACESTEP_COMMIT_SHORT;
  readonly homepage = "https://github.com/ServeurpersoCom/acestep.cpp";
  readonly platforms: NodeJS.Platform[] = ["darwin"];
  readonly approxSizeMB: number;

  constructor() {
    const asset = aceStepAsset(process.platform, process.arch);
    this.approxSizeMB = asset ? Math.ceil((asset.sizeBytes * 2.6) / 1e6) : 0;
  }

  async status(ctx: RuntimeContext): Promise<RuntimeStatus> {
    const status = await aceStepInstallStatus(installDir(ctx));
    return {
      installed: status.installed,
      installedVersion: status.version,
      latestVersion: ACESTEP_COMMIT,
      updateAvailable: status.installed && status.version !== ACESTEP_COMMIT,
    };
  }

  private async *run(ctx: RuntimeContext, signal: AbortSignal): AsyncIterable<RuntimeProgress> {
    const events: AceStepInstallEvent[] = [];
    let wake: (() => void) | null = null;
    let finished = false;
    let failure: unknown = null;
    const work = installAceStep({
      installDir: installDir(ctx),
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
        if (event.type === "stage") ctx.log("info", `[acestep] ${event.label}`);
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
    await uninstallAceStep(installDir(ctx));
  }

  async resolve(ctx: RuntimeContext): Promise<RuntimeResolution | null> {
    const status = await aceStepInstallStatus(installDir(ctx));
    if (!status.installed) return null;
    return { binaries: { "ace-server": aceServerPath(installDir(ctx)) } };
  }
}
