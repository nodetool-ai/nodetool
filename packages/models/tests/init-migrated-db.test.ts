import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { closeDb, initDb, initMigratedDb } from "../src/db.js";

function hasFavorite(path: string): boolean {
  const sqlite = new Database(path);
  try {
    const columns = sqlite.prepare("pragma table_info(nodetool_assets)").all() as { name: string }[];
    return columns.some((column) => column.name === "favorite");
  } finally {
    sqlite.close();
  }
}

describe("initMigratedDb", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await closeDb();
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("opens a new file with columns that initDb's baseline lacks", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nodetool-migrated-"));
    dirs.push(dir);
    initDb(join(dir, "baseline.sqlite3"));
    await closeDb();
    expect(hasFavorite(join(dir, "baseline.sqlite3"))).toBe(false);

    await initMigratedDb(join(dir, "migrated.sqlite3"));
    await closeDb();
    expect(hasFavorite(join(dir, "migrated.sqlite3"))).toBe(true);
  });
});
