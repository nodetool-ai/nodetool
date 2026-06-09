/**
 * Mutation-hardening tests for crypto.ts.
 *
 * These tests pin down behaviour that round-trip tests leave under-specified —
 * the exact wire format of a Fernet token (so it stays decryptable by Python's
 * `cryptography.Fernet`) and the boundary conditions of token validation.
 *
 * Each test targets a specific, observable property of the output rather than
 * an implementation detail, so it survives refactoring but fails if the
 * behaviour regresses.
 */
import { describe, it, expect } from "vitest";
import {
  generateMasterKey,
  encryptFernet,
  decryptFernet
} from "../src/crypto.js";

/** Decode a base64url Fernet token back to its raw bytes. */
function decodeToken(token: string): Buffer {
  const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

/** Minimum valid Fernet token: version(1) + timestamp(8) + iv(16) + hmac(32). */
const FERNET_MIN_LENGTH = 1 + 8 + 16 + 32;

describe("crypto hardening — Fernet wire format", () => {
  const masterKey = generateMasterKey();
  const userId = "user-fernet";

  it("stamps the token with version byte 0x80", () => {
    const token = encryptFernet(masterKey, userId, "payload");
    const bytes = decodeToken(token);

    expect(bytes[0]).toBe(0x80);
  });

  it("embeds the current time as a big-endian unix timestamp in SECONDS", () => {
    // The timestamp lives at byte offset 1 (right after the version byte) and
    // Python's Fernet uses it for TTL enforcement. A seconds-vs-milliseconds
    // mistake (e.g. Date.now() instead of Date.now()/1000) would silently break
    // every TTL check on the Python side, so pin the unit explicitly.
    const before = Math.floor(Date.now() / 1000);
    const token = encryptFernet(masterKey, userId, "payload");
    const after = Math.floor(Date.now() / 1000);

    const embedded = decodeToken(token).readBigUInt64BE(1);

    expect(embedded).toBeGreaterThanOrEqual(BigInt(before));
    expect(embedded).toBeLessThanOrEqual(BigInt(after));
  });

  it("decrypts a token whose base64url padding has been stripped", () => {
    // Real Python Fernet tokens are emitted as padded base64url, but lenient
    // producers (and our own re-encoders) strip the trailing '='. decryptFernet
    // must re-pad correctly, so a token with padding removed still round-trips.
    const padded = encryptFernet(masterKey, userId, "needs-repadding");
    const stripped = padded.replace(/=+$/, "");

    // Guard: this assertion only means something if the token actually had
    // padding that we removed.
    expect(stripped.length).toBeLessThan(padded.length);
    expect(decryptFernet(masterKey, userId, stripped)).toBe("needs-repadding");
  });
});

describe("crypto hardening — Fernet length boundary", () => {
  const masterKey = generateMasterKey();
  const userId = "user-fernet";

  /** base64url-encode without padding, the way decryptFernet accepts input. */
  function toBase64Url(buf: Buffer): string {
    return buf
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  }

  it("rejects a token one byte shorter than the minimum as 'too short'", () => {
    const tooShort = toBase64Url(Buffer.alloc(FERNET_MIN_LENGTH - 1));

    expect(() => decryptFernet(masterKey, userId, tooShort)).toThrow(
      "too short"
    );
  });

  it("does NOT reject a token of exactly the minimum length as 'too short'", () => {
    // A token of exactly FERNET_MIN_LENGTH bytes passes the length gate and must
    // fail later (here on the version byte, which is 0x00 in an all-zero buffer).
    // This nails the boundary operator: `<` keeps this token, `<=` would wrongly
    // reject it as "too short".
    const exactlyMin = toBase64Url(Buffer.alloc(FERNET_MIN_LENGTH));

    expect(() => decryptFernet(masterKey, userId, exactlyMin)).toThrow(
      "version"
    );
    expect(() => decryptFernet(masterKey, userId, exactlyMin)).not.toThrow(
      "too short"
    );
  });
});
