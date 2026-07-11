import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { Setting } from "../src/setting.js";

describe("Setting model", () => {
  beforeEach(() => {
    initTestDb();
  });
  afterEach(() => ModelObserver.clear());

  it("creates a setting via upsert with defaults applied", async () => {
    const setting = await Setting.upsert({
      userId: "user-1",
      key: "autosave",
      value: "true"
    });

    expect(setting.id).toBeTruthy();
    expect(setting.user_id).toBe("user-1");
    expect(setting.key).toBe("autosave");
    expect(setting.value).toBe("true");
    // description defaults to empty string when omitted
    expect(setting.description).toBe("");
    expect(setting.created_at).toBeTruthy();
    expect(setting.updated_at).toBeTruthy();
  });

  it("stores the value as plaintext (no encryption)", async () => {
    const setting = await Setting.upsert({
      userId: "user-1",
      key: "path",
      value: "/home/user/data"
    });

    expect(setting.getValue()).toBe("/home/user/data");
    const found = await Setting.find("user-1", "path");
    expect(found!.value).toBe("/home/user/data");
  });

  it("passes through a provided description on create", async () => {
    const setting = await Setting.upsert({
      userId: "user-1",
      key: "theme",
      value: "dark",
      description: "UI theme"
    });
    expect(setting.description).toBe("UI theme");
  });

  it("finds a setting by userId and key", async () => {
    await Setting.upsert({ userId: "user-1", key: "k1", value: "v1" });

    const found = await Setting.find("user-1", "k1");
    expect(found).not.toBeNull();
    expect(found!.key).toBe("k1");
    expect(found!.user_id).toBe("user-1");
    expect(found!.getValue()).toBe("v1");
  });

  it("returns null when a setting is not found", async () => {
    const found = await Setting.find("user-1", "MISSING");
    expect(found).toBeNull();
  });

  it("upsert updates an existing setting in place (same id)", async () => {
    const created = await Setting.upsert({
      userId: "user-1",
      key: "k",
      value: "original",
      description: "orig"
    });
    const createdId = created.id;

    const updated = await Setting.upsert({
      userId: "user-1",
      key: "k",
      value: "changed",
      description: "new"
    });

    expect(updated.id).toBe(createdId);
    expect(updated.value).toBe("changed");
    expect(updated.description).toBe("new");

    // Only one row should exist for this user+key.
    const all = await Setting.listForUser("user-1");
    expect(all).toHaveLength(1);
    expect(all[0].value).toBe("changed");
  });

  it("upsert keeps the existing description when none is passed on update", async () => {
    await Setting.upsert({
      userId: "user-1",
      key: "keepdesc",
      value: "a",
      description: "keep me"
    });

    const updated = await Setting.upsert({
      userId: "user-1",
      key: "keepdesc",
      value: "b"
    });

    // description is undefined on the update call, so it stays unchanged
    expect(updated.description).toBe("keep me");
    expect(updated.value).toBe("b");
  });

  it("upsert normalizes a null description to an empty string on update", async () => {
    await Setting.upsert({
      userId: "user-1",
      key: "nulldesc",
      value: "a",
      description: "before"
    });

    const updated = await Setting.upsert({
      userId: "user-1",
      key: "nulldesc",
      value: "b",
      description: null as unknown as string
    });

    expect(updated.description).toBe("");
  });

  it("beforeSave refreshes updated_at on save", async () => {
    const setting = await Setting.upsert({
      userId: "user-1",
      key: "ts",
      value: "v"
    });
    const original = setting.updated_at;
    // Force a distinct timestamp then re-save.
    setting.value = "v2";
    setting.updated_at = "2000-01-01T00:00:00.000Z";
    await setting.save();
    expect(setting.updated_at).not.toBe("2000-01-01T00:00:00.000Z");
    expect(new Date(setting.updated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(original).getTime()
    );
  });

  it("deletes a setting and reports true", async () => {
    await Setting.upsert({ userId: "user-1", key: "del", value: "x" });

    const deleted = await Setting.deleteSetting("user-1", "del");
    expect(deleted).toBe(true);

    const found = await Setting.find("user-1", "del");
    expect(found).toBeNull();
  });

  it("returns false when deleting a non-existent setting", async () => {
    const deleted = await Setting.deleteSetting("user-1", "NOPE");
    expect(deleted).toBe(false);
  });

  it("lists all settings for a single user only", async () => {
    await Setting.upsert({ userId: "user-1", key: "A", value: "1" });
    await Setting.upsert({ userId: "user-1", key: "B", value: "2" });
    await Setting.upsert({ userId: "user-2", key: "C", value: "3" });

    const settings = await Setting.listForUser("user-1");
    expect(settings).toHaveLength(2);
    const keys = settings.map((s) => s.key).sort();
    expect(keys).toEqual(["A", "B"]);
  });

  it("returns an empty list for a user with no settings", async () => {
    const settings = await Setting.listForUser("nobody");
    expect(settings).toEqual([]);
  });

  it("isolates settings with the same key across users", async () => {
    await Setting.upsert({ userId: "user-1", key: "shared", value: "one" });
    await Setting.upsert({ userId: "user-2", key: "shared", value: "two" });

    const s1 = await Setting.find("user-1", "shared");
    const s2 = await Setting.find("user-2", "shared");
    expect(s1!.getValue()).toBe("one");
    expect(s2!.getValue()).toBe("two");
  });

  it("constructor fills defaults for id/description/timestamps but respects supplied values", () => {
    const supplied = new Setting({
      id: "fixed-id",
      user_id: "u",
      key: "k",
      value: "v",
      description: "d",
      created_at: "2021-01-01T00:00:00.000Z",
      updated_at: "2021-01-01T00:00:00.000Z"
    });
    expect(supplied.id).toBe("fixed-id");
    expect(supplied.description).toBe("d");
    expect(supplied.created_at).toBe("2021-01-01T00:00:00.000Z");

    const bare = new Setting({ user_id: "u", key: "k", value: "v" });
    expect(bare.id).toBeTruthy();
    expect(bare.description).toBe("");
    expect(bare.created_at).toBeTruthy();
    expect(bare.updated_at).toBeTruthy();
  });
});
