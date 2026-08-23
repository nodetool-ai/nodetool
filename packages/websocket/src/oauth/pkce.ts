/**
 * PKCE (RFC 7636) S256 verification for the token endpoint.
 *
 * `PKCEHelper` (`@nodetool-ai/runtime/oauth`, `providers/oauth/pkce-helper.ts`)
 * derives `code_challenge = BASE64URL(SHA-256(code_verifier))` the same way,
 * but its methods are async (it also generates verifiers/state via an
 * injectable CSPRNG). The token endpoint needs a synchronous, constant-time
 * *comparison* of a caller-supplied verifier against a stored challenge, so
 * this reimplements the same derivation — ascii-encoded input, base64url
 * digest, matching `PKCEHelper.createCodeChallenge` byte for byte — and
 * compares with `timingSafeEqual` rather than round-tripping through the
 * async helper.
 */

import { createHash, timingSafeEqual } from "node:crypto";

function deriveS256Challenge(codeVerifier: string): string {
  return createHash("sha256")
    .update(codeVerifier, "ascii")
    .digest("base64url");
}

/** Constant-time S256 PKCE verification. */
export function verifyS256(codeVerifier: string, codeChallenge: string): boolean {
  const expected = Buffer.from(deriveS256Challenge(codeVerifier));
  const actual = Buffer.from(codeChallenge);
  if (expected.length !== actual.length) {
    return false;
  }
  return timingSafeEqual(expected, actual);
}
