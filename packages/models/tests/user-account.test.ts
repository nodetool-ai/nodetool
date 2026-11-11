import { beforeEach, describe, expect, it } from "vitest";
import {
  getUserAccount,
  initTestDb,
  listUserAccounts,
  recordSignIn,
  touchUserLastSeen,
  updateUserAccount
} from "../src/index.js";

const at = (iso: string): Date => new Date(iso);

describe("user accounts", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("creates an active member at the first sign-in", async () => {
    const account = await recordSignIn(
      {
        userId: "u1",
        email: "ada@example.com",
        displayName: "Ada",
        authSource: "oidc",
        groups: ["staff"]
      },
      at("2026-11-01T10:00:00.000Z")
    );
    expect(account).toEqual({
      userId: "u1",
      email: "ada@example.com",
      displayName: "Ada",
      authSource: "oidc",
      groups: ["staff"],
      role: "member",
      status: "active",
      createdAt: "2026-11-01T10:00:00.000Z",
      updatedAt: "2026-11-01T10:00:00.000Z",
      lastSignInAt: "2026-11-01T10:00:00.000Z",
      lastSeenAt: "2026-11-01T10:00:00.000Z"
    });
  });

  it("refreshes the profile at a later sign-in and leaves role and status alone", async () => {
    await recordSignIn({ userId: "u1", authSource: "oidc", groups: ["a"] });
    await updateUserAccount("u1", { role: "admin", status: "disabled" });
    const again = await recordSignIn(
      { userId: "u1", email: "new@example.com", authSource: "oidc", groups: ["b"] },
      at("2026-11-02T10:00:00.000Z")
    );
    expect(again).toMatchObject({
      email: "new@example.com",
      groups: ["b"],
      role: "admin",
      status: "disabled",
      lastSignInAt: "2026-11-02T10:00:00.000Z"
    });
  });

  it("updates only an existing account", async () => {
    expect(await updateUserAccount("missing", { status: "disabled" })).toBeNull();
    await touchUserLastSeen("missing");
    expect(await getUserAccount("missing")).toBeNull();
  });

  it("searches email, name and id case-insensitively, with wildcards as text", async () => {
    await recordSignIn({ userId: "u1", email: "Ada@Example.com", authSource: "oidc" });
    await recordSignIn({ userId: "u2", displayName: "Grace_Hopper", authSource: "oidc" });
    await recordSignIn({ userId: "u3", email: "linus@example.org", authSource: "oidc" });

    const byEmail = await listUserAccounts({ query: "ada@EXAMPLE" });
    expect(byEmail.accounts.map((a) => a.userId)).toEqual(["u1"]);
    const byName = await listUserAccounts({ query: "grace_h" });
    expect(byName.accounts.map((a) => a.userId)).toEqual(["u2"]);
    // "_" would match any character if it were not escaped.
    expect((await listUserAccounts({ query: "e_h" })).total).toBe(1);
    expect((await listUserAccounts({ query: "%" })).total).toBe(0);
    expect((await listUserAccounts({ query: "u3" })).total).toBe(1);
  });

  it("filters by status and role and pages most recently seen first", async () => {
    await recordSignIn({ userId: "u1", authSource: "oidc" }, at("2026-11-01T00:00:00Z"));
    await recordSignIn({ userId: "u2", authSource: "oidc" }, at("2026-11-02T00:00:00Z"));
    await recordSignIn({ userId: "u3", authSource: "oidc" }, at("2026-11-03T00:00:00Z"));
    await touchUserLastSeen("u1", at("2026-11-04T00:00:00Z"));
    await updateUserAccount("u2", { status: "disabled" });
    await updateUserAccount("u3", { role: "admin" });

    const page = await listUserAccounts({ limit: 2 });
    expect(page.total).toBe(3);
    expect(page.accounts.map((a) => a.userId)).toEqual(["u1", "u3"]);
    expect((await listUserAccounts({ limit: 2, offset: 2 })).accounts.map((a) => a.userId)).toEqual(["u2"]);
    expect((await listUserAccounts({ status: "disabled" })).accounts.map((a) => a.userId)).toEqual(["u2"]);
    expect((await listUserAccounts({ role: "admin" })).accounts.map((a) => a.userId)).toEqual(["u3"]);
  });
});
