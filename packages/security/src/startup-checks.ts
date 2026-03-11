/**
 * Startup checks — T-SEC-8.
 *
 * Validates that the system is properly configured before accepting requests.
 */
import { getMasterKey } from "./master-key.js";

export interface StartupCheckResult {
  errors: string[];
  warnings: string[];
}

/** Well-known optional API keys that should be configured for full functionality. */
const OPTIONAL_API_KEYS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "REPLICATE_API_TOKEN",
  "HF_TOKEN",
  "ELEVENLABS_API_KEY",
  "FAL_API_KEY",
];

/**
 * Run startup health checks.
 *
 * - Checks that the master encryption key is loadable.
 * - Warns about missing optional API keys.
 */
export async function runStartupChecks(): Promise<StartupCheckResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check master key
  try {
    const key = getMasterKey();
    if (!key) {
      errors.push("Master encryption key could not be loaded");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Master key initialization failed: ${msg}`);
  }

  // Check optional API keys
  for (const envVar of OPTIONAL_API_KEYS) {
    if (!process.env[envVar]) {
      warnings.push(`${envVar} is not set — related features will be unavailable`);
    }
  }

  return { errors, warnings };
}
