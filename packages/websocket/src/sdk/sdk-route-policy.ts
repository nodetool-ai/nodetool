import { isSdkV1AuthenticationEnabled } from "./sdk-feature-flags.js";

/**
 * SDK routes that describe the server itself and may skip session auth in
 * local trust mode. Routes that read a user's library (workflow summaries and
 * interfaces) are never on this list: when the caller is not trusted, the
 * handlers would otherwise answer for user "1".
 */
export function isSdkV1DiscoveryRequest(
  pathname: string,
  method: string
): boolean {
  if (method !== "GET") {
    return false;
  }
  return (
    pathname === "/api/sdk/v1/capabilities" ||
    pathname === "/api/sdk/v1/models" ||
    pathname === "/api/sdk/v1/node-types"
  );
}

export function isSdkV1AuthenticationRequired(
  environment: NodeJS.ProcessEnv = process.env,
  serverAuthenticationRequired = false
): boolean {
  return (
    serverAuthenticationRequired || isSdkV1AuthenticationEnabled(environment)
  );
}
