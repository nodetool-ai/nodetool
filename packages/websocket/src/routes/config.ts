import type { FastifyPluginAsync } from "fastify";
import { isGoogleWorkspaceEnabled } from "@nodetool-ai/config";
import { GOOGLE_WORKSPACE_SCOPES } from "@nodetool-ai/runtime";
import { getVersion } from "./health.js";

/**
 * Public, non-secret runtime configuration for the web client.
 *
 * Consolidates configuration on the backend: a separately-hosted frontend
 * learns its auth mode and *public* Supabase credentials at runtime from the
 * server it talks to, instead of baking `VITE_*` values into the bundle at
 * build time. The web app fetches this at boot (see web `runtimeConfig.ts`).
 *
 * This endpoint MUST only expose values that are safe in a browser. The
 * Supabase anon key (`SUPABASE_ANON_KEY`) is designed to ship to clients; the
 * service-role key (`SUPABASE_KEY`) is never returned.
 */

/**
 * Describe the one misconfiguration this endpoint can serve without noticing:
 * auth enforced (`SUPABASE_URL` + `SUPABASE_KEY`) but no `SUPABASE_ANON_KEY` to
 * hand the browser. The response is still well-formed — `supabaseAnonKey` is
 * just `null` — so the web app falls back to a placeholder key and every login
 * 401s with nothing in the server log. Returns null when nothing is wrong.
 *
 * Pure so the boot-time check can be tested without standing up a server.
 */
export const describeMissingAnonKey = (
  env: Record<string, string | undefined> = process.env
): string | null => {
  const url = env["SUPABASE_URL"]?.trim();
  const serviceKey = env["SUPABASE_KEY"]?.trim();
  const anonKey = env["SUPABASE_ANON_KEY"]?.trim();
  if (!url || !serviceKey || anonKey) return null;
  return (
    "SUPABASE_ANON_KEY is not set. Auth is enforced (SUPABASE_URL and " +
    "SUPABASE_KEY are both present), but GET /api/config has no anon key to " +
    "give the web app, so it falls back to a placeholder and every login " +
    "fails with 401. Set SUPABASE_ANON_KEY to the project's public anon key — " +
    "never SUPABASE_KEY, which is the service-role key and must not reach a " +
    "browser."
  );
};

const configRoute: FastifyPluginAsync = async (app) => {
  app.get("/api/config", async (_req, reply) => {
    const supabaseUrl = process.env["SUPABASE_URL"]?.trim() || null;
    const supabaseServiceKey = process.env["SUPABASE_KEY"]?.trim() || null;
    const supabaseAnonKey = process.env["SUPABASE_ANON_KEY"]?.trim() || null;
    const authRedirectUrl = process.env["AUTH_REDIRECT_URL"]?.trim() || null;

    // Mirror the server's auth-mode selection: "Supabase mode" (auth enforced)
    // is chosen when both SUPABASE_URL and SUPABASE_KEY are set. Everything
    // else is "Local mode" (loopback trusted, no login screen).
    const authMode: "supabase" | "local" =
      supabaseUrl && supabaseServiceKey ? "supabase" : "local";

    // When enabled, the web app offers a Workspace connect step — separate from
    // login, which asks for identity only — and posts the resulting provider
    // token to /api/oauth/google/session.
    const googleWorkspace = isGoogleWorkspaceEnabled();

    return reply.status(200).send({
      authMode,
      supabaseUrl,
      supabaseAnonKey,
      authRedirectUrl,
      googleWorkspace,
      googleScopes: googleWorkspace ? GOOGLE_WORKSPACE_SCOPES : [],
      version: getVersion()
    });
  });
};

export default configRoute;
