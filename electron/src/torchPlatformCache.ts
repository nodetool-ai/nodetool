import { readSettings } from "./settings";
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
      (saved.indexUrl !== null && typeof saved.indexUrl !== "string") ||
      typeof saved.requiresDirectML !== "boolean"
    ) {
      logMessage("Invalid torch platform data in settings, ignoring", "warn");
      return null;
    }

    return {
      platform: saved.platform,
      indexUrl: saved.indexUrl,
      requiresDirectML: saved.requiresDirectML,
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

  // Fallback to CUDA for non-macOS platforms for backward compatibility
  if (process.platform !== "darwin") {
    logMessage("No saved torch platform, falling back to CUDA 12.6");
    return "https://download.pytorch.org/whl/cu126";
  }

  // macOS uses default PyPI
  return null;
}
