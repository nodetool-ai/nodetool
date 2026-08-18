/**
 * `integrations` tRPC router — the browser half of account linking.
 *
 * The service routes are the bridge's surface and hold the service token; this
 * one is the user's, so every test here is really about scoping: the code a
 * user mints names that user, the code a user confirms links to that user, and
 * nobody reads or unlinks another user's row.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ExternalIdentity, ModelObserver, initTestDb } from "@nodetool-ai/models";

import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import { sharedLinkCodes } from "../src/lib/link-codes.js";

const createCaller = createCallerFactory(appRouter);

function makeCtx(userId: string | null): Context {
  return {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

let previousUsername: string | undefined;

beforeEach(() => {
  initTestDb();
  previousUsername = process.env.TELEGRAM_BOT_USERNAME;
});

afterEach(() => {
  ModelObserver.clear();
  if (previousUsername === undefined) {
    delete process.env.TELEGRAM_BOT_USERNAME;
  } else {
    process.env.TELEGRAM_BOT_USERNAME = previousUsername;
  }
});

describe("integrations.list", () => {
  it("returns only the signed-in user's identities", async () => {
    await ExternalIdentity.link({
      provider: "telegram",
      externalId: "tg-a",
      userId: "user-a"
    });
    await ExternalIdentity.link({
      provider: "telegram",
      externalId: "tg-b",
      userId: "user-b"
    });

    const res = await createCaller(makeCtx("user-a")).integrations.list();
    expect(res.identities).toHaveLength(1);
    expect(res.identities[0]).toMatchObject({
      provider: "telegram",
      external_id: "tg-a"
    });
    expect(res.identities[0].linked_at).toBeTruthy();
  });

  it("requires a session", async () => {
    await expect(
      createCaller(makeCtx(null)).integrations.list()
    ).rejects.toThrow(/Authentication required/);
  });
});

describe("integrations.createLinkCode", () => {
  it("renders a t.me deep link when the bot username is configured", async () => {
    process.env.TELEGRAM_BOT_USERNAME = "@NodeToolBot";

    const res = await createCaller(makeCtx("user-a")).integrations.createLinkCode(
      { provider: "telegram" }
    );

    expect(res.deep_link).toBe(`https://t.me/NodeToolBot?start=${res.code}`);
    expect(Date.parse(res.expires_at)).toBeGreaterThan(Date.now());
  });

  it("returns the bare code when no bot username is configured", async () => {
    delete process.env.TELEGRAM_BOT_USERNAME;

    const res = await createCaller(makeCtx("user-a")).integrations.createLinkCode(
      { provider: "telegram" }
    );

    expect(res.deep_link).toBeNull();
    expect(res.code).toBeTruthy();
  });

  it("binds the code to the minting user, for the bridge to redeem", async () => {
    const res = await createCaller(makeCtx("user-a")).integrations.createLinkCode(
      { provider: "telegram" }
    );

    expect(sharedLinkCodes.peek(res.code)).toMatchObject({
      kind: "user",
      provider: "telegram",
      userId: "user-a"
    });
  });
});

describe("integrations.describeLinkCode", () => {
  it("names the account a bridge-minted code belongs to", async () => {
    const { code } = sharedLinkCodes.mintForExternalAccount("telegram", "tg-7");

    const res = await createCaller(
      makeCtx("user-a")
    ).integrations.describeLinkCode({ code });
    expect(res).toEqual({ provider: "telegram", external_id: "tg-7" });

    // Describing must not spend it — the user still has to confirm.
    expect(sharedLinkCodes.peek(code)).not.toBeNull();
  });

  it("reports an unknown code as gone", async () => {
    await expect(
      createCaller(makeCtx("user-a")).integrations.describeLinkCode({
        code: "never-minted"
      })
    ).rejects.toThrow(/expired or was already used/);
  });

  it("does not describe a code the user minted themselves", async () => {
    const { code } = sharedLinkCodes.mintForUser("telegram", "user-a");
    await expect(
      createCaller(makeCtx("user-a")).integrations.describeLinkCode({ code })
    ).rejects.toThrow(/expired or was already used/);
  });
});

describe("integrations.confirmLink", () => {
  it("links the bridge's account to the confirming user", async () => {
    const { code } = sharedLinkCodes.mintForExternalAccount("telegram", "tg-7");

    const res = await createCaller(makeCtx("user-a")).integrations.confirmLink({
      provider: "telegram",
      code
    });
    expect(res).toEqual({ linked: true, external_id: "tg-7" });

    const stored = await ExternalIdentity.findByExternal("telegram", "tg-7");
    expect(stored!.user_id).toBe("user-a");
  });

  it("spends the code — a second confirm is gone", async () => {
    const { code } = sharedLinkCodes.mintForExternalAccount("telegram", "tg-7");
    const caller = createCaller(makeCtx("user-a"));

    await caller.integrations.confirmLink({ provider: "telegram", code });
    await expect(
      caller.integrations.confirmLink({ provider: "telegram", code })
    ).rejects.toThrow(/expired or was already used/);
  });

  it("refuses a code issued for another provider", async () => {
    const { code } = sharedLinkCodes.mintForExternalAccount("discord", "dc-1");
    await expect(
      createCaller(makeCtx("user-a")).integrations.confirmLink({
        provider: "telegram",
        code
      })
    ).rejects.toThrow(/different provider/);
  });
});

describe("integrations.unlink", () => {
  it("removes the user's own link", async () => {
    await ExternalIdentity.link({
      provider: "telegram",
      externalId: "tg-a",
      userId: "user-a"
    });

    const res = await createCaller(makeCtx("user-a")).integrations.unlink({
      provider: "telegram",
      external_id: "tg-a"
    });
    expect(res).toEqual({ unlinked: true });
    expect(await ExternalIdentity.findByExternal("telegram", "tg-a")).toBeNull();
  });

  it("will not unlink another user's account", async () => {
    await ExternalIdentity.link({
      provider: "telegram",
      externalId: "tg-a",
      userId: "user-a"
    });

    await expect(
      createCaller(makeCtx("user-b")).integrations.unlink({
        provider: "telegram",
        external_id: "tg-a"
      })
    ).rejects.toThrow(/not linked/);
    const stored = await ExternalIdentity.findByExternal("telegram", "tg-a");
    expect(stored!.user_id).toBe("user-a");
  });
});
