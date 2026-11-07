import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PERMISSION_SUBJECT,
  PERMISSION_FLAGS,
  getEffectivePermissions,
  getPermissionOverrides,
  initTestDb,
  setPermissionOverrides,
  userPermissions
} from "../src/index.js";
import { getPortableDb } from "../src/db.js";

const USER = "a".repeat(32);
const OTHER = "b".repeat(32);

describe("user permissions", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("allows every flag when no admin has set anything", async () => {
    const { flags, overrides } = await getEffectivePermissions(USER);
    expect(overrides).toEqual({});
    for (const flag of PERMISSION_FLAGS) expect(flags[flag]).toBe(true);
  });

  it("applies the default, then the user's own overrides flag by flag", async () => {
    await setPermissionOverrides(
      DEFAULT_PERMISSION_SUBJECT,
      { install_packs: false, share_public: false },
      "admin"
    );
    await setPermissionOverrides(USER, { share_public: true, use_llm: false }, "admin");

    const user = await getEffectivePermissions(USER);
    expect(user.overrides).toEqual({ share_public: true, use_llm: false });
    expect(user.flags).toMatchObject({
      install_packs: false,
      share_public: true,
      use_llm: false,
      generate_media: true
    });

    const other = await getEffectivePermissions(OTHER);
    expect(other.overrides).toEqual({});
    expect(other.flags).toMatchObject({
      install_packs: false,
      share_public: false,
      use_llm: true
    });
  });

  it("replaces a row's overrides and removes the row when none remain", async () => {
    await setPermissionOverrides(USER, { use_llm: false, publish_apps: false }, "admin");
    await setPermissionOverrides(USER, { publish_apps: false }, "admin-2");
    expect(await getPermissionOverrides(USER)).toEqual({ publish_apps: false });

    await setPermissionOverrides(USER, {}, "admin");
    expect(await getPermissionOverrides(USER)).toEqual({});
    expect(await getPortableDb().select().from(userPermissions)).toEqual([]);
  });

  it("drops unknown flags and non-boolean values", async () => {
    const stored = await setPermissionOverrides(
      USER,
      { use_llm: false, nope: false, share_links: "no" } as never,
      "admin"
    );
    expect(stored).toEqual({ use_llm: false });
  });
});
