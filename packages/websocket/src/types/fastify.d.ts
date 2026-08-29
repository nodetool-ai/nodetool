import "fastify";

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
  }
}
