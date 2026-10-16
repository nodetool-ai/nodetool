import * as path from "path";
import {
  SD_CPP_RELEASE_TAG,
  installSdCpp,
  sdCppAsset,
  sdCppInstallStatus,
  sdServerPath,
  uninstallSdCpp,
  type SdCppInstallEvent,
} from "@nodetool-ai/config/sd-cpp-runtime";
import type {
  RuntimeContext,
  RuntimePackage,
  RuntimeProgress,
  RuntimeResolution,
  RuntimeStatus,
} from "./types";

/** The install directory, the one `runtimeLocations().sdCpp` names for the backend. */
function installDir(ctx: RuntimeContext): string {
  return path.join(ctx.userDataDir, "sd-cpp");
}

/**
 * The stable-diffusion.cpp `sd-server` release. The Stable Diffusion
 * provider starts it on demand with the model a generation asks for.
 */
export class SdCppRuntimePackage implements RuntimePackage {
  readonly id = "sd-cpp";
  readonly name = "stable-diffusion.cpp";
  readonly description =
    "Local image generation server (sd-server) for the stable-diffusion.cpp provider. Runs SD 1.5, SD-Turbo, SD 3.5 and FLUX GGUF models for text-to-image and image-to-image. Uses Metal on macOS and Vulkan on Windows and Linux.";
  readonly category = "tool" as const;
  readonly versionRange = SD_CPP_RELEASE_TAG;
  readonly homepage = "https://github.com/leejet/stable-diffusion.cpp";
  readonly platforms: NodeJS.Platform[] = ["darwin", "linux", "win32"];
  readonly approxSizeMB: number;

  constructor() {
    const asset = sdCppAsset(process.platform, process.arch);
    this.approxSizeMB = asset ? Math.ceil((asset.sizeBytes * 2.6) / 1e6) : 0;
  }

  async status(ctx: RuntimeContext): Promise<RuntimeStatus> {
    const status = await sdCppInstallStatus(installDir(ctx), ctx.platform);
    return {
      installed: status.installed,
      installedVersion: status.version,
      latestVersion: SD_CPP_RELEASE_TAG,
      updateAvailable: status.installed && status.version !== SD_CPP_RELEASE_TAG,
    };
  }

  private async *run(ctx: RuntimeContext, signal: AbortSignal): AsyncIterable<RuntimeProgress> {
    const events: SdCppInstallEvent[] = [];
    let wake: (() => void) | null = null;
    let finished = false;
    let failure: unknown = null;
    const work = installSdCpp({
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
        if (event.type === "stage") ctx.log("info", `[sd-cpp] ${event.label}`);
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
    await uninstallSdCpp(installDir(ctx));
  }

  async resolve(ctx: RuntimeContext): Promise<RuntimeResolution | null> {
    const status = await sdCppInstallStatus(installDir(ctx), ctx.platform);
    if (!status.installed) return null;
    return { binaries: { "sd-server": sdServerPath(installDir(ctx), ctx.platform) } };
  }
}
