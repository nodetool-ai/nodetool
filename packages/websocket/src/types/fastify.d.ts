import "fastify";
import type { AuthKind } from "../auth-kind.js";

declare module "fastify" {
  interface FastifyRequest {
    userId: string | null;
    authToken: string | null;
    /**
     * Set only when the request authenticated with a deployed mini app's
     * session token. `userId` is then the app owner, and this says which app
     * the caller may act on — every consumer must read it, because without it
     * the identity looks like an ordinary full session.
     */
    appSession: { applicationId: string; version: number } | null;
    /**
     * The device session id when the request authenticated with a native
     * `ntd_` access token, else null. Procedures that create credentials
     * refuse such a request.
     */
    nativeSessionId: string | null;
    /** Which credential authenticated the request, or null when none did. */
    authKind: AuthKind | null;
    /** When the native access token of this request expires, or null. */
    nativeTokenExpiresAt: number | null;
  }
}
