import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  calls: [] as string[],
  migrate: vi.fn(),
  initialize: vi.fn(),
  unlock: vi.fn()
}));
vi.mock("@nodetool-ai/models", () => ({
  migrateSqliteDb: state.migrate,
  initDb: state.initialize
}));
vi.mock("@nodetool-ai/security", () => ({ initMasterKey: state.unlock, isKeychainBackendMissing: () => false }));
vi.mock("@nodetool-ai/config", () => ({ getDefaultDbPath: () => "/fixture/local.sqlite3" }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  state.calls.length = 0;
  state.migrate.mockImplementation(async (path: string) => { state.calls.push(`migrate:${path}`); });
  state.initialize.mockImplementation((path: string) => { state.calls.push(`initialize:${path}`); });
  state.unlock.mockImplementation(async () => { state.calls.push("unlock"); });
});
afterEach(() => { vi.restoreAllMocks(); });

describe("standalone command database startup", () => {
  it("finishes migration before opening the database and unlocking credentials", async () => {
    let releaseMigration: () => void = () => {};
    const migration = new Promise<void>((resolve) => { releaseMigration = resolve; });
    state.migrate.mockImplementation(async (path: string) => {
      state.calls.push(`migrate:${path}`);
      await migration;
    });
    const { setupCliDb } = await import("../src/local-db.js");
    const setup = setupCliDb();
    await vi.waitFor(() => { expect(state.migrate).toHaveBeenCalledOnce(); });
    expect(state.initialize).not.toHaveBeenCalled();
    expect(state.unlock).not.toHaveBeenCalled();
    releaseMigration();
    await setup;
    expect(state.calls).toEqual(["migrate:/fixture/local.sqlite3", "initialize:/fixture/local.sqlite3", "unlock"]);
  });

  it("shares local initialization and secret unlock across concurrent callers", async () => {
    const { setupLocalDb } = await import("../src/local-db.js");
    const first = setupLocalDb();
    expect(setupLocalDb()).toBe(first);
    await Promise.all([first, setupLocalDb()]);
    expect(state.initialize).toHaveBeenCalledOnce();
    expect(state.unlock).toHaveBeenCalledOnce();
    expect(state.migrate).toHaveBeenCalledOnce();
  });

  it("does not initialize or unlock credentials after migration fails", async () => {
    const failure = new Error("fixture migration failure");
    state.migrate.mockRejectedValue(failure);
    const { setupCliDb } = await import("../src/local-db.js");
    await expect(setupCliDb()).rejects.toBe(failure);
    expect(state.initialize).not.toHaveBeenCalled();
    expect(state.unlock).not.toHaveBeenCalled();
  });

  it("keeps the database usable when secret-store unlock fails and reports the cause", async () => {
    state.unlock.mockRejectedValue(new Error("fixture keychain unavailable"));
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const { setupCliDb, setupLocalDb } = await import("../src/local-db.js");
    await expect(setupCliDb()).resolves.toBeUndefined();
    await expect(setupLocalDb()).resolves.toBeUndefined();
    expect(state.initialize).toHaveBeenCalledOnce();
    expect(state.unlock).toHaveBeenCalledOnce();
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("fixture keychain unavailable"));
  });
});
