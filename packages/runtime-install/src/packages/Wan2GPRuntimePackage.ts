import * as path from "node:path";

import {
  WAN2GP_VERSION,
  installWan2GP,
  uninstallWan2GP,
  wan2gpInstallStatus,
  type Wan2GPInstallEvent,
} from "@nodetool-ai/config/wan2gp-runtime";
import { condaPythonPath, condaUvPath } from "../paths.js";
import type {
  RuntimeContext,
  RuntimePackage,
  RuntimeProgress,
  RuntimeResolution,
  RuntimeStatus,
} from "./types.js";

/** The install directory, the one `runtimeLocations().wan2gp` names for the backend. */
function installDir(ctx: RuntimeContext): string {
  return path.join(ctx.userDataDir, "wan2gp");
}

/**
 * Wan2GP, the video, image and audio generation app. Its own unattended
 * installer picks the Python, PyTorch and kernels for the GPU it finds and
 * builds a separate environment. The Wan2GP provider and nodes start its
 * server on demand.
 */
export class Wan2GPRuntimePackage implements RuntimePackage {
  readonly id = "wan2gp";
  readonly name = "Wan2GP";
  readonly description =
    "Local video, image and audio generation with Wan, LTX-2, MiniMax H3, Flux, Qwen and many more models, for the Wan2GP provider and nodes. Needs an NVIDIA or AMD GPU on Windows or Linux, or Apple Silicon. Downloads its own Python environment with PyTorch; model weights download the first time a model runs. WanGP Community License 2.0: free to use, not to resell.";
  readonly category = "tool" as const;
  readonly versionRange = WAN2GP_VERSION;
  readonly homepage = "https://github.com/deepbeepmeep/Wan2GP";
  readonly platforms: NodeJS.Platform[] = ["linux", "win32", "darwin"];
  readonly dependsOn = ["python"];
  /** PyTorch, the attention kernels and Wan2GP's requirements, before any model. */
  readonly approxSizeMB = 12000;

  async status(ctx: RuntimeContext): Promise<RuntimeStatus> {
    const status = await wan2gpInstallStatus(installDir(ctx), ctx.platform);
    return {
      installed: status.installed,
      installedVersion: status.version,
      latestVersion: WAN2GP_VERSION,
      updateAvailable: status.installed && status.version !== WAN2GP_VERSION,
    };
  }

  private async *run(ctx: RuntimeContext, signal: AbortSignal): AsyncIterable<RuntimeProgress> {
    const events: Wan2GPInstallEvent[] = [];
    let wake: (() => void) | null = null;
    let finished = false;
    let failure: unknown = null;
    const work = installWan2GP({
      installDir: installDir(ctx),
      platform: ctx.platform,
      // The Python runtime's interpreter and uv run Wan2GP's installer.
      python: condaPythonPath(ctx.condaEnvPath, ctx.platform),
      uv: condaUvPath(ctx.condaEnvPath, ctx.platform),
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
        if (event.type === "stage") ctx.log("info", `[wan2gp] ${event.label}`);
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
    await uninstallWan2GP(installDir(ctx));
  }

  async resolve(ctx: RuntimeContext): Promise<RuntimeResolution | null> {
    const status = await wan2gpInstallStatus(installDir(ctx), ctx.platform);
    if (!status.installed || !status.python) return null;
    return { binaries: { "wan2gp-python": status.python } };
  }
}
