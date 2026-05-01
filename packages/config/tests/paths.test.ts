import { describe, it, expect, afterEach } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  getNodetoolDataDir,
  getDefaultDbPath,
  getPostgresDatabaseUrl,
  getDefaultVectorstoreDbPath,
  getDefaultAssetsPath,
  getAssetDomain,
  getTempDomain,
  buildAssetUrl
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
    saved.DATABASE_URL = process.env.DATABASE_URL;
    process.env.DB_PATH = "/override/my.db";
    delete process.env.DATABASE_URL;
    expect(getDefaultDbPath()).toBe("/override/my.db");
  });

  it("throws when DB_PATH and DATABASE_URL are both set", () => {
    saved.DB_PATH = process.env.DB_PATH;
    saved.DATABASE_URL = process.env.DATABASE_URL;
    process.env.DB_PATH = "/override/my.db";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost/nodetool";
    expect(() => getDefaultDbPath()).toThrow(/DB_PATH and DATABASE_URL/);
    expect(() => getPostgresDatabaseUrl()).toThrow(/DB_PATH and DATABASE_URL/);
  });

  it("uses DATABASE_URL when DB_PATH is not set", () => {
    saved.DB_PATH = process.env.DB_PATH;
    saved.DATABASE_URL = process.env.DATABASE_URL;
    delete process.env.DB_PATH;
    process.env.DATABASE_URL = "sqlite:///override/my.db";
    expect(getDefaultDbPath()).toBe("/override/my.db");
  });

  it("returns a PostgreSQL DATABASE_URL", () => {
    saved.DB_PATH = process.env.DB_PATH;
    saved.DATABASE_URL = process.env.DATABASE_URL;
    delete process.env.DB_PATH;
    process.env.DATABASE_URL = "postgresql://user:pass@localhost/nodetool";
    expect(getPostgresDatabaseUrl()).toBe(
      "postgresql://user:pass@localhost/nodetool"
    );
  });

  it("supports Prisma-style file DATABASE_URL values", () => {
    saved.DB_PATH = process.env.DB_PATH;
    saved.DATABASE_URL = process.env.DATABASE_URL;
    delete process.env.DB_PATH;
    process.env.DATABASE_URL = "file:./dev.db";
    expect(getDefaultDbPath()).toBe("./dev.db");
  });

  it("ignores non-SQLite DATABASE_URL values", () => {
    saved.DB_PATH = process.env.DB_PATH;
    saved.DATABASE_URL = process.env.DATABASE_URL;
    delete process.env.DB_PATH;
    process.env.DATABASE_URL = "postgres://localhost/nodetool";
    expect(getDefaultDbPath()).toBe(
      join(getNodetoolDataDir(), "nodetool.sqlite3")
    );
  });

  it("defaults to nodetool.sqlite3 inside data dir", () => {
    saved.DB_PATH = process.env.DB_PATH;
    saved.DATABASE_URL = process.env.DATABASE_URL;
    delete process.env.DB_PATH;
    delete process.env.DATABASE_URL;
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

describe("asset domain helpers", () => {
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const [key, val] of Object.entries(saved)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  function snapshot(): void {
    saved.ASSET_DOMAIN = process.env.ASSET_DOMAIN;
    saved.TEMP_DOMAIN = process.env.TEMP_DOMAIN;
  }

  it("getAssetDomain returns undefined when unset or empty", () => {
    snapshot();
    delete process.env.ASSET_DOMAIN;
    expect(getAssetDomain()).toBeUndefined();
    process.env.ASSET_DOMAIN = "   ";
    expect(getAssetDomain()).toBeUndefined();
  });

  it("getAssetDomain returns trimmed value when set", () => {
    snapshot();
    process.env.ASSET_DOMAIN = "  assets.nodetool.ai  ";
    expect(getAssetDomain()).toBe("assets.nodetool.ai");
  });

  it("getTempDomain returns trimmed value when set", () => {
    snapshot();
    process.env.TEMP_DOMAIN = "temp.nodetool.ai";
    expect(getTempDomain()).toBe("temp.nodetool.ai");
  });

  it("buildAssetUrl falls back to /api/storage path when no domain set", () => {
    snapshot();
    delete process.env.ASSET_DOMAIN;
    delete process.env.TEMP_DOMAIN;
    expect(buildAssetUrl("abc.png")).toBe("/api/storage/abc.png");
    expect(buildAssetUrl("temp/uuid.png")).toBe("/api/storage/temp/uuid.png");
  });

  it("buildAssetUrl strips leading slashes from the key", () => {
    snapshot();
    delete process.env.ASSET_DOMAIN;
    delete process.env.TEMP_DOMAIN;
    expect(buildAssetUrl("/abc.png")).toBe("/api/storage/abc.png");
    expect(buildAssetUrl("///temp/uuid.png")).toBe(
      "/api/storage/temp/uuid.png"
    );
  });

  it("buildAssetUrl uses ASSET_DOMAIN for permanent assets", () => {
    snapshot();
    process.env.ASSET_DOMAIN = "assets.nodetool.ai";
    delete process.env.TEMP_DOMAIN;
    expect(buildAssetUrl("abc.png")).toBe("https://assets.nodetool.ai/abc.png");
  });

  it("buildAssetUrl honours an explicit scheme on ASSET_DOMAIN", () => {
    snapshot();
    process.env.ASSET_DOMAIN = "http://localhost:9000/cdn";
    delete process.env.TEMP_DOMAIN;
    expect(buildAssetUrl("abc.png")).toBe("http://localhost:9000/cdn/abc.png");
  });

  it("buildAssetUrl routes temp/ keys to TEMP_DOMAIN and drops the prefix", () => {
    snapshot();
    process.env.ASSET_DOMAIN = "assets.nodetool.ai";
    process.env.TEMP_DOMAIN = "temp.nodetool.ai";
    expect(buildAssetUrl("temp/uuid.png")).toBe(
      "https://temp.nodetool.ai/uuid.png"
    );
    expect(buildAssetUrl("abc.png")).toBe("https://assets.nodetool.ai/abc.png");
  });

  it("buildAssetUrl falls back to ASSET_DOMAIN for temp/ when TEMP_DOMAIN is unset", () => {
    snapshot();
    process.env.ASSET_DOMAIN = "assets.nodetool.ai";
    delete process.env.TEMP_DOMAIN;
    // With no dedicated temp domain, the `temp/` prefix is preserved so the
    // same bucket can host both kinds of content.
    expect(buildAssetUrl("temp/uuid.png")).toBe(
      "https://assets.nodetool.ai/temp/uuid.png"
    );
  });

  it("buildAssetUrl uses TEMP_DOMAIN for temp/ even without ASSET_DOMAIN", () => {
    snapshot();
    delete process.env.ASSET_DOMAIN;
    process.env.TEMP_DOMAIN = "temp.nodetool.ai";
    expect(buildAssetUrl("temp/uuid.png")).toBe(
      "https://temp.nodetool.ai/uuid.png"
    );
    // Permanent assets still fall back to the API path.
    expect(buildAssetUrl("abc.png")).toBe("/api/storage/abc.png");
  });

  it("buildAssetUrl trims trailing slashes on the domain", () => {
    snapshot();
    process.env.ASSET_DOMAIN = "https://assets.nodetool.ai//";
    delete process.env.TEMP_DOMAIN;
    expect(buildAssetUrl("abc.png")).toBe("https://assets.nodetool.ai/abc.png");
  });
});
