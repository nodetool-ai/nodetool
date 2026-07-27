/**
 * Resolve the Google access token a tool or node needs from the processing
 * context.
 *
 * The token is not a pasted API key: it comes from the user's Google sign-in
 * and is stored server-side as an OAuth credential. `getSecret` routes the
 * `GOOGLE_ACCESS_TOKEN` key to that credential (refreshing it when stale), so
 * every caller resolves it the same way.
 */

import type { ProcessingContext } from "../context.js";

/** Virtual secret key backed by the user's stored Google credential. */
export const GOOGLE_ACCESS_TOKEN_KEY = "GOOGLE_ACCESS_TOKEN";

const NOT_CONNECTED =
  "No Google account connected. Sign in with Google to give NodeTool access " +
  "to your Drive, Gmail, Docs, Sheets and Calendar.";

/** Return the caller's Google access token, or throw a user-facing error. */
export async function requireGoogleAccessToken(
  context?: Pick<ProcessingContext, "getSecret">
): Promise<string> {
  const token = context
    ? await context.getSecret(GOOGLE_ACCESS_TOKEN_KEY)
    : (process.env[GOOGLE_ACCESS_TOKEN_KEY] ?? null);
  if (!token) {
    throw new Error(NOT_CONNECTED);
  }
  return token;
}
