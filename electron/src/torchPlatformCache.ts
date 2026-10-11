import { readSettings, updateSetting } from "./settings";
import { logMessage } from "./logger";
import {
  mapTorchPlatform,
  torchIndexUrl,
  type TorchBackend,
  type TorchruntimeDetectionResult,
} from "./torchruntime";

const TORCH_PLATFORM_SETTING_KEY = "TORCH_PLATFORM_DETECTED";

interface SavedTorchData {
  platform: string;
  error?: unknown;
  detectedAt?: string;
}

function isSavedTorchData(value: unknown): value is SavedTorchData {
  if (!value || typeof value !== "object") {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return typeof obj.platform === "string" && obj.platform.length > 0;
}

/**
 * The last successful GPU detection, or null when none is saved.
 *
 * Only the platform torchruntime reported is stored. The backend and index
 * are derived from it on every read, so a new mapping in a later app version
 * applies without a re-detection. An entry that recorded a failed detection
 * (older versions saved those as `cpu`) is ignored, so the next install
 * detects again.
 */
export function getSavedTorchPlatform(): TorchruntimeDetectionResult | null {
  try {
    const settings = readSettings();
    const saved = settings[TORCH_PLATFORM_SETTING_KEY];

    if (!isSavedTorchData(saved)) {
      if (saved) {
        logMessage("Invalid torch platform data in settings, ignoring", "warn");
      }
      return null;
    }

    if (saved.error) {
      logMessage("Saved torch platform came from a failed detection, ignoring", "warn");
      return null;
    }

    const { backend, warning } = mapTorchPlatform(saved.platform);
    const result: TorchruntimeDetectionResult = {
      platform: saved.platform,
      backend,
      indexUrl: torchIndexUrl(backend),
    };
    if (warning) {
      result.warning = warning;
    }
    if (saved.detectedAt) {
      result.detectedAt = saved.detectedAt;
    }
    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logMessage(`Failed to read saved torch platform: ${message}`, "warn");
    return null;
  }
}

/**
 * The `--torch-backend` for package installs: the saved detection's backend,
 * or null (default PyPI wheels) when nothing has been detected yet.
 */
export function getTorchBackend(): TorchBackend | null {
  return getSavedTorchPlatform()?.backend ?? null;
}

/** uv arguments that route torch packages to the detected PyTorch index. */
export function torchBackendArgs(backend: TorchBackend | null): string[] {
  return backend ? ["--torch-backend", backend] : [];
}

/**
 * Save a successful detection. A result that carries `error` is not saved:
 * persisting a failed detection pinned CPU torch for good.
 */
export function saveTorchPlatform(result: TorchruntimeDetectionResult): void {
  if (result.error) {
    logMessage(`Not saving failed torch platform detection: ${result.error}`, "warn");
    return;
  }
  try {
    updateSetting(TORCH_PLATFORM_SETTING_KEY, {
      platform: result.platform,
      detectedAt: new Date().toISOString(),
    });
    logMessage(`Saved torch platform: ${result.platform}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logMessage(`Failed to save torch platform: ${message}`, "error");
  }
}
