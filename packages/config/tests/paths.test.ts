import { describe, it, expect, afterEach } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  getNodetoolDataDir,
  getDefaultDbPath,
  getDefaultVectorstoreDbPath,
  getDefaultAssetsPath
} from "../src/paths.js";

describe("getNodetoolDataDir", () => {
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const [key, val] of Object.entries(saved)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  it("uses XDG_DATA_HOME when set (non-Windows)", () => {
    if (process.platform === "win32") return; // skip on Windows CI
    saved.XDG_DATA_HOME = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = "/custom/data";
    expect(getNodetoolDataDir()).toBe("/custom/data/nodetool");
  });

  it("falls back to ~/.local/share on macOS/Linux without XDG_DATA_HOME", () => {
    if (process.platform === "win32") return;
    saved.XDG_DATA_HOME = process.env.XDG_DATA_HOME;
    delete process.env.XDG_DATA_HOME;
    expect(getNodetoolDataDir()).toBe(
      join(homedir(), ".local", "share", "nodetool")
    );
  });

  it("does NOT use ~/Library/Application Support on macOS (matches Python side)", () => {
    if (process.platform !== "darwin") return;
    saved.XDG_DATA_HOME = process.env.XDG_DATA_HOME;
    delete process.env.XDG_DATA_HOME;
    const dir = getNodetoolDataDir();
    expect(dir).not.toContain("Library/Application Support");
    expect(dir).toContain(".local/share/nodetool");
  });
});

describe("getDefaultDbPath", () => {
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const [key, val] of Object.entries(saved)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  it("uses DB_PATH env var when set", () => {
    saved.DB_PATH = process.env.DB_PATH;
    process.env.DB_PATH = "/override/my.db";
    expect(getDefaultDbPath()).toBe("/override/my.db");
  });

  it("defaults to nodetool.sqlite3 inside data dir", () => {
    saved.DB_PATH = process.env.DB_PATH;
    delete process.env.DB_PATH;
    expect(getDefaultDbPath()).toBe(
      join(getNodetoolDataDir(), "nodetool.sqlite3")
    );
  });
});

describe("getDefaultVectorstoreDbPath", () => {
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const [key, val] of Object.entries(saved)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  it("uses VECTORSTORE_DB_PATH env var when set", () => {
    saved.VECTORSTORE_DB_PATH = process.env.VECTORSTORE_DB_PATH;
    process.env.VECTORSTORE_DB_PATH = "/override/vec.db";
    expect(getDefaultVectorstoreDbPath()).toBe("/override/vec.db");
  });

  it("defaults to vectorstore.db inside data dir", () => {
    saved.VECTORSTORE_DB_PATH = process.env.VECTORSTORE_DB_PATH;
    delete process.env.VECTORSTORE_DB_PATH;
    expect(getDefaultVectorstoreDbPath()).toBe(
      join(getNodetoolDataDir(), "vectorstore.db")
    );
  });
});

describe("getDefaultAssetsPath", () => {
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const [key, val] of Object.entries(saved)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  it("uses ASSET_FOLDER env var when set", () => {
    saved.ASSET_FOLDER = process.env.ASSET_FOLDER;
    saved.STORAGE_PATH = process.env.STORAGE_PATH;
    process.env.ASSET_FOLDER = "/my/assets";
    delete process.env.STORAGE_PATH;
    expect(getDefaultAssetsPath()).toBe("/my/assets");
  });

  it("uses STORAGE_PATH when ASSET_FOLDER is not set", () => {
    saved.ASSET_FOLDER = process.env.ASSET_FOLDER;
    saved.STORAGE_PATH = process.env.STORAGE_PATH;
    delete process.env.ASSET_FOLDER;
    process.env.STORAGE_PATH = "/storage/path";
    expect(getDefaultAssetsPath()).toBe("/storage/path");
  });

  it("defaults to assets inside data dir", () => {
    saved.ASSET_FOLDER = process.env.ASSET_FOLDER;
    saved.STORAGE_PATH = process.env.STORAGE_PATH;
    delete process.env.ASSET_FOLDER;
    delete process.env.STORAGE_PATH;
    expect(getDefaultAssetsPath()).toBe(join(getNodetoolDataDir(), "assets"));
  });
});
