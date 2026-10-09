import { importOptionalModule } from "@nodetool-ai/config";
import { MissingRuntimePackageError } from "@nodetool-ai/protocol";

export type LibVariant = "default" | "vulkan" | "cuda";
export interface Segment {
  text: string;
  t0: number;
  t1: number;
}
export interface TranscribeOptions {
  language?: string;
  translate?: boolean;
  maxThreads?: number;
  tokenTimestamps?: boolean;
  temperature?: number;
  beamSize?: number;
  prompt?: string;
  onProgress?: (progress: number) => void;
  onNewSegments?: (result: { result: string; segments: Segment[] }) => void;
}
export interface TranscribeResult {
  language?: string;
  result: string;
  segments: Segment[];
  isAborted: boolean;
}
export interface WhisperContext {
  transcribeData(
    audio: ArrayBuffer,
    options?: TranscribeOptions
  ): {
    stop: () => Promise<void>;
    promise: Promise<TranscribeResult>;
  };
  release(): Promise<void>;
}
export interface WhisperVadContext {
  detectSpeechData(
    audio: ArrayBuffer,
    options?: {
      threshold?: number;
      minSpeechDurationMs?: number;
      minSilenceDurationMs?: number;
    }
  ): Promise<{ t0: number; t1: number }[]>;
  release(): Promise<void>;
}
export interface WhisperNodeModule {
  initWhisper(
    options: { filePath: string; useGpu?: boolean; useFlashAttn?: boolean },
    variant?: LibVariant
  ): Promise<WhisperContext>;
  initWhisperVad(
    options: { filePath: string; useGpu?: boolean; nThreads?: number },
    variant?: LibVariant
  ): Promise<WhisperVadContext>;
}
export const INSTALL_MESSAGE =
  "The local whisper.cpp provider requires the optional '@fugood/whisper.node' package, which is not installed. Install it from the Package Manager.";
let modulePromise: Promise<WhisperNodeModule> | undefined;
export function loadWhisperNode(): Promise<WhisperNodeModule> {
  modulePromise ??= importOptionalModule<WhisperNodeModule>(
    "@fugood/whisper.node",
    { commonJs: true }
  ).catch((cause: unknown) => {
    modulePromise = undefined;
    throw new MissingRuntimePackageError(INSTALL_MESSAGE, "whisper-cpp", {
      cause
    });
  });
  return modulePromise;
}
/**
 * The whisper.node build to load for a WHISPER_CPP_GPU_BACKEND setting.
 *
 * `cuda` and `vulkan` select that build. `metal` and `cpu` use the default
 * build (Metal on macOS). `auto` (or unset) on Windows and Linux probes the
 * CUDA build, then the Vulkan build, like node-llama-cpp's `auto`: a build
 * whose native library cannot load (no NVIDIA driver, no Vulkan loader) is
 * skipped, and the default CPU build is the last resort. On macOS `auto` is
 * the default build.
 */
export async function resolveVariant(
  setting: string | undefined
): Promise<LibVariant> {
  if (setting === "cuda" || setting === "vulkan") {
    return setting;
  }
  if ((setting === undefined || setting === "" || setting === "auto") && process.platform !== "darwin") {
    autoVariant ??= probeGpuVariant();
    return autoVariant;
  }
  return "default";
}

let autoVariant: Promise<LibVariant> | undefined;

/** First GPU build of whisper.node that loads on this machine, else `default`. */
async function probeGpuVariant(): Promise<LibVariant> {
  for (const variant of ["cuda", "vulkan"] as const) {
    try {
      await importOptionalModule(
        `@fugood/node-whisper-${process.platform}-${process.arch}-${variant}`,
        { commonJs: true }
      );
      return variant;
    } catch {
      // Not installed for this platform, or its native library cannot load.
    }
  }
  return "default";
}
