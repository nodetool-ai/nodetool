/**
 * Whether this server runs the commercial cloud profile.
 *
 * The one env read for the server's cloud gates, so they agree with the node
 * catalog and the provider list: `NODETOOL_NODE_PROFILE=cloud`, or
 * `NODETOOL_ENV=production` with the profile unset. A self-hosted install sets
 * `NODETOOL_NODE_PROFILE=full` and keeps every local surface.
 */

import {
  CLOUD_PROFILE_ENV,
  NODE_ENV_VAR,
  isCloudProfileActive
} from "@nodetool-ai/protocol";

export function isCloudProfile(
  env: Record<string, string | undefined> = process.env
): boolean {
  return isCloudProfileActive(env[CLOUD_PROFILE_ENV], env[NODE_ENV_VAR]);
}
