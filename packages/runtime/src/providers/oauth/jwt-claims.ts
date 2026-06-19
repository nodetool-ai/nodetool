/**
 * JWT claim extraction for the ChatGPT/Codex backend.
 *
 * The Codex OAuth access token is a JWT whose payload carries the ChatGPT
 * account identity needed to address the `chatgpt.com/backend-api/codex`
 * routes. This module decodes that payload (without verifying the signature —
 * verification is the authorization server's job; we only read claims we were
 * already issued) and pulls out the account id.
 *
 * No I/O, no dependencies — pure string/JSON work so it is trivially testable
 * and safe to import from any layer.
 */

/** OIDC namespace under which OpenAI nests its custom auth claims. */
const OPENAI_AUTH_CLAIM = "https://api.openai.com/auth";

/** Decode the JSON payload (the middle segment) of a JWT. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  if (typeof token !== "string") return null;
  const segments = token.split(".");
  // A well-formed JWS has three dot-separated segments: header.payload.signature.
  if (segments.length !== 3) return null;
  const payloadSegment = segments[1];
  if (!payloadSegment) return null;

  let json: string;
  try {
    json = Buffer.from(payloadSegment, "base64url").toString("utf8");
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(json) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Extract the ChatGPT account id from a Codex OAuth token.
 *
 * The claim lives under the `https://api.openai.com/auth` namespace as
 * `chatgpt_account_id`; some token shapes also surface it at the top level, so
 * both are checked. Returns `null` when absent or malformed.
 */
export function extractChatGptAccountId(token: string): string | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;

  const namespaced = payload[OPENAI_AUTH_CLAIM];
  if (namespaced && typeof namespaced === "object" && !Array.isArray(namespaced)) {
    const id = (namespaced as Record<string, unknown>).chatgpt_account_id;
    if (typeof id === "string" && id.length > 0) return id;
  }

  const topLevel = payload.chatgpt_account_id;
  if (typeof topLevel === "string" && topLevel.length > 0) return topLevel;

  return null;
}
