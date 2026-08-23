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
  // RFC 9728 path insertion: the well-known prefix sits at the HOST ROOT
  // and the issuer's path is inserted after it. For an issuer with no path
  // this is `<origin>/.well-known/oauth-protected-resource/mcp`; for
  // https://host/base it is
  // `https://host/.well-known/oauth-protected-resource/base/mcp` — NOT
  // `<issuer>/.well-known/…`, which no route serves.
  const base = normalizeOrigin(input.publicUrl);
  const origin = new URL(base).origin;
  const issuerPath = base.slice(origin.length);
  const resourceMetadata = `${origin}/.well-known/oauth-protected-resource${issuerPath}/mcp`;
  const errorPart = input.error ? `, error="${input.error}"` : "";
  return `Bearer resource_metadata="${resourceMetadata}", scope="mcp"${errorPart}`;
}
