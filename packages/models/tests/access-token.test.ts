import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import {
  AccessToken,
  isAccessToken,
  parseAccessToken
} from "../src/access-token.js";

describe("AccessToken model", () => {
  beforeEach(() => initTestDb());
  afterEach(() => {
    ModelObserver.clear();
    vi.useRealTimers();
  });

  it("mints a token that verifies as its owner", async () => {
    const { record, token } = await AccessToken.mint({
      userId: "user-a",
      name: "Claude Code"
    });

    expect(isAccessToken(token)).toBe(true);
    expect(token.startsWith(`ntk_${record.id}_`)).toBe(true);

    const verified = await AccessToken.verify(token);
    expect(verified).not.toBeNull();
    expect(verified!.user_id).toBe("user-a");
    expect(verified!.name).toBe("Claude Code");
  });

  it("never stores the secret half", async () => {
    const { record, token } = await AccessToken.mint({
      userId: "user-a",
      name: "Claude Code"
    });
    const secret = parseAccessToken(token)!.secret;

    expect(record.secret_hash).not.toContain(secret);
    expect(record.secret_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  // Calling CodeQL's js/insufficient-password-hash a false positive here rests
  // on the secret being long and random, not on the hash being slow. These two pin
  // that premise: shorten the secret or draw it from anything weaker than a
  // CSPRNG and the justification stops holding here, not in review.
  it("draws a secret long enough that a fast hash is not the weak link", async () => {
    const { token } = await AccessToken.mint({
      userId: "user-a",
      name: "entropy"
    });
    const secret = parseAccessToken(token)!.secret;

    // 32 bytes of base64url is 43 characters. Anything shorter means the
    // secret shrank and the "2^255 guesses" argument no longer applies.
    expect(secret.length).toBeGreaterThanOrEqual(43);
    expect(secret).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("never mints the same id or secret twice", async () => {
    const ids = new Set<string>();
    const secrets = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const { record, token } = await AccessToken.mint({
        userId: "user-a",
        name: `token ${i}`
      });
      ids.add(record.id);
      secrets.add(parseAccessToken(token)!.secret);
    }
    expect(ids.size).toBe(50);
    expect(secrets.size).toBe(50);
  });

  it("refuses a token whose secret does not match its id", async () => {
    const { record } = await AccessToken.mint({
      userId: "user-a",
      name: "Claude Code"
    });

    expect(await AccessToken.verify(`ntk_${record.id}_wrong-secret`)).toBeNull();
  });

  it("refuses a token whose id does not exist", async () => {
    expect(await AccessToken.verify("ntk_deadbeef_whatever")).toBeNull();
  });

  it("refuses tokens that are not ours, without touching the table", async () => {
    expect(await AccessToken.verify("ndt_delegated.sig")).toBeNull();
    expect(await AccessToken.verify("some-supabase-jwt")).toBeNull();
    expect(await AccessToken.verify("ntk_")).toBeNull();
    expect(await AccessToken.verify("ntk_no-separator")).toBeNull();
  });

  it("refuses an expired token and deletes the row", async () => {
    const { record, token } = await AccessToken.mint({
      userId: "user-a",
      name: "short-lived",
      expiresInDays: 1
    });
    expect(await AccessToken.verify(token)).not.toBeNull();

    vi.useFakeTimers();
    vi.setSystemTime(Date.parse(record.expires_at!) + 1000);

    expect(await AccessToken.verify(token)).toBeNull();
    expect(await AccessToken.listForUser("user-a")).toHaveLength(0);
  });

  it("mints a token with no expiry when none is asked for", async () => {
    const { record } = await AccessToken.mint({
      userId: "user-a",
      name: "forever"
    });
    expect(record.expires_at).toBeNull();
    expect(record.isExpired(Date.now() + 10 * 365 * 86_400_000)).toBe(false);
  });

  it("revokes a token so it no longer verifies", async () => {
    const { record, token } = await AccessToken.mint({
      userId: "user-a",
      name: "Claude Code"
    });

    expect(await AccessToken.revoke("user-a", record.id)).toBe(true);
    expect(await AccessToken.verify(token)).toBeNull();
    expect(await AccessToken.revoke("user-a", record.id)).toBe(false);
  });

  it("does not let one user revoke another's token", async () => {
    const { record, token } = await AccessToken.mint({
      userId: "user-a",
      name: "Claude Code"
    });

    expect(await AccessToken.revoke("user-b", record.id)).toBe(false);
    expect(await AccessToken.verify(token)).not.toBeNull();
  });

  it("lists only the owner's tokens, newest first", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    await AccessToken.mint({ userId: "user-a", name: "older" });
    vi.setSystemTime(new Date("2026-01-02T00:00:00.000Z"));
    await AccessToken.mint({ userId: "user-a", name: "newer" });
    await AccessToken.mint({ userId: "user-b", name: "someone else" });
    vi.useRealTimers();

    const tokens = await AccessToken.listForUser("user-a");
    expect(tokens.map((t) => t.name)).toEqual(["newer", "older"]);
  });

  it("records last use, and skips the write while the stamp is fresh", async () => {
    const { record, token } = await AccessToken.mint({
      userId: "user-a",
      name: "Claude Code"
    });
    expect(record.last_used_at).toBeNull();

    const start = Date.parse("2026-03-01T00:00:00.000Z");
    const verified = (await AccessToken.verify(token))!;
    await verified.touch(start);
    expect(verified.last_used_at).toBe(new Date(start).toISOString());

    // Within the minute: the in-memory value stays put rather than advancing.
    await verified.touch(start + 30_000);
    expect(verified.last_used_at).toBe(new Date(start).toISOString());

    await verified.touch(start + 61_000);
    expect(verified.last_used_at).toBe(new Date(start + 61_000).toISOString());

    const [persisted] = await AccessToken.listForUser("user-a");
    expect(persisted.last_used_at).toBe(new Date(start + 61_000).toISOString());
  });
});
