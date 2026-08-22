/**
 * The one door a caller-supplied media URL leaves the host through.
 *
 * A media ref (`{uri}` on an image/audio/video/model3d value) is caller data:
 * it reaches the server from a workflow a user authored, a chat client's
 * attachment, or a node output an agent produced. Resolving one used to end in
 * a bare `fetch(uri)` in four different modules, so `http://169.254.169.254/`
 * in a ref was a request the server made on the caller's behalf — which is what
 * #5101 left standing, deliberately, because the fix is a product decision and
 * not a drive-by.
 *
 * The decision: media refs follow NodeTool's default egress policy —
 * {@link safeFetch}, https to a public host, every redirect hop re-checked.
 * A self-hosted install that genuinely serves media off its own LAN
 * (`http://nas.local/clip.mp4`) opts out with
 * `NODETOOL_ALLOW_PRIVATE_MEDIA_FETCH=1`, which turns the guard off for these
 * fetches and nothing else. It is read per call, not at import, so a test — and
 * an operator restarting nothing — sees the change.
 */

import { safeProcessEnv } from "@nodetool-ai/config";
import { safeFetch } from "./providers/safe-url.js";

/** True when the operator has opted this install out of the media-ref guard. */
export function privateMediaFetchAllowed(): boolean {
  return safeProcessEnv()["NODETOOL_ALLOW_PRIVATE_MEDIA_FETCH"] === "1";
}

/**
 * `fetch` a caller-supplied media URL under the media-ref egress policy.
 * Throws when the guard refuses the URL or a redirect hop, exactly as
 * {@link safeFetch} does — callers that resolve bytes best-effort catch it and
 * report "no bytes", callers that must have the media let it surface.
 */
export async function fetchExternalMedia(
  uri: string,
  init?: RequestInit
): Promise<Response> {
  if (privateMediaFetchAllowed()) {
    return fetch(uri, init);
  }
  return safeFetch(uri, init);
}
