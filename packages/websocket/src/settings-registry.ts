/**
 * Settings registry — shared between the tRPC settings router,
 * http-api.ts (for /api/settings/secrets handlers), and websocket-client-session.ts
 * (for getSetting()).
 *
 * The *definitions* live in `@nodetool-ai/config` (`setting-catalog.ts`) so the
 * `settings` capability module can read the same table without importing the
 * server. What stays here is the half that needs the database: resolving one
 * setting's value.
 */

import { Setting } from "@nodetool-ai/models";
import {
  registerSettingDefinition,
  settingCatalog,
  type SettingCatalogEntry
} from "@nodetool-ai/config";

export interface SettingWithValue {
  package_name: string;
  env_var: string;
  group: string;
  description: string;
  enum: string[] | null;
  value: unknown;
  is_secret: boolean;
}

export type SettingDefinition = SettingCatalogEntry;

/** Register a setting definition. Called by packages at startup. */
export const registerSetting = registerSettingDefinition;

/** Get all registered definitions. */
export function getRegisteredSettings(): SettingDefinition[] {
  return settingCatalog();
}

/** Get a single setting value from DB, then env var. */
export async function getSetting(key: string): Promise<string | null> {
  const setting = await Setting.find("1", key);
  if (setting && setting.value.length > 0) return setting.value;
  const envVal = process.env[key];
  if (envVal !== undefined && envVal.length > 0) return envVal;
  return null;
}
