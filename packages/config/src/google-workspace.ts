/**
 * Availability gate for the Google Workspace integration (Drive, Gmail, Docs,
 * Sheets, Calendar).
 *
 * The `google` capability module authenticates with the Google access token the
 * user's Supabase Google login hands back — there is no API key to paste. A
 * local install has no login, and an SSO (OIDC) login carries no Google token,
 * so the integration would only ever surface an error; it is hidden there.
 *
 * Set `NODETOOL_GOOGLE_WORKSPACE=1` to force it on (useful when a local server
 * points at a hosted Supabase project), or `0` to force it off.
 */
import { isSupabaseAuthConfigured } from "./deployment.js";

/** Whether the Google Workspace capabilities should be offered. */
export function isGoogleWorkspaceEnabled(): boolean {
  const override = process.env["NODETOOL_GOOGLE_WORKSPACE"]?.trim();
  if (override === "1" || override === "true") return true;
  if (override === "0" || override === "false") return false;
  return isSupabaseAuthConfigured();
}
