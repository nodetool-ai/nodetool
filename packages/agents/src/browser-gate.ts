/**
 * Availability gate for the `browser_*` capabilities.
 *
 * Driving a browser is a single-tenant capability wearing a multi-tenant
 * server's clothes. The session is a process singleton — one page, shared by
 * every caller in the process — so on a managed server two tenants' agents
 * drive the same tab, and whatever the first one signed into is what the
 * second one's `browser_view` reads. The extension transport is worse still:
 * `/ws/extension` is unauthenticated and single-connection, so one user's
 * Chrome would be reachable by anybody's run.
 *
 * Neither is a defect to fix behind a flag; both are what the surface is for.
 * It belongs on a machine its user owns — a desktop app, a local server, a
 * self-hosted install — so under the cloud profile the capabilities are left
 * off every belt and refuse when reached by name.
 *
 * Same switch that prunes the node catalog: `NODETOOL_NODE_PROFILE=cloud`, or
 * `NODETOOL_ENV=production` with the profile unset. The node catalog already
 * agrees — `lib.browser` is not in `CLOUD_NODE_NAMESPACES`, so the Screenshot
 * node is gone from the cloud product too. A self-hosted install of the same
 * image sets `NODETOOL_NODE_PROFILE=full` and keeps both, as does every local
 * install.
 */

import {
  CLOUD_PROFILE_ENV,
  NODE_ENV_VAR,
  isCloudProfileActive
} from "@nodetool-ai/protocol";

/** Whether the `browser_*` capabilities should be offered on this deployment. */
export function isBrowserEnabled(): boolean {
  return !isCloudProfileActive(
    process.env[CLOUD_PROFILE_ENV],
    process.env[NODE_ENV_VAR]
  );
}

/** What a `browser_*` capability answers where this deployment offers none. */
export const BROWSER_DISABLED_ERROR =
  "Browser control is not available on this deployment. It drives one shared " +
  "browser session per server process, so it is offered only where the " +
  "machine belongs to its user — the desktop app, a local server, or a " +
  "self-hosted install.";
