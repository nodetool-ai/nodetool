/**
 * Play tokens for a game's published web build.
 *
 * A token names one user, one game and one finished build, and expires. It is
 * the only credential the player page carries: the mobile WebView loads
 * `/api/game-play/<token>/index.html`, and every file the player then fetches
 * is relative to that path. No bearer token, refresh token or cookie reaches
 * the page, so game code cannot act as the user on any other route.
 *
 * Tokens are stateless, signed with a key derived from the server's master
 * key, so any machine of a deployment verifies a token another machine minted.
 * Revocation is expiry plus the ownership check every file request repeats.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getMasterKey } from "@nodetool-ai/security";

/** How long a minted play URL keeps working. The player fetches its files at startup. */
export const GAME_PLAY_TOKEN_TTL_MS = 15 * 60 * 1000;

const PURPOSE = "nodetool.game-play-token.v1";
const GAME_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** `game-builds/<game id>/<revision>-web-<runtime fingerprint>`, as `buildOwnedNativeGame` names a web build. */
const WEB_BUILD_PATH = /^game-builds\/([A-Za-z0-9_-]{1,64})\/[A-Za-z0-9_]{1,64}-web-[a-f0-9]{64}$/;

const payloadSchema = z.strictObject({
  v: z.literal(1),
  u: z.string().min(1).max(256),
  g: z.string().regex(GAME_ID),
  b: z.string().regex(WEB_BUILD_PATH),
  e: z.number().int().positive()
});

export interface GamePlayGrant {
  readonly userId: string;
  readonly gameId: string;
  readonly buildPath: string;
  /** Milliseconds since the epoch. */
  readonly expiresAt: number;
}

function signingKey(masterKey: string): Buffer {
  return createHmac("sha256", masterKey).update(PURPOSE).digest();
}

function sign(body: string, masterKey: string): string {
  return createHmac("sha256", signingKey(masterKey)).update(body).digest("base64url");
}

/** Mints a token for a web build of `gameId`. Refuses a build path that belongs to another game. */
export function createGamePlayToken(
  grant: Omit<GamePlayGrant, "expiresAt">,
  options: { now?: number; ttlMs?: number; masterKey?: string } = {}
): { token: string; expiresAt: number } {
  const match = WEB_BUILD_PATH.exec(grant.buildPath);
  if (!match || match[1] !== grant.gameId) {
    throw new Error("A play token needs a web build of the same game");
  }
  const expiresAt = (options.now ?? Date.now()) + (options.ttlMs ?? GAME_PLAY_TOKEN_TTL_MS);
  const payload = payloadSchema.parse({ v: 1, u: grant.userId, g: grant.gameId, b: grant.buildPath, e: Math.floor(expiresAt / 1000) });
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { token: `${body}.${sign(body, options.masterKey ?? getMasterKey())}`, expiresAt: payload.e * 1000 };
}

/** The grant a token carries, or null when it is malformed, forged, for another build, or expired. */
export function verifyGamePlayToken(
  token: string,
  options: { now?: number; masterKey?: string } = {}
): GamePlayGrant | null {
  if (token.length > 2048) { return null; }
  const parts = token.split(".");
  if (parts.length !== 2) { return null; }
  const [body, signature] = parts as [string, string];
  if (!/^[A-Za-z0-9_-]+$/.test(body) || !/^[A-Za-z0-9_-]+$/.test(signature)) { return null; }
  const expected = Buffer.from(sign(body, options.masterKey ?? getMasterKey()));
  const presented = Buffer.from(signature);
  if (expected.length !== presented.length || !timingSafeEqual(expected, presented)) { return null; }
  let value: unknown;
  try { value = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { return null; }
  const parsed = payloadSchema.safeParse(value);
  if (!parsed.success) { return null; }
  const payload = parsed.data;
  if (WEB_BUILD_PATH.exec(payload.b)?.[1] !== payload.g) { return null; }
  const expiresAt = payload.e * 1000;
  if ((options.now ?? Date.now()) >= expiresAt) { return null; }
  return { userId: payload.u, gameId: payload.g, buildPath: payload.b, expiresAt };
}
