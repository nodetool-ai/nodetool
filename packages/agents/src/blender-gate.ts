/**
 * Availability gate for the `render_model3d` capability.
 *
 * Rendering a model shells to a Blender the server owns — a desktop install
 * the user keeps, not a binary a managed server can carry. Under the cloud
 * profile it is left off the toolbelt entirely, which makes
 * `nodetool.model3d.render()` throw the prelude's "not in this toolbelt"
 * error rather than fail deep inside the runner.
 *
 * Same switch that prunes the node catalog: `NODETOOL_NODE_PROFILE=cloud`, or
 * `NODETOOL_ENV=production` with the profile unset. A self-hosted install of
 * the same image sets `NODETOOL_NODE_PROFILE=full` and keeps the capability,
 * as does every local install. The node catalog already agrees — the
 * `nodetool.blender` namespace is not in the cloud allowlist, so the render
 * nodes are gone from the cloud product too.
 */

import {
  CLOUD_PROFILE_ENV,
  NODE_ENV_VAR,
  isCloudProfileActive
} from "@nodetool-ai/protocol";

/** Whether the `render_model3d` capability should be offered on this deployment. */
export function isBlenderEnabled(): boolean {
  return !isCloudProfileActive(
    process.env[CLOUD_PROFILE_ENV],
    process.env[NODE_ENV_VAR]
  );
}

/** What `render_model3d` answers where this deployment offers none. */
export const BLENDER_DISABLED_ERROR =
  "Rendering 3D models is not available on this deployment. It shells out " +
  "to a Blender install on the server, so it is offered only where the " +
  "machine belongs to its user — the desktop app, a local server, or a " +
  "self-hosted install.";
