import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { PKCEHelper, type RandomSource } from "../../../src/providers/oauth/pkce-helper.js";

/** Deterministic random source: returns predictable, distinct byte patterns. */
function fixedRandom(byte: number): RandomSource {
  return {
    randomBytes: async (size) => new Uint8Array(size).fill(byte)
  };
}

const base64Url = (buf: Buffer) =>
  buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

describe("PKCEHelper", () => {
  it("produces a base64url verifier of the expected length and alphabet", async () => {
    const helper = new PKCEHelper({ random: fixedRandom(0xab), verifierBytes: 32 });
    const verifier = await helper.createCodeVerifier();
    // 32 bytes → 43 base64url chars, no padding.
    expect(verifier).toHaveLength(43);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("derives the challenge as BASE64URL(SHA-256(verifier))", async () => {
    const helper = new PKCEHelper({ random: fixedRandom(0x01) });
    const verifier = await helper.createCodeVerifier();
    const challenge = await helper.createCodeChallenge(verifier);
    const expected = base64Url(createHash("sha256").update(verifier, "ascii").digest());
    expect(challenge).toBe(expected);
  });

  it("createPkcePair returns a matching verifier/challenge with S256", async () => {
    const helper = new PKCEHelper();
    const pair = await helper.createPkcePair();
    expect(pair.method).toBe("S256");
    const recomputed = await helper.createCodeChallenge(pair.verifier);
    expect(pair.challenge).toBe(recomputed);
  });

  it("generates high-entropy, non-repeating state values", async () => {
    const helper = new PKCEHelper();
    const a = await helper.createState();
    const b = await helper.createState();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
