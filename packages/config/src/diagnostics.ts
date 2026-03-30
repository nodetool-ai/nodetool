/**
 * Environment diagnostics — T-CFG-4.
 *
 * Enumerates registered settings and reports their status with
 * masked values for secrets.
 */

import { getSettings, type SettingStatus } from "./settings.js";

export interface DiagnosticResult {
  key: string;
  group: string;
  isSet: boolean;
  isSecret: boolean;
  maskedValue: string | null; // null if not set
  description: string;
}

/**
 * Mask a secret value: show first 4 + last 4 chars with `***` in between.
 * For short values (<=8 chars), mask entirely as `***`.
 */
export function maskSecret(value: string): string {
  if (value.length <= 8) {
    return "***";
  }
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

/**
 * Diagnose the current environment by checking all registered settings.
 *
 * @param settings Optional override — defaults to `getSettings()`.
 */
export function diagnoseEnvironment(settings?: SettingStatus[]): DiagnosticResult[] {
  const resolved = settings ?? getSettings();

  return resolved.map((setting) => {
    const envValue = process.env[setting.envVar];
    const isSet = !!envValue;

    let maskedValue: string | null = null;
    if (isSet && envValue) {
      maskedValue = setting.isSecret ? maskSecret(envValue) : envValue;
    }

    return {
      key: setting.envVar,
      group: setting.group,
      isSet,
      isSecret: setting.isSecret,
      maskedValue,
      description: setting.description,
    };
  });
}
