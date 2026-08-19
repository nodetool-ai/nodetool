import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb, getDb } from "../src/db.js";
import { ExternalIdentity } from "../src/external-identity.js";
import { externalIdentities } from "../src/schema/external-identities.js";

describe("ExternalIdentity model", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("links an external account and reads it back", async () => {
    const linked = await ExternalIdentity.link({
      provider: "telegram",
      externalId: "12345",
      userId: "user-a"
    });

    expect(linked.id).toBeTruthy();
    expect(linked.linked_at).toBeTruthy();

    const found = await ExternalIdentity.findByExternal("telegram", "12345");
    expect(found).not.toBeNull();
    expect(found!.user_id).toBe("user-a");
    expect(found!.provider).toBe("telegram");
    expect(found!.external_id).toBe("12345");
  });

  it("returns null for an unlinked account", async () => {
    await ExternalIdentity.link({
      provider: "telegram",
      externalId: "12345",
      userId: "user-a"
    });
    expect(await ExternalIdentity.findByExternal("telegram", "999")).toBeNull();
    expect(await ExternalIdentity.findByExternal("discord", "12345")).toBeNull();
  });

  it("replaces rather than duplicates when the same pair is linked again", async () => {
    await ExternalIdentity.link({
      provider: "telegram",
      externalId: "12345",
      userId: "user-a"
    });
    await ExternalIdentity.link({
      provider: "telegram",
      externalId: "12345",
      userId: "user-b"
    });

    const rows = await getDb().select().from(externalIdentities);
    expect(rows).toHaveLength(1);

    const found = await ExternalIdentity.findByExternal("telegram", "12345");
    expect(found!.user_id).toBe("user-b");
    expect(await ExternalIdentity.listForUser("user-a")).toHaveLength(0);
    expect(await ExternalIdentity.listForUser("user-b")).toHaveLength(1);
  });

  it("lists every account linked to one user, across providers", async () => {
    await ExternalIdentity.link({
      provider: "telegram",
      externalId: "1",
      userId: "user-a"
    });
    await ExternalIdentity.link({
      provider: "telegram",
      externalId: "2",
      userId: "user-a"
    });
    await ExternalIdentity.link({
      provider: "discord",
      externalId: "3",
      userId: "user-a"
    });
    await ExternalIdentity.link({
      provider: "telegram",
      externalId: "4",
      userId: "user-b"
    });

    const mine = await ExternalIdentity.listForUser("user-a");
    expect(mine.map((row) => row.external_id).sort()).toEqual(["1", "2", "3"]);
    expect(await ExternalIdentity.listForUser("user-b")).toHaveLength(1);
    expect(await ExternalIdentity.listForUser("nobody")).toHaveLength(0);
  });

  it("unlinks one mapping and reports whether there was one", async () => {
    await ExternalIdentity.link({
      provider: "telegram",
      externalId: "12345",
      userId: "user-a"
    });
    await ExternalIdentity.link({
      provider: "telegram",
      externalId: "67890",
      userId: "user-a"
    });

    expect(await ExternalIdentity.unlink("telegram", "12345")).toBe(true);
    expect(await ExternalIdentity.findByExternal("telegram", "12345")).toBeNull();
    expect(await ExternalIdentity.listForUser("user-a")).toHaveLength(1);

    expect(await ExternalIdentity.unlink("telegram", "12345")).toBe(false);
  });

  it("derives the same row id for a pair regardless of link order", async () => {
    const first = await ExternalIdentity.link({
      provider: "telegram",
      externalId: "12345",
      userId: "user-a"
    });
    const second = await ExternalIdentity.link({
      provider: "telegram",
      externalId: "12345",
      userId: "user-b"
    });
    expect(second.id).toBe(first.id);
    expect(ExternalIdentity.rowId("telegram", "12345")).toBe(first.id);
    expect(ExternalIdentity.rowId("discord", "12345")).not.toBe(first.id);
  });

  it("round-trips through DBModel.get", async () => {
    const linked = await ExternalIdentity.link({
      provider: "telegram",
      externalId: "12345",
      userId: "user-a"
    });
    const loaded = await ExternalIdentity.get<ExternalIdentity>(linked.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.user_id).toBe("user-a");
  });
});
