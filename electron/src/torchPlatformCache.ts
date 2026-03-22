import { readSettings, updateSetting, readSettingsAsync } from "./settings";
import { logMessage } from "./logger";
import type { TorchruntimeDetectionResult } from "./torchruntime";

const TORCH_PLATFORM_SETTING_KEY = "TORCH_PLATFORM_DETECTED";

/**
 * Get the saved torch platform detection result from settings
 * Returns null if no detection result is saved
 */
export function getSavedTorchPlatform(): TorchruntimeDetectionResult | null {
  try {
    const settings = readSettings();
    const saved = settings[TORCH_PLATFORM_SETTING_KEY];
    
    if (!saved || typeof saved !== "object") {
      return null;
    }

    // Validate the saved data has required fields
    if (
      typeof saved.platform !== "string" ||
      (saved.indexUrl !== null && typeof saved.indexUrl !== "string")
    ) {
      logMessage("Invalid torch platform data in settings, ignoring", "warn");
      return null;
    }

    return {
      platform: saved.platform,
      indexUrl: saved.indexUrl,
      error: saved.error,
    };
  } catch (error: any) {
    logMessage(`Failed to read saved torch platform: ${error.message}`, "warn");
    return null;
  }
}

/**
 * Get the saved torch platform detection result from settings asynchronously
 * Returns null if no detection result is saved
 */
export async function getSavedTorchPlatformAsync(): Promise<TorchruntimeDetectionResult | null> {
  try {
    const settings = await readSettingsAsync();
    const saved = settings[TORCH_PLATFORM_SETTING_KEY];

    if (!saved || typeof saved !== "object") {
      return null;
    }

    // Validate the saved data has required fields
    if (
      typeof saved.platform !== "string" ||
      (saved.indexUrl !== null && typeof saved.indexUrl !== "string")
    ) {
      logMessage("Invalid torch platform data in settings, ignoring", "warn");
      return null;
    }

    return {
      platform: saved.platform,
      indexUrl: saved.indexUrl,
      error: saved.error,
    };
  } catch (error: any) {
    logMessage(`Failed to read saved torch platform: ${error.message}`, "warn");
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
 * Get torch index URL for package installation asynchronously
 * Uses saved detection result or falls back to default based on platform
 */
export async function getTorchIndexUrlAsync(): Promise<string | null> {
  const saved = await getSavedTorchPlatformAsync();

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
  } catch (error: any) {
    logMessage(`Failed to save torch platform: ${error.message}`, "error");
  }
}
