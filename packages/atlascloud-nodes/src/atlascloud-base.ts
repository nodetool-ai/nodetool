/**
 * AtlasCloud auth for the node pack.
 *
 * The submit/poll/download flow itself lives in
 * `@nodetool-ai/runtime/provider-transport` — this pack and `AtlasCloudProvider`
 * ran two copies of it until they disagreed about retries and terminal states.
 * The names below are re-exported so node code and the pack's public API keep
 * importing them from here.
 */

export {
  ATLAS_BASE,
  SUBMIT_PATH,
  pollPath,
  retryAfterMs,
  fetchWithRetry,
  atlasDownload,
  atlasSubmit,
  atlasPoll,
  pickOutputUrl
} from "@nodetool-ai/runtime/provider-transport";
export type {
  AtlasModality,
  AtlasPollResult,
  AtlasPollOptions
} from "@nodetool-ai/runtime/provider-transport";

export function getApiKey(secrets: Record<string, string> | undefined): string {
  const key =
    (secrets && secrets.ATLASCLOUD_API_KEY) ||
    process.env.ATLASCLOUD_API_KEY ||
    "";
  if (!key.trim()) {
    throw new Error("ATLASCLOUD_API_KEY is not configured");
  }
  return key.trim();
}
