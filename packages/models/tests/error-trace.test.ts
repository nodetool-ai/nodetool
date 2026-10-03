import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { initTestDb } from "../src/db.js";
import { MigrationRunner, SQLiteMigrationAdapter } from "../src/migrations/index.js";
import {
  formatErrorReport,
  getErrorTrace,
  ingestErrorTraces,
  listErrorTraces,
  listUnsyncedErrorTraces,
  markErrorTracesSynced,
  pruneErrorTraces,
  recordErrorTrace,
  resetErrorTraceRateLimit,
  summarizeErrorTraces
} from "../src/error-trace.js";

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  initTestDb();
  resetErrorTraceRateLimit();
});

describe("recordErrorTrace", () => {
  it("stores a redacted row and never the raw secret", async () => {
    const row = await recordErrorTrace({
      userId: "u1",
      source: "trpc",
      errorType: "Error",
      message: "upstream rejected sk-proj-abcdefghijklmnopqrstuvwx for jane@example.com",
      stack: "    at call (/Users/jane/app/provider.js:3:7)",
      context: { route: "workflows.run", http_status: 500, prompt: "secret prompt" }
    });
    expect(row).not.toBeNull();
    const [stored] = await listErrorTraces("u1");
    expect(stored.message).not.toContain("sk-proj-");
    expect(stored.message).not.toContain("jane@example.com");
    expect(stored.stack).not.toContain("/Users/jane");
    expect(stored.context).toEqual({ route: "workflows.run", http_status: 500 });
    expect(stored.origin).toBe("local");
  });

  it("drops a flood of one error after the per-minute cap", async () => {
    const results = [];
    for (let i = 0; i < 15; i++) {
      results.push(
        await recordErrorTrace({ userId: "u1", source: "server", message: "same failure" })
      );
    }
    expect(results.filter(Boolean)).toHaveLength(10);
  });
});

describe("reads", () => {
  it("scopes every read to the caller", async () => {
    const mine = await recordErrorTrace({ userId: "u1", source: "job", message: "mine" });
    await recordErrorTrace({ userId: "u2", source: "job", message: "theirs" });

    expect((await listErrorTraces("u1")).map((t) => t.message)).toEqual(["mine"]);
    expect(await getErrorTrace("u2", mine!.id)).toEqual({
      ok: false,
      reason: "not_found"
    });
    const found = await getErrorTrace("u1", mine!.id.slice(0, 12));
    expect(found.ok && found.trace.id).toBe(mine!.id);
  });

  it("refuses an ambiguous short id", async () => {
    const a = await recordErrorTrace({ userId: "u1", source: "job", message: "a" });
    await recordErrorTrace({ userId: "u1", source: "job", message: "b" });
    // Force the prefix collision the shape of a real id makes unlikely.
    const { getRawDb } = await import("../src/db.js");
    getRawDb()
      .prepare("UPDATE nodetool_error_traces SET id = ? WHERE id != ?")
      .run(`${a!.id.slice(0, 12)}${"f".repeat(20)}`, a!.id);
    expect(await getErrorTrace("u1", a!.id.slice(0, 12))).toEqual({
      ok: false,
      reason: "ambiguous"
    });
  });

  it("groups by fingerprint with counts and first/last seen", async () => {
    await recordErrorTrace({ userId: "u1", source: "job", message: "Node 1 failed", createdAt: "2026-10-01T00:00:00.000Z" });
    await recordErrorTrace({ userId: "u1", source: "job", message: "Node 2 failed", createdAt: "2026-10-02T00:00:00.000Z" });
    await recordErrorTrace({ userId: "u1", source: "http", message: "other", createdAt: "2026-10-03T00:00:00.000Z" });
    const groups = await summarizeErrorTraces("u1");
    expect(groups.map((g) => [g.message, g.count])).toEqual([
      ["other", 1],
      ["Node 2 failed", 2]
    ]);
    expect(groups[1].first_seen).toBe("2026-10-01T00:00:00.000Z");
    expect(groups[1].last_seen).toBe("2026-10-02T00:00:00.000Z");
  });
});

describe("formatErrorReport", () => {
  it("renders stored fields and leaves out the user id", async () => {
    await recordErrorTrace({
      userId: "user-secret-id",
      source: "job",
      errorType: "TypeError",
      message: "x is undefined",
      stack: "    at a (b.js:1:1)",
      context: { job_id: "job42" }
    });
    const md = formatErrorReport(await listErrorTraces("user-secret-id"), {
      generatedAt: "now"
    });
    expect(md).toContain("### TypeError: x is undefined");
    expect(md).toContain("- job_id: job42");
    expect(md).toContain("at a (b.js:1:1)");
    expect(md).not.toContain("user-secret-id");
  });
});

describe("ingest and sync bookkeeping", () => {
  it("re-redacts ingested traces, stores them under the caller and never re-syncs them", async () => {
    const stored = await ingestErrorTraces("u1", [
      {
        source: "server",
        message: "token=abcdefghijklmnop leaked",
        createdAt: new Date(Date.now() + DAY_MS).toISOString()
      }
    ]);
    expect(stored).toBe(1);
    const [row] = await listErrorTraces("u1");
    expect(row.message).toBe("token=[REDACTED] leaked");
    expect(row.origin).toBe("ingest");
    expect(Date.parse(row.created_at)).toBeLessThanOrEqual(Date.now());
    expect(await listUnsyncedErrorTraces()).toEqual([]);
  });

  it("lists local traces until they are marked synced", async () => {
    const row = await recordErrorTrace({ userId: "u1", source: "server", message: "boom" });
    expect((await listUnsyncedErrorTraces()).map((t) => t.id)).toEqual([row!.id]);
    await markErrorTracesSynced([row!.id]);
    expect(await listUnsyncedErrorTraces()).toEqual([]);
  });
});

describe("pruneErrorTraces", () => {
  it("removes only traces older than the window", async () => {
    await recordErrorTrace({
      userId: "u1",
      source: "server",
      message: "old",
      createdAt: new Date(Date.now() - 40 * DAY_MS).toISOString()
    });
    await recordErrorTrace({ userId: "u1", source: "server", message: "new" });
    expect(await pruneErrorTraces(30)).toBe(1);
    expect((await listErrorTraces("u1")).map((t) => t.message)).toEqual(["new"]);
  });
});

describe("create_error_traces migration", () => {
  it("creates the table and indexes on SQLite without the Postgres RLS step", async () => {
    const sqlite = new Database(":memory:");
    const runner = new MigrationRunner(new SQLiteMigrationAdapter(sqlite));
    const applied = await runner.migrate();
    expect(applied).toContain("20261003_000002");
    const indexes = sqlite
      .prepare("SELECT name FROM pragma_index_list('nodetool_error_traces')")
      .all() as Array<{ name: string }>;
    const named = indexes
      .map((i) => i.name)
      .filter((name) => !name.startsWith("sqlite_autoindex"));
    expect(named.sort()).toEqual([
      "idx_error_trace_created",
      "idx_error_trace_fingerprint",
      "idx_error_trace_user_created"
    ]);
    sqlite.close();
  });
});
