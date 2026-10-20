/**
 * Which browser callers may use the Local-mode trust bypass.
 *
 * A loopback peer runs as user "1" with no token, and a browser is a loopback
 * peer for every page it has open. A page on any site can open
 * `ws://127.0.0.1:7777/ws` (CORS does not cover WebSockets) or send a
 * preflight-free POST, so the source address alone cannot tell the user's own
 * client from a hostile page. The `Origin` header can: a browser always sets
 * it on WebSocket handshakes and cross-origin writes, and no page can forge it.
 */

import { isOriginAllowed } from "../cors.js";
import { matchesServerAuthToken } from "./server-auth-token.js";

/**
 * Header the desktop app adds to its own windows' requests. Electron's
 * `file://` renderer sends `Origin: null`, which any sandboxed iframe can also
 * send, so the app proves itself with a secret it generated at launch and
 * passed to the backend as `NODETOOL_LOCAL_CLIENT_TOKEN`.
 */
export const LOCAL_CLIENT_TOKEN_HEADER = "x-nodetool-local-client";

const EXTENSION_ORIGIN = /^(chrome|moz)-extension:\/\/[a-z0-9-]+$/i;

/**
 * Whether a request that arrived from a trusted local address may run as the
 * local user without a token.
 *
 * - The desktop app's launch token always passes.
 * - No `Origin` passes, unless `Sec-Fetch-Site` says another site sent it.
 *   Non-browser clients (CLI, MCP clients, scripts) and same-origin GETs send
 *   no `Origin`, but neither do a cross-site `<img>`, `<script>` or top-level
 *   navigation. A browser sets `Sec-Fetch-Site` on every request and no page
 *   can change it.
 * - `Origin: null` fails: sandboxed iframes and opaque documents send it.
 * - A browser extension's origin passes, since a page cannot claim one.
 * - Same-origin passes. The `Host` check that runs alongside this one has
 *   already refused rebound names, so a matching origin is the server's own UI.
 * - Otherwise the CORS allow-list decides (localhost dev servers, `file://`,
 *   first-party domains, `NODETOOL_ALLOWED_ORIGINS`).
 */
export function isLocalClientRequest(opts: {
  origin: string | undefined;
  host: string | undefined;
  presentedToken: string | undefined;
  expectedToken: string | null;
  /** The `Sec-Fetch-Site` header, when the caller is a browser. */
  fetchSite?: string | undefined;
}): boolean {
  if (matchesServerAuthToken(opts.presentedToken, opts.expectedToken)) {
    return true;
  }
  const origin = opts.origin?.trim();
  if (!origin) return opts.fetchSite?.trim().toLowerCase() !== "cross-site";
  if (origin === "null") return false;
  if (EXTENSION_ORIGIN.test(origin)) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  if (opts.host && originHost === opts.host.trim().toLowerCase()) return true;
  return isOriginAllowed(origin);
}
