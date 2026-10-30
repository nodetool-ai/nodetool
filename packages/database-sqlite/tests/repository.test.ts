import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createSqliteRepository } from "../src/index.js";

describe("SQLite repository", () => {
  it("preserves unavailable node documents across restart in the legacy workflow table", async () => {
    const directory = mkdtempSync(join(tmpdir(), "lean-db-"));
    const path = join(directory, "db.sqlite");
    const graph = { nodes: [{ id: "node", type: "optional.Unavailable", properties: { nested: [false, 0, { untouched: true }] } }], edges: [], links: [{ arbitrary: "lineage" }] };
    let repository = createSqliteRepository(path);
    try {
      const created = await repository.put("workflows", "alice", { name: "saved", graph });
      expect(created.id).toMatch(/^[0-9a-f]{32}$/);
      repository.close();
      const legacy = new Database(path);
      const row = legacy.prepare("SELECT graph FROM nodetool_workflows WHERE id = ?").get(created.id);
      expect(row).toEqual({ graph: JSON.stringify(graph) });
      legacy.prepare("UPDATE nodetool_workflows SET name = ? WHERE id = ?").run("legacy edit", created.id);
      legacy.close();
      repository = createSqliteRepository(path);
      expect(await repository.get("workflows", "alice", created.id.slice(0, 12))).toMatchObject({ id: created.id, name: "legacy edit", graph });
      expect(await repository.get("workflows", "bob", created.id)).toBeNull();
      expect(await repository.delete("workflows", "bob", created.id)).toBe(false);
      await expect(repository.put("workflows", "bob", { id: created.id, graph: { nodes: [], edges: [] } })).rejects.toThrow("already owned");
      expect(await repository.get("workflows", "alice", created.id)).toMatchObject({ graph });
    } finally {
      repository.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("accepts only exact unique twelve-character resource prefixes in the owner scope", async () => {
    const repository = createSqliteRepository(":memory:");
    try {
      const first = "abcdef12345600000000000000000000";
      const second = "abcdef12345611111111111111111111";
      await repository.put("workflows", "alice", { id: first, graph: { nodes: [], edges: [] } });
      await repository.put("workflows", "bob", { id: second, graph: { nodes: [], edges: [] } });
      expect(await repository.get("workflows", "alice", first.slice(0, 12))).toMatchObject({ id: first });
      expect(await repository.get("workflows", "alice", first.slice(0, 11))).toBeNull();
      await repository.put("workflows", "alice", { id: "abcdef12345622222222222222222222", graph: { nodes: [], edges: [] } });
      await expect(repository.get("workflows", "alice", first.slice(0, 12))).rejects.toMatchObject({ code: "AMBIGUOUS_RESOURCE_ID" });
      expect(await repository.get("workflows", "alice", first)).toMatchObject({ id: first });
      await repository.put("workflows", "alice", { id: "personal:alice", graph: { nodes: [], edges: [] } });
      expect(await repository.get("workflows", "alice", "personal:alice")).toMatchObject({ id: "personal:alice" });
    } finally { repository.close(); }
  });

  it("upgrades historical execution tables without creating optional feature tables", async () => {
    const directory = mkdtempSync(join(tmpdir(), "lean-legacy-db-"));
    const path = join(directory, "db.sqlite");
    const legacy = new Database(path);
    legacy.exec(`CREATE TABLE nodetool_assets (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, metadata TEXT, created_at TEXT NOT NULL);
      INSERT INTO nodetool_assets VALUES ('legacy-asset', 'alice', '{"sketchDocumentId":"legacy-sketch"}', 'historical-time');`);
    legacy.close();
    const repository = createSqliteRepository(path);
    try {
      expect(await repository.get("assets", "alice", "legacy-asset")).toMatchObject({
        metadata: { sketchDocumentId: "legacy-sketch" }, sketch_document_id: "legacy-sketch", updated_at: "historical-time", project_id: "default", favorite: false
      });
      const native = new Database(path);
      expect(native.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all()).toEqual([
        { name: "_nodetool_core_migrations" }, { name: "nodetool_assets" }, { name: "nodetool_jobs" }, { name: "nodetool_secrets" }, { name: "nodetool_workflows" }
      ]);
      expect(native.prepare("SELECT COUNT(*) AS count FROM _nodetool_core_migrations").get()).toEqual({ count: 3 });
      native.close();
    } finally { repository.close(); rmSync(directory, { recursive: true, force: true }); }
  });

  it("rolls back historical repairs when an existing identity constraint is invalid", () => {
    const directory = mkdtempSync(join(tmpdir(), "lean-invalid-db-"));
    const path = join(directory, "db.sqlite");
    const legacy = new Database(path);
    legacy.exec(`CREATE TABLE nodetool_secrets (id TEXT PRIMARY KEY, user_id TEXT, key TEXT, encrypted_value TEXT);
      INSERT INTO nodetool_secrets VALUES ('first', 'alice', 'DUPLICATE', 'first-ciphertext');
      INSERT INTO nodetool_secrets VALUES ('second', 'alice', 'DUPLICATE', 'second-ciphertext');`);
    legacy.close();
    try {
      expect(() => createSqliteRepository(path)).toThrow("migration failed");
      const inspect = new Database(path);
      try {
        expect(inspect.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).toEqual([{ name: "nodetool_secrets" }]);
        expect(inspect.prepare("SELECT encrypted_value FROM nodetool_secrets ORDER BY id").all()).toEqual([{ encrypted_value: "first-ciphertext" }, { encrypted_value: "second-ciphertext" }]);
      } finally { inspect.close(); }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("round trips binary asset metadata, encrypted secrets, and job state", async () => {
    const repository = createSqliteRepository(":memory:");
    try {
      const asset = await repository.put("assets", "alice", { name: "binary.bin", content_type: "application/octet-stream", size: 4, metadata: { decoder: null } });
      expect(await repository.get("assets", "alice", asset.id)).toMatchObject({ size: 4, metadata: { decoder: null } });
      const secret = await repository.put("secrets", "alice", { key: "OPENAI_API_KEY", encrypted_value: "encrypted-ciphertext" });
      expect(await repository.get("secrets", "bob", secret.id)).toBeNull();
      const job = await repository.put("jobs", "alice", { workflow_id: "workflow", status: "running" });
      expect(await repository.put("jobs", "alice", { id: job.id, status: "cancelled" })).toMatchObject({ workflow_id: "workflow", status: "cancelled" });
    } finally { repository.close(); }
  });
});
