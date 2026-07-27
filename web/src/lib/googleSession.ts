import type { Session } from "@supabase/supabase-js";

import { restFetch } from "./rest-fetch";
import { getRuntimeConfig, isGoogleWorkspaceEnabled } from "./runtimeConfig";

/**
 * Hand the Google tokens from a Supabase login to the backend.
 *
 * Supabase surfaces the Google `provider_token` (and `provider_refresh_token`
 * when the login asked for offline access) to the browser only — it is not
 * readable server-side. Posting it once per sign-in is what lets agent tools
 * and workflow nodes reach the user's Drive, Gmail, Docs, Sheets and Calendar.
 *
 * Best-effort: a failure here costs the Google integration for the session, not
 * the login itself.
 */
export const syncGoogleProviderToken = async (
  session: Session | null
): Promise<void> => {
  if (!session?.provider_token || !isGoogleWorkspaceEnabled()) {
    return;
  }
  // Supabase reports the provider that issued the session on the identity, so a
  // GitHub or email login never posts its token to the Google endpoint.
  const isGoogle = session.user?.app_metadata?.provider === "google";
  if (!isGoogle) {
    return;
  }

  try {
    const response = await restFetch("/api/oauth/google/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: session.provider_token,
        refresh_token: session.provider_refresh_token ?? null,
        // Google access tokens last an hour; Supabase does not report their
        // expiry, so record the conservative default the backend refreshes on.
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        scope: getRuntimeConfig().googleScopes.join(" "),
        email: session.user?.email ?? null
      })
    });
    if (!response.ok) {
      console.warn(
        "Google: storing the provider token failed",
        response.status
      );
    }
  } catch (error) {
    console.warn("Google: storing the provider token failed", error);
  }
};
