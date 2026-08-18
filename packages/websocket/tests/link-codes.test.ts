/**
 * The link-code store — the one place the two link directions meet.
 *
 * What the suite pins is that a code carries exactly the half its minter knew,
 * that spending it is single-use, and that expiry is decided by the injected
 * clock rather than by wall time.
 */
import { describe, expect, it } from "vitest";

import { LINK_CODE_TTL_MS, LinkCodeStore } from "../src/lib/link-codes.js";

describe("LinkCodeStore", () => {
  it("mints a code carrying the external account, awaiting a user", () => {
    const store = new LinkCodeStore();
    const { code } = store.mintForExternalAccount("telegram", "tg-1");

    expect(store.peek(code)).toMatchObject({
      kind: "external",
      provider: "telegram",
      externalId: "tg-1"
    });
  });

  it("mints a code carrying the user, awaiting an external account", () => {
    const store = new LinkCodeStore();
    const { code } = store.mintForUser("telegram", "user-a");

    expect(store.peek(code)).toMatchObject({
      kind: "user",
      provider: "telegram",
      userId: "user-a"
    });
  });

  it("spends a code once", () => {
    const store = new LinkCodeStore();
    const { code } = store.mintForUser("telegram", "user-a");

    expect(store.consume(code)).not.toBeNull();
    expect(store.consume(code)).toBeNull();
    expect(store.peek(code)).toBeNull();
  });

  it("peeking does not spend the code", () => {
    const store = new LinkCodeStore();
    const { code } = store.mintForExternalAccount("telegram", "tg-1");

    expect(store.peek(code)).not.toBeNull();
    expect(store.consume(code)).not.toBeNull();
  });

  it("expires a code after its TTL, on the injected clock", () => {
    let clock = 1_000_000;
    const store = new LinkCodeStore({ now: () => clock });
    const minted = store.mintForUser("telegram", "user-a");
    expect(minted.expiresAtMs).toBe(1_000_000 + LINK_CODE_TTL_MS);

    clock += LINK_CODE_TTL_MS - 1;
    expect(store.peek(minted.code)).not.toBeNull();

    clock += 2;
    expect(store.peek(minted.code)).toBeNull();
    expect(store.consume(minted.code)).toBeNull();
  });

  it("prunes expired codes rather than accumulating them", () => {
    let clock = 0;
    const store = new LinkCodeStore({ now: () => clock });
    store.mintForUser("telegram", "user-a");
    store.mintForExternalAccount("telegram", "tg-1");
    expect(store.size).toBe(2);

    clock += LINK_CODE_TTL_MS + 1;
    expect(store.size).toBe(0);
  });

  it("mints codes that differ", () => {
    const store = new LinkCodeStore();
    const codes = new Set(
      Array.from({ length: 50 }, () => store.mintForUser("telegram", "u").code)
    );
    expect(codes.size).toBe(50);
  });

  it("keeps an unknown code unknown", () => {
    const store = new LinkCodeStore();
    expect(store.peek("never-minted")).toBeNull();
    expect(store.consume("never-minted")).toBeNull();
  });
});
