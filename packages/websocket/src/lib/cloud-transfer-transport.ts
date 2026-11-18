/**
 * The HTTP transport the local transfer client reaches a cloud server with.
 * Its fetch sends only to the origin the app signed in to and follows no
 * redirect (docs/plans/native-cloud-sync/technical-design.md, SR3).
 */
import { CloudHttpTransport } from "@nodetool-ai/project-services/cloud-http-transport";
import { cloudOriginFetch } from "@nodetool-ai/project-services/cloud-origin";

export function cloudTransport(origin: string, accessToken: string): CloudHttpTransport {
  return new CloudHttpTransport({ origin, accessToken, fetchImpl: cloudOriginFetch(origin) });
}
