/**
 * Structural checks shared by the authorize and token endpoints: redirect
 * URI allowlisting, resource-indicator (RFC 8707) matching, and scope.
 */

/** Lowercase scheme + host, no trailing slash — mirrors metadata.ts. */
function normalizeOrigin(publicUrl: string): string {
  const url = new URL(publicUrl);
  const scheme = url.protocol.toLowerCase();
  const host = url.host.toLowerCase();
  let path = url.pathname;
  if (path === "/") {
    path = "";
  } else if (path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  return `${scheme}//${host}${path}`;
}

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost"]);

/**
 * A redirect URI is allowed when it is `https://…`, or `http://` to a
 * loopback host (`127.0.0.1` or `localhost`, any port).
 */
export function isAllowedRedirectUri(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.protocol === "https:") {
    return true;
  }
  if (url.protocol === "http:") {
    return LOOPBACK_HOSTNAMES.has(url.hostname.toLowerCase());
  }
  return false;
}

function parseLoopbackHttp(uri: string): URL | null {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" || !LOOPBACK_HOSTNAMES.has(url.hostname)) {
    return null;
  }
  if (url.username !== "" || url.password !== "" || url.hash !== "") {
    return null;
  }
  return url;
}

/**
 * Whether `requested` is one of the client's registered redirect URIs.
 *
 * The match is exact, except for loopback: an `http` URI on `127.0.0.1` or
 * `localhost` matches a registered one with the same host, path and query on
 * any port (RFC 8252 §7.3). A native client binds an ephemeral port per
 * session. Claude Code registers `http://localhost/callback` and redirects
 * to `http://localhost:<port>/callback`.
 */
export function isRegisteredRedirectUri(
  requested: string,
  registered: readonly string[]
): boolean {
  if (registered.includes(requested)) {
    return true;
  }
  const req = parseLoopbackHttp(requested);
  if (!req) {
    return false;
  }
  return registered.some((uri) => {
    const reg = parseLoopbackHttp(uri);
    return (
      reg !== null &&
      reg.hostname === req.hostname &&
      reg.pathname === req.pathname &&
      reg.search === req.search
    );
  });
}

/** The canonical `/mcp` resource URI for this deployment. */
export function canonicalResource(publicUrl: string): string {
  return `${normalizeOrigin(publicUrl)}/mcp`;
}

/**
 * A `resource` parameter matches when absent (client didn't send one — ok,
 * per RFC 8707 the parameter is optional) or when it equals the canonical
 * `/mcp` resource for this deployment exactly.
 */
export function resourceMatches(
  requested: string | undefined,
  publicUrl: string
): boolean {
  if (requested === undefined) {
    return true;
  }
  return requested === canonicalResource(publicUrl);
}

/** The one scope this AS issues. Absent/empty defaults to it. */
export function validateScope(
  scope: string | undefined
): { ok: true; scope: "mcp" } | { ok: false } {
  if (scope === undefined || scope === "" || scope === "mcp") {
    return { ok: true, scope: "mcp" };
  }
  return { ok: false };
}
