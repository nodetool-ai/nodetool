/**
 * Which settings a user may supply on this server, and which come only from
 * the operator.
 *
 * A desktop or self-hosted single-user install belongs to the person using it,
 * so a program path saved in their settings is theirs to choose. A shared
 * server (auth enforced, or the cloud profile) runs every user's requests as
 * the same host process, so a program it starts is the operator's to name:
 * there an `executable` setting is read only from the server's environment.
 */

import { isAuthEnforced } from "./deployment.js";
import { safeProcessEnv } from "./node-import.js";
import { isCloudProfileEnv } from "./server-credentials.js";
import { settingDefinition } from "./setting-catalog.js";

/**
 * True when the server is shared between users: a remote identity provider is
 * configured, or the cloud profile is active.
 */
export function isSharedServer(
  env: Record<string, string | undefined> = safeProcessEnv()
): boolean {
  return isAuthEnforced(env) || isCloudProfileEnv(env);
}

/**
 * True when `key` names a program the host starts and this server is shared,
 * so its value comes from the environment and never from a user's saved
 * settings or secrets.
 */
export function isServerEnvOnlySetting(
  key: string,
  env: Record<string, string | undefined> = safeProcessEnv()
): boolean {
  return (
    settingDefinition(key)?.hostPath === "executable" && isSharedServer(env)
  );
}
