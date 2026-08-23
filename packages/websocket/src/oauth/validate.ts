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
