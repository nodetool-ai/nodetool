/**
 * `WWW-Authenticate` challenge for an unauthenticated or invalid request to
 * `/mcp`, per the MCP authorization spec § "WWW-Authenticate".
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

export function buildBearerChallenge(input: {
  publicUrl: string;
  error?: "invalid_token";
}): string {
  const base = normalizeOrigin(input.publicUrl);
  const resourceMetadata = `${base}/.well-known/oauth-protected-resource/mcp`;
  const errorPart = input.error ? `, error="${input.error}"` : "";
  return `Bearer resource_metadata="${resourceMetadata}", scope="mcp"${errorPart}`;
}
