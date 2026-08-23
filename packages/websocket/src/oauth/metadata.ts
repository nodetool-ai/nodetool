/**
 * OAuth discovery documents for the MCP resource server + authorization
 * server: RFC 9728 protected resource metadata and RFC 8414 authorization
 * server metadata.
 *
 * Pure functions — `publicUrl` is a parameter, never read from the
 * environment. Callers derive `publicUrl` from `configuredMcpUrl()`
 * (`lib/mcp-mount.ts`).
 */

/** RFC 9728 protected resource metadata document. */
export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported: string[];
  bearer_methods_supported: string[];
  resource_name: string;
}

/** RFC 8414 authorization server metadata document. */
export interface AuthServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  revocation_endpoint: string;
  response_types_supported: string[];
  grant_types_supported: string[];
  code_challenge_methods_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  scopes_supported: string[];
  client_id_metadata_document_supported: boolean;
  authorization_response_iss_parameter_supported: boolean;
}

/**
 * Normalize a public URL to its origin: lowercase scheme + host, no
 * trailing slash, no query/hash. `publicUrl` is expected to carry no path
 * beyond an optional trailing slash, but any path is preserved (trailing
 * slash stripped) so a deployment mounted under a sub-path still works.
 */
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

export function buildProtectedResourceMetadata(
  publicUrl: string
): ProtectedResourceMetadata {
  const base = normalizeOrigin(publicUrl);
  return {
    resource: `${base}/mcp`,
    authorization_servers: [base],
    scopes_supported: ["mcp"],
    bearer_methods_supported: ["header"],
    resource_name: "NodeTool MCP"
  };
}

export function buildAuthServerMetadata(publicUrl: string): AuthServerMetadata {
  const base = normalizeOrigin(publicUrl);
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    revocation_endpoint: `${base}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true
  };
}
