/**
 * Regression tests for the automation-nodes bug fixes.
 *
 * The headline issue: several nodes declared a single `output` slot in
 * `metadataOutputTypes` but `process()` returned different, flattened keys.
 * The graph editor only exposes declared slots as connectable handles, so the
 * real data was unreachable downstream. The existing e2e suite missed this
 * because it used these nodes as terminal sinks (which collect every returned
 * value regardless of slot name).
 *
 * The invariant asserted here — every key a node returns must be a declared
 * output slot — catches that whole class of bug.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  CreateTableLibNode,
  InsertLibNode,
  UpdateLibNode,
  DeleteLibNode,
  ExecuteSQLLibNode,
  SplitPathLibNode,
  SplitExtensionLibNode,
  WaitNode,
  IntervalTriggerNode
} from "@nodetool-ai/automation-nodes";

type NodeClassLike = {
  nodeType: string;
  metadataOutputTypes?: Record<string, string>;
};

function assertKeysDeclared(
  NodeClass: NodeClassLike,
  result: Record<string, unknown>
): void {
  const declared = Object.keys(NodeClass.metadataOutputTypes ?? {});
  for (const key of Object.keys(result)) {
    expect(
      declared,
      `${NodeClass.nodeType} returned undeclared output slot "${key}" — ` +
        `declared slots are [${declared.join(", ")}]`
    ).toContain(key);
  }
}

describe("SQLite nodes — returned keys match declared output slots", () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "an-slots-sqlite-"));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
  const ctx = (): ProcessingContext =>
    ({ workspaceDir: tmpDir }) as unknown as ProcessingContext;

  const COLUMNS = {
    columns: [
      { name: "id", data_type: "int" },
      { name: "name", data_type: "string" }
    ]
  };

  it("Insert / Update / Delete / Query / ExecuteSQL only emit declared slots", async () => {
    const create = new CreateTableLibNode();
    create.assign({
      database_name: "t.db",
      table_name: "items",
      columns: COLUMNS
    });
    assertKeysDeclared(CreateTableLibNode, await create.process(ctx()));

    const insert = new InsertLibNode();
    insert.assign({
      database_name: "t.db",
      table_name: "items",
      data: { name: "alice" }
    });
    const insRes = await insert.process(ctx());
    assertKeysDeclared(InsertLibNode, insRes);
    expect(insRes.rows_affected).toBe(1);
    expect(insRes.row_id).toBe(1);

    const update = new UpdateLibNode();
    update.assign({
      database_name: "t.db",
      table_name: "items",
      data: { name: "bob" },
      where: "id = 1"
    });
    const updRes = await update.process(ctx());
    assertKeysDeclared(UpdateLibNode, updRes);
    expect(updRes.rows_affected).toBe(1);

    const query = new ExecuteSQLLibNode();
    query.assign({ database_name: "t.db", sql: "SELECT * FROM items" });
    assertKeysDeclared(ExecuteSQLLibNode, await query.process(ctx()));

    const dml = new ExecuteSQLLibNode();
    dml.assign({
      database_name: "t.db",
      sql: "INSERT INTO items (name) VALUES (?)",
      parameters: ["carol"]
    });
    assertKeysDeclared(ExecuteSQLLibNode, await dml.process(ctx()));

    const del = new DeleteLibNode();
    del.assign({ database_name: "t.db", table_name: "items", where: "id = 1" });
    const delRes = await del.process(ctx());
    assertKeysDeclared(DeleteLibNode, delRes);
    expect(delRes.rows_affected).toBe(1);
  });

  it("Insert rejects empty data instead of building invalid SQL", async () => {
    const insert = new InsertLibNode();
    insert.assign({ database_name: "t.db", table_name: "items", data: {} });
    await expect(insert.process(ctx())).rejects.toThrow(/cannot be empty/i);
  });

  it("CreateTable rejects an empty column list", async () => {
    const create = new CreateTableLibNode();
    create.assign({
      database_name: "t.db",
      table_name: "empty",
      columns: { columns: [] }
    });
    await expect(create.process(ctx())).rejects.toThrow(/no columns/i);
  });
});

describe("Path split nodes — returned keys match declared output slots", () => {
  it("SplitPath emits dirname + basename", async () => {
    const node = new SplitPathLibNode();
    node.assign({ path: "/foo/bar/file.txt" });
    const result = await node.process();
    assertKeysDeclared(SplitPathLibNode, result);
    expect(result).toEqual({ dirname: "/foo/bar", basename: "file.txt" });
  });

  it("SplitExtension emits root + extension", async () => {
    const node = new SplitExtensionLibNode();
    node.assign({ path: "/foo/bar/file.txt" });
    const result = await node.process();
    assertKeysDeclared(SplitExtensionLibNode, result);
    expect(result).toEqual({ root: "/foo/bar/file", extension: ".txt" });
  });
});

describe("WaitNode — timeout 0 passes through without waiting", () => {
  it("returns the input immediately when timeout is 0", async () => {
    const node = new WaitNode();
    node.assign({ timeout_seconds: 0, input: "hello" });
    const start = Date.now();
    const result = await node.process();
    expect(Date.now() - start).toBeLessThan(500);
    expect(result.data).toBe("hello");
    expect(result.waited_seconds as number).toBeLessThan(0.5);
  });
});

describe("IntervalTrigger — emit_on_start=false respects the interval under drift compensation", () => {
  it("waits a full interval before the first tick rather than firing immediately", async () => {
    const node = new IntervalTriggerNode();
    node.assign({
      interval_seconds: 0.2,
      initial_delay_seconds: 0,
      emit_on_start: false,
      include_drift_compensation: true,
      max_events: 1
    });
    const start = Date.now();
    const events: Array<Record<string, unknown>> = [];
    for await (const event of node.genProcess()) {
      events.push(event);
    }
    const elapsed = Date.now() - start;
    expect(events).toHaveLength(1);
    expect(events[0].tick).toBe(1);
    // Pre-fix the first tick fired in ~1ms; it must now wait ~one interval.
    expect(elapsed).toBeGreaterThanOrEqual(150);
  });
});
