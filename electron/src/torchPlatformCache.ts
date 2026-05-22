import { readSettings, updateSetting } from "./settings";
import { logMessage } from "./logger";
import type { TorchruntimeDetectionResult, TorchPlatform } from "./torchruntime";

const TORCH_PLATFORM_SETTING_KEY = "TORCH_PLATFORM_DETECTED";

const VALID_TORCH_PLATFORMS: ReadonlySet<string> = new Set([
  "cu118", "cu124", "cu128", "cu129",
  "rocm5.2", "rocm5.7", "rocm6.2", "rocm6.4",
  "mps", "cpu"
]);

function isTorchPlatform(value: string): value is TorchPlatform {
  return VALID_TORCH_PLATFORMS.has(value);
}

interface SavedTorchData {
  platform: string;
  indexUrl: string | null;
  error?: string;
  detectedAt?: string;
}

function isSavedTorchData(value: unknown): value is SavedTorchData {
  if (!value || typeof value !== "object") {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.platform === "string" &&
    (obj.indexUrl === null || typeof obj.indexUrl === "string")
  );
}

/**
 * Get the saved torch platform detection result from settings
 * Returns null if no detection result is saved
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

    if (!isTorchPlatform(saved.platform)) {
      logMessage(`Unknown torch platform "${saved.platform}" in settings, ignoring`, "warn");
      return null;
    }

    return {
      platform: saved.platform,
      indexUrl: saved.indexUrl,
      error: saved.error,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logMessage(`Failed to read saved torch platform: ${message}`, "warn");
    return null;
  }
}

/**
 * Get torch index URL for package installation
 * Uses saved detection result or falls back to default based on platform
 */
export function getTorchIndexUrl(): string | null {
  const saved = getSavedTorchPlatform();
  
  if (saved && saved.indexUrl) {
    logMessage(`Using saved torch index URL: ${saved.indexUrl}`);
    return saved.indexUrl;
  }

  // Fallback to CPU for consistent behavior across all platforms
  logMessage("No saved torch platform, falling back to CPU");
  return "https://download.pytorch.org/whl/cpu";
}

/**
 * Save torch platform detection result to settings
 */
export function saveTorchPlatform(result: TorchruntimeDetectionResult): void {
  try {
    updateSetting(TORCH_PLATFORM_SETTING_KEY, {
      platform: result.platform,
      indexUrl: result.indexUrl,
      detectedAt: new Date().toISOString(),
      error: result.error,
    });
    logMessage(`Saved torch platform: ${result.platform}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logMessage(`Failed to save torch platform: ${message}`, "error");
  }
}
