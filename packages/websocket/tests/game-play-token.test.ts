/**
 * Play tokens are the only credential a mobile player page holds, so these
 * pin what a token can and cannot be turned into.
 */
import { describe, expect, it } from "vitest";
import { createGamePlayToken, GAME_PLAY_TOKEN_TTL_MS, verifyGamePlayToken } from "../src/lib/game-play-token.js";

const KEY = "test-master-key";
const GAME = "0123456789abcdef0123456789abcdef";
const BUILD = `game-builds/${GAME}/${"a".repeat(32)}-web-${"b".repeat(64)}`;
const NOW = 1_800_000_000_000;

describe("game play tokens", () => {
  it("round-trips the grant until it expires", () => {
    const { token, expiresAt } = createGamePlayToken({ userId: "user-1", gameId: GAME, buildPath: BUILD }, { now: NOW, masterKey: KEY });
    expect(expiresAt).toBe(NOW + GAME_PLAY_TOKEN_TTL_MS);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(verifyGamePlayToken(token, { now: NOW + 1000, masterKey: KEY })).toEqual({
      userId: "user-1", gameId: GAME, buildPath: BUILD, expiresAt
    });
    expect(verifyGamePlayToken(token, { now: expiresAt, masterKey: KEY })).toBeNull();
  });

  it("refuses a token signed with another key, or with a changed payload", () => {
    const { token } = createGamePlayToken({ userId: "user-1", gameId: GAME, buildPath: BUILD }, { now: NOW, masterKey: KEY });
    expect(verifyGamePlayToken(token, { now: NOW, masterKey: "other-key" })).toBeNull();
    const [, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ v: 1, u: "user-2", g: GAME, b: BUILD, e: NOW / 1000 + 900 })).toString("base64url");
    expect(verifyGamePlayToken(`${forged}.${signature}`, { now: NOW, masterKey: KEY })).toBeNull();
    for (const malformed of ["", "abc", "a.b.c", `${token}x`, "a b.c", "x".repeat(3000)]) {
      expect(verifyGamePlayToken(malformed, { now: NOW, masterKey: KEY })).toBeNull();
    }
  });

  it("only names a web build of the same game", () => {
    const other = "fedcba9876543210fedcba9876543210";
    expect(() => createGamePlayToken({ userId: "u", gameId: other, buildPath: BUILD }, { masterKey: KEY })).toThrow(/same game/);
    for (const buildPath of [
      `game-builds/${GAME}/${"a".repeat(32)}-tauri-${"b".repeat(64)}`,
      `game-builds/${GAME}/../../secrets`,
      `${BUILD}/index.html`
    ]) {
      expect(() => createGamePlayToken({ userId: "u", gameId: GAME, buildPath }, { masterKey: KEY })).toThrow();
    }
  });
});
