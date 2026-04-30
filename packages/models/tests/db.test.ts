import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDb, getDb, getRawDb, initDb, initTestDb } from "../src/db.js";

describe("db", () => {
  let tempDir: string | null = null;

  beforeEach(async () => {
    await closeDb();
  });

  afterEach(async () => {
    await closeDb();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("throws when database accessors are used before initialization", () => {
    expect(() => getDb()).toThrow(/not initialized/i);
    expect(() => getRawDb()).toThrow(/not initialized/i);
  });

  it("initializes a file-backed database and exposes the raw connection", () => {
    tempDir = mkdtempSync(join(tmpdir(), "nodetool-models-db-"));
    const dbPath = join(tempDir, "models.sqlite");

    const db = initDb(dbPath);
    expect(db).toBe(getDb());
    expect(getRawDb().pragma("journal_mode", { simple: true })).toBe("wal");
    expect(initDb(dbPath)).toBe(db);
  });

  it("adds missing columns to existing tables during initDb", () => {
    tempDir = mkdtempSync(join(tmpdir(), "nodetool-models-db-"));
    const dbPath = join(tempDir, "upgrade.sqlite");

    const legacyDb = new Database(dbPath);
    legacyDb.exec(`
      CREATE TABLE "nodetool_workflows" (
        "id" text PRIMARY KEY NOT NULL,
        "user_id" text NOT NULL,
        "name" text NOT NULL DEFAULT '',
        "graph" text NOT NULL,
        "access" text NOT NULL DEFAULT 'private',
        "created_at" text NOT NULL,
        "updated_at" text NOT NULL
      );
      CREATE TABLE "nodetool_jobs" (
        "id" text PRIMARY KEY NOT NULL,
        "user_id" text NOT NULL,
        "workflow_id" text NOT NULL,
        "status" text NOT NULL DEFAULT 'scheduled',
        "created_at" text NOT NULL,
        "updated_at" text NOT NULL
      );
    `);
    legacyDb.close();

    initDb(dbPath);

    const sqlite = getRawDb();
    const workflowCols = (
      sqlite.pragma('table_info("nodetool_workflows")') as Array<{
        name: string;
      }>
    ).map((row) => row.name);
    expect(workflowCols).toContain("html_app");
    expect(workflowCols).toContain("receive_clipboard");
    expect(workflowCols).toContain("workspace_id");
    expect(workflowCols).toContain("tool_name");

    const jobCols = (
      sqlite.pragma('table_info("nodetool_jobs")') as Array<{ name: string }>
    ).map((row) => row.name);
    expect(jobCols).toContain("execution_strategy");
    expect(jobCols).toContain("execution_id");
    expect(jobCols).toContain("metadata_json");
    expect(jobCols).toContain("suspension_metadata_json");
  });

  it("closeDb resets both the drizzle and raw database handles", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "nodetool-models-db-"));
    const dbPath = join(tempDir, "close.sqlite");

    initDb(dbPath);
    await closeDb();

    expect(() => getDb()).toThrow(/not initialized/i);
    expect(() => getRawDb()).toThrow(/not initialized/i);
  });

  it("swallows close errors when replacing an existing test database", () => {
    initTestDb();
    const rawDb = getRawDb();
    const originalClose = rawDb.close.bind(rawDb);
    (rawDb as Database.Database & { close: () => void }).close = () => {
      throw new Error("close failed");
    };

    try {
      expect(() => initTestDb()).not.toThrow();
    } finally {
      (rawDb as Database.Database & { close: () => void }).close =
        originalClose;
      originalClose();
    }
  });

  it("swallows close errors when shutting down the active connection", async () => {
    initTestDb();
    const rawDb = getRawDb();
    const originalClose = rawDb.close.bind(rawDb);
    (rawDb as Database.Database & { close: () => void }).close = () => {
      throw new Error("close failed");
    };

    try {
      await expect(closeDb()).resolves.toBeUndefined();
      expect(() => getDb()).toThrow(/not initialized/i);
      expect(() => getRawDb()).toThrow(/not initialized/i);
    } finally {
      (rawDb as Database.Database & { close: () => void }).close =
        originalClose;
      originalClose();
    }
  });
});
