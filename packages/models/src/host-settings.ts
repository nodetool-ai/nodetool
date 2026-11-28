/**
 * The cloud profile's host-setting boundary, shared by every writer and reader
 * of user settings: the tRPC settings router, the secrets router and the
 * agent `settings` capability.
 *
 * The groups in `CLOUD_HIDDEN_SETTING_GROUPS` configure the machine the server
 * runs on. On the cloud profile the operator sets them in the environment, so
 * they are neither listed to users nor stored for them, and a listed value
 * never falls back to the server's environment.
 */

import {
  isCloudProfileEnv,
  settingCatalog,
  settingDefinition,
  type SettingCatalogEntry
} from "@nodetool-ai/config";
import { isCloudSettingGroup } from "@nodetool-ai/protocol";

/**
 * The catalog entries users may see and change on this server: every entry
 * off the cloud profile, and the non-host groups on it.
 */
export function userSettingCatalog(
  env: Record<string, string | undefined> = process.env
): SettingCatalogEntry[] {
  if (!isCloudProfileEnv(env)) return settingCatalog();
  return settingCatalog().filter((def) => isCloudSettingGroup(def.group));
}

/**
 * The keys in `keys` that configure the server host and so cannot be stored
 * for a user on this server. Empty off the cloud profile. A key the catalog
 * does not declare is a user's own and is never refused here.
 */
export function refusedHostSettingKeys(
  keys: Iterable<string>,
  env: Record<string, string | undefined> = process.env
): string[] {
  if (!isCloudProfileEnv(env)) return [];
  const refused: string[] = [];
  for (const key of keys) {
    const def = settingDefinition(key);
    if (def !== undefined && !isCloudSettingGroup(def.group)) {
      refused.push(key);
    }
  }
  return refused;
}

/** The message every writer returns for {@link refusedHostSettingKeys}. */
export function hostSettingsRefusalMessage(keys: readonly string[]): string {
  return (
    "These settings configure the server host and cannot be changed on this " +
    `deployment: ${keys.join(", ")}`
  );
}

