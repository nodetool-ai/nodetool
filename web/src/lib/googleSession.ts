import type { Session } from "@supabase/supabase-js";

import { restFetch } from "./rest-fetch";
import { isGoogleWorkspaceEnabled } from "./runtimeConfig";

const WORKSPACE_GRANT_KEY = "nodetool.google.workspaceGrant";

/**
 * Record that the OAuth redirect now in flight asked for the Workspace scopes.
 *
 * Signing in does not ask for them (see `useAuth.signInWithProvider`), so the
 * returning session is the only place that can tell an identity-only login from
 * a Workspace connect. Google reports the granted scopes to Supabase, not to
 * us, so we remember what we asked for across the redirect instead.
 */
export const markWorkspaceGrantPending = (scopes: string[]): void => {
  try {
    sessionStorage.setItem(WORKSPACE_GRANT_KEY, scopes.join(" "));
  } catch {
    // sessionStorage is unavailable in private mode and sandboxed iframes. The
    // grant then goes unrecorded and the token is not posted, which fails the
    // Workspace tools closed rather than claiming scopes we cannot prove.
  }
};

const takeWorkspaceGrant = (): string | null => {
  try {
    const scopes = sessionStorage.getItem(WORKSPACE_GRANT_KEY);
    if (scopes) {
      sessionStorage.removeItem(WORKSPACE_GRANT_KEY);
    }
    return scopes;
  } catch {
    return null;
  }
};

/**
 * Hand the Google tokens from a Workspace connect to the backend.
 *
 * Supabase surfaces the Google `provider_token` (and `provider_refresh_token`
 * when the flow asked for offline access) to the browser only — it is not
 * readable server-side. Posting it once per grant is what lets agent tools and
 * workflow nodes reach the user's Drive, Gmail, Docs, Sheets and Calendar.
 *
 * Only a session returning from `connectGoogleWorkspace` carries those scopes.
 * A plain login also yields a `provider_token`, but one good for identity
 * alone — posting it would register a Workspace connection that cannot read
 * anything, so the pending-grant marker gates this.
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
  // GitHub or email login never posts its token to the Google endpoint. Checked
  // before the grant is consumed, so an unrelated login cannot burn it.
  const isGoogle = session.user?.app_metadata?.provider === "google";
  if (!isGoogle) {
    return;
  }
  const grantedScopes = takeWorkspaceGrant();
  if (!grantedScopes) {
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
        scope: grantedScopes,
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
