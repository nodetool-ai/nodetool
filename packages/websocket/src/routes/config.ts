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

    // When enabled, the web app asks Google for the Workspace scopes at login
    // and posts the resulting provider token to /api/oauth/google/session.
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
