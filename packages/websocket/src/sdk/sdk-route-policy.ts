import { isSdkV1AuthenticationEnabled } from "./sdk-feature-flags.js";

export function isSdkV1DiscoveryRequest(
  pathname: string,
  method: string
): boolean {
  if (method === "POST" && pathname === "/api/sdk/v1/workflow-interfaces") {
    return true;
  }
  if (method !== "GET") {
    return false;
  }
  return (
    pathname === "/api/sdk/v1/capabilities" ||
    pathname === "/api/sdk/v1/node-types" ||
    pathname === "/api/sdk/v1/workflows" ||
    /^\/api\/workflows\/[^/]+\/interface$/.test(pathname)
  );
}

export function isSdkV1AuthenticationRequired(
  environment: NodeJS.ProcessEnv = process.env
): boolean {
  return isSdkV1AuthenticationEnabled(environment);
}
