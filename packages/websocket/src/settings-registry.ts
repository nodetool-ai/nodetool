/**
 * Reading a setting's value — the half of settings handling that needs the
 * database.
 *
 * The *definitions* live in `@nodetool-ai/config` (`setting-catalog.ts`) so the
 * `settings` capability module can read the same table without importing the
 * server. Callers that need the definitions call `settingCatalog()` there.
 */

import { Setting } from "@nodetool-ai/models";

export interface SettingWithValue {
  package_name: string;
  env_var: string;
  group: string;
  description: string;
  enum: string[] | null;
  value: unknown;
  is_secret: boolean;
}

/** Get a single setting value from DB, then env var. */
export async function getSetting(key: string): Promise<string | null> {
  const setting = await Setting.find("1", key);
  if (setting && setting.value.length > 0) return setting.value;
  const envVal = process.env[key];
  if (envVal !== undefined && envVal.length > 0) return envVal;
  return null;
}
