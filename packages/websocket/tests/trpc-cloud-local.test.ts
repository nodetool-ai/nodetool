import { beforeEach, describe, expect, it } from "vitest";
import { initTestDb } from "@nodetool-ai/models";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const createCaller = createCallerFactory(appRouter);

function makeCtx(userId: string): Context {
  return {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

const SCOPE_A = { server_key: "a1b2c3d4e5f60718", account_id: "account-a" };
const SCOPE_B = { ...SCOPE_A, account_id: "account-b" };
const DOC = { kind: "workflow", document_id: "doc-1" };
const BASE = { updated_at: "2026-11-16T10:00:00.000Z", content_hash: "hash-0" };
const OPTIONS = { allow_history: false, allow_download: false, allow_duplicate: false };

describe("cloudLocal router", () => {
  beforeEach(() => initTestDb());

  it("stores, accepts and clears a draft", async () => {
    const caller = createCaller(makeCtx("1"));
    const { draft_id } = await caller.cloudLocal.drafts.put({
      ...SCOPE_A,
      ...DOC,
      base: BASE,
      draft: '{"nodes":[]}'
    });
    expect(draft_id).toMatch(/^[0-9a-f]{32}$/);
    const listed = await caller.cloudLocal.drafts.list({ ...SCOPE_A, state: "waiting" });
    expect(listed.drafts.map((d) => d.draft)).toEqual(['{"nodes":[]}']);

    const accepted = await caller.cloudLocal.drafts.accept({
      ...SCOPE_A,
      ...DOC,
      draft_id,
      sent_base: BASE,
      base: { updated_at: "2026-11-16T10:01:00.000Z", content_hash: "hash-1" },
      role: "owner",
      options: OPTIONS
    });
    expect(accepted.outcome).toBe("deleted");
    expect((await caller.cloudLocal.drafts.get({ ...SCOPE_A, ...DOC })).draft).toBeNull();
    const open = await caller.cloudLocal.openState.get({ ...SCOPE_A, ...DOC });
    expect(open.open_state?.base?.content_hash).toBe("hash-1");
  });

  // TC10 at the API: another account, or another local user, sees nothing.
  it("scopes rows to the account and the local user (TC10)", async () => {
    const one = createCaller(makeCtx("1"));
    await one.cloudLocal.drafts.put({ ...SCOPE_A, ...DOC, base: BASE, draft: "A" });
    expect((await one.cloudLocal.drafts.list(SCOPE_B)).drafts).toEqual([]);
    const other = createCaller(makeCtx("2"));
    expect((await other.cloudLocal.drafts.list(SCOPE_A)).drafts).toEqual([]);
    expect((await one.cloudLocal.drafts.list(SCOPE_A)).drafts).toHaveLength(1);
  });

  it("rejects a server key that is not 16 hex characters", async () => {
    const caller = createCaller(makeCtx("1"));
    await expect(
      caller.cloudLocal.drafts.list({ server_key: "https://example.com", account_id: "a" })
    ).rejects.toThrow();
  });
});
