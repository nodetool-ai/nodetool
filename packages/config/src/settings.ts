/**
 * Settings registry — T-CFG-2.
 *
 * Registers configuration settings and reports their configured status.
 */

export interface SettingDefinition {
  package: string;
  envVar: string;
  group: string;
  description: string;
  isSecret: boolean;
}

export interface SettingStatus extends SettingDefinition {
  configured: boolean;
}

const registry = new Map<string, SettingDefinition>();

/**
 * Register a configuration setting.
 */
export function registerSetting(definition: SettingDefinition): void {
  registry.set(definition.envVar, definition);
}

/**
 * Get all registered settings with their configured status.
 * A setting is configured if its env var has a non-empty value.
 */
export function getSettings(): SettingStatus[] {
  return Array.from(registry.values()).map((def) => ({
    ...def,
    configured: !!process.env[def.envVar],
  }));
}

/**
 * Clear all registered settings (for testing).
 */
export function clearSettings(): void {
  registry.clear();
}
