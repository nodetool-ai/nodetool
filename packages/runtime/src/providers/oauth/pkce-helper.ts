/**
 * PKCE (RFC 7636) and CSRF-state generation.
 *
 * Pure crypto with no I/O and no shared state. The randomness source is
 * injectable so tests can assert exact verifier/challenge derivations, but the
 * default uses the platform CSPRNG (`node:crypto`).
 */

import { createHash, randomBytes } from "node:crypto";
import type { CodeChallengeMethod, PkcePair } from "./types.js";

/** Abstraction over a cryptographically-secure byte source. */
export interface RandomSource {
  /** Resolve to `size` random bytes. */
  randomBytes(size: number): Promise<Uint8Array>;
}

/** Default CSPRNG backed by `node:crypto.randomBytes`. */
export const nodeRandomSource: RandomSource = {
  randomBytes: (size) =>
    new Promise<Uint8Array>((resolve, reject) => {
      randomBytes(size, (err, buf) => (err ? reject(err) : resolve(new Uint8Array(buf))));
    })
};

/** RFC 4648 §5 base64url, no padding. */
function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export interface PKCEHelperOptions {
  /** Injected randomness; defaults to the platform CSPRNG. */
  readonly random?: RandomSource;
  /** Verifier entropy in bytes. RFC 7636 allows 43–128 chars; 32 bytes → 43. */
  readonly verifierBytes?: number;
  /** CSRF state entropy in bytes. */
  readonly stateBytes?: number;
}

/**
 * Generates PKCE verifiers/challenges and CSRF state values. All methods are
 * async to keep a uniform, non-blocking API even though hashing is synchronous.
 */
export class PKCEHelper {
  private readonly random: RandomSource;
  private readonly verifierBytes: number;
  private readonly stateBytes: number;

  constructor(options: PKCEHelperOptions = {}) {
    this.random = options.random ?? nodeRandomSource;
    this.verifierBytes = options.verifierBytes ?? 32;
    this.stateBytes = options.stateBytes ?? 32;
  }

  /** Generate a high-entropy `code_verifier`. */
  async createCodeVerifier(): Promise<string> {
    return base64UrlEncode(await this.random.randomBytes(this.verifierBytes));
  }

  /** Derive `code_challenge = BASE64URL(SHA-256(verifier))`. */
  async createCodeChallenge(verifier: string): Promise<string> {
    const digest = createHash("sha256").update(verifier, "ascii").digest();
    return base64UrlEncode(new Uint8Array(digest));
  }

  /** Generate an opaque CSRF `state` token. */
  async createState(): Promise<string> {
    return base64UrlEncode(await this.random.randomBytes(this.stateBytes));
  }

  /** Convenience: produce a full verifier + challenge pair in one call. */
  async createPkcePair(): Promise<PkcePair> {
    const verifier = await this.createCodeVerifier();
    const challenge = await this.createCodeChallenge(verifier);
    const method: CodeChallengeMethod = "S256";
    return { verifier, challenge, method };
  }
}
