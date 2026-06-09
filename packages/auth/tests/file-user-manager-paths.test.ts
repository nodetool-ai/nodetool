/**
 * Path-resolution tests for FileUserManager's `defaultUsersFilePath()`.
 *
 * These exercise the platform/env branches that pick where users.json lives.
 * `node:os` is mocked so `homedir()` points at a throwaway temp dir, letting us
 * assert the exact computed path without touching the real home directory.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  const path = await import("node:path");
  const mockHome = path.join(actual.tmpdir(), "nodetool-auth-paths-home");
  return { ...actual, homedir: () => mockHome };
});

// homedir() now resolves to the mocked path; capture it for assertions.
import { homedir } from "node:os";
import { FileUserManager } from "../src/file-user-manager.js";

const MOCK_HOME = homedir();
const originalPlatform = process.platform;

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value: platform,
    configurable: true
  });
}

afterEach(async () => {
  setPlatform(originalPlatform);
  delete process.env["USERS_FILE"];
  delete process.env["APPDATA"];
  await rm(MOCK_HOME, { recursive: true, force: true });
});

describe("FileUserManager default path resolution", () => {
  it("uses ~/.config/nodetool/users.json on non-Windows platforms", async () => {
    delete process.env["USERS_FILE"];
    setPlatform("linux");

    const manager = new FileUserManager();
    await manager.addUser("linux-user");

    const expected = join(MOCK_HOME, ".config", "nodetool", "users.json");
    expect(existsSync(expected)).toBe(true);
  });

  it("uses %APPDATA%/nodetool/users.json on Windows when APPDATA is set", async () => {
    delete process.env["USERS_FILE"];
    const appdata = join(MOCK_HOME, "appdata-custom");
    process.env["APPDATA"] = appdata;
    setPlatform("win32");

    const manager = new FileUserManager();
    await manager.addUser("win-user");

    const expected = join(appdata, "nodetool", "users.json");
    expect(existsSync(expected)).toBe(true);
  });

  it("falls back to ~/AppData/Roaming on Windows when APPDATA is unset", async () => {
    delete process.env["USERS_FILE"];
    delete process.env["APPDATA"];
    setPlatform("win32");

    const manager = new FileUserManager();
    await manager.addUser("win-fallback-user");

    const expected = join(
      MOCK_HOME,
      "AppData",
      "Roaming",
      "nodetool",
      "users.json"
    );
    expect(existsSync(expected)).toBe(true);
  });

  it("honours USERS_FILE over the computed default path", async () => {
    const target = join(MOCK_HOME, "explicit", "users.json");
    process.env["USERS_FILE"] = target;
    setPlatform("linux");

    const manager = new FileUserManager();
    await manager.addUser("explicit-user");

    // The file must land at USERS_FILE, not the platform default (kills the
    // `if (envPath) return envPath` condition-removal mutants).
    expect(existsSync(target)).toBe(true);
  });
});
