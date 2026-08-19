/**
 * Availability gate for the `yt_dlp` capability.
 *
 * A managed multi-tenant server pulling media from arbitrary sites on a user's
 * behalf is a different product from a downloader running on that user's own
 * machine, and datacenter egress is what those sites block first — so in the
 * cloud the capability mostly spends a spawn to return an extractor error.
 * Under the cloud profile it is left off the toolbelt entirely, which makes
 * `nodetool.media.downloadVideo()` throw the prelude's "not in this toolbelt"
 * error rather than fail deep inside yt-dlp.
 *
 * Same switch that prunes the node catalog: `NODETOOL_NODE_PROFILE=cloud`, or
 * `NODETOOL_ENV=production` with the profile unset. A self-hosted install of
 * the same image sets `NODETOOL_NODE_PROFILE=full` and keeps the capability,
 * as does every local install.
 */

import {
  CLOUD_PROFILE_ENV,
  NODE_ENV_VAR,
  isCloudProfileActive
} from "@nodetool-ai/protocol";

/** Whether the `yt_dlp` capability should be offered on this deployment. */
export function isYtDlpEnabled(): boolean {
  return !isCloudProfileActive(
    process.env[CLOUD_PROFILE_ENV],
    process.env[NODE_ENV_VAR]
  );
}
