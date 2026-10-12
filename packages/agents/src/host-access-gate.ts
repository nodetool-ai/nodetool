/**
 * Availability gate for the escape hatches that reach the server machine past
 * a run's own workspace.
 *
 * - The sandbox's `filesystemAccess: "host"` and `allowPrivateNetwork` limits,
 *   which the Code node exposes as its "Allow Host Filesystem" and "Allow
 *   Local Network" properties. Whoever authors the graph sets them, so on a
 *   managed server any tenant could read the container's disk or reach its
 *   internal network.
 * - `convert_document`'s `extra_args`, passed to pandoc verbatim. Flags such
 *   as `--filter`, `--lua-filter` and `--pdf-engine` run programs, and
 *   `--include-in-header` reads any file the process can.
 * - `take_screenshot` without an operator `BROWSER_URL`, which launches a
 *   headless Chrome on the server and only checks the first URL, not where it
 *   redirects.
 *
 * Same switch that prunes the node catalog: `NODETOOL_NODE_PROFILE=cloud`, or
 * `NODETOOL_ENV=production` with the profile unset. Under it the sandbox
 * limits fall back to the workspace and the SSRF guard, and the other two
 * refuse. A self-hosted install sets `NODETOOL_NODE_PROFILE=full` and keeps
 * all three, as does every local install.
 */

import {
  CLOUD_PROFILE_ENV,
  NODE_ENV_VAR,
  isCloudProfileActive
} from "@nodetool-ai/protocol";

/** Whether this deployment lets a run reach the server past its workspace. */
export function isHostAccessEnabled(): boolean {
  if (typeof process === "undefined") return true;
  return !isCloudProfileActive(
    process.env[CLOUD_PROFILE_ENV],
    process.env[NODE_ENV_VAR]
  );
}

/** What `convert_document` answers for `extra_args` where they are refused. */
export const PANDOC_EXTRA_ARGS_DISABLED_ERROR =
  "extra_args is not available on this deployment. Pandoc flags can run " +
  "programs and read files on the server, so they are offered only where the " +
  "machine belongs to its user: the desktop app, a local server, or a " +
  "self-hosted install.";

/** What `take_screenshot` answers where it would launch a local browser. */
export const LOCAL_SCREENSHOT_DISABLED_ERROR =
  "Screenshots are not available on this deployment. Taking one launches a " +
  "browser on the server, so it is offered only where the machine belongs to " +
  "its user: the desktop app, a local server, or a self-hosted install.";
