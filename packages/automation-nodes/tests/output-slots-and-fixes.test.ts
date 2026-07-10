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
import type { ProcessingContext, StreamingOutputs } from "@nodetool-ai/runtime";
import type { TriggerEvent } from "@nodetool-ai/node-sdk";
import {
  CreateTableLibNode,
  InsertLibNode,
  UpdateLibNode,
  DeleteLibNode,
  ExecuteSQLLibNode,
  SplitPathLibNode,
  SplitExtensionLibNode,
  WaitNode,
  ManualTriggerNode,
  IntervalTriggerNode,
  WebhookTriggerNode,
  FileWatchTriggerNode
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

// ---------------------------------------------------------------------------
// Trigger entry point — emitTriggerEvent maps payload onto declared slots
// ---------------------------------------------------------------------------

function makeStubOutputs(): {
  outputs: StreamingOutputs;
  emitted: Record<string, unknown>;
} {
  const emitted: Record<string, unknown> = {};
  const outputs = {
    async emit(slot: string, value: unknown): Promise<void> {
      emitted[slot] = value;
    },
    async emitGroup(): Promise<void> {},
    async forward(): Promise<void> {},
    async drop(): Promise<void> {},
    complete(): void {}
  } as unknown as StreamingOutputs;
  return { outputs, emitted };
}

describe("Trigger nodes — isTrigger flag and emitTriggerEvent slot mapping", () => {
  it("marks the four trigger nodes as triggers (and not WaitNode)", () => {
    expect(ManualTriggerNode.isTrigger).toBe(true);
    expect(IntervalTriggerNode.isTrigger).toBe(true);
    expect(WebhookTriggerNode.isTrigger).toBe(true);
    expect(FileWatchTriggerNode.isTrigger).toBe(true);
    expect(WaitNode.isTrigger).toBe(false);
  });

  it("ManualTrigger maps payload onto declared slots", async () => {
    const node = new ManualTriggerNode();
    node.assign({ name: "my_trigger" });
    const { outputs, emitted } = makeStubOutputs();
    const event: TriggerEvent = {
      node_id: "n1",
      input_id: "i1",
      payload: { data: { hello: "world" } }
    };
    await node.emitTriggerEvent(event, outputs);
    assertKeysDeclared(ManualTriggerNode, emitted);
    expect(emitted.data).toEqual({ hello: "world" });
    expect(emitted.source).toBe("my_trigger");
    expect(emitted.event_type).toBe("manual");
    expect(typeof emitted.timestamp).toBe("string");
  });

  it("ManualTrigger uses the whole payload as data when no data key", async () => {
    const node = new ManualTriggerNode();
    const { outputs, emitted } = makeStubOutputs();
    await node.emitTriggerEvent(
      { node_id: "n1", input_id: "i1", payload: "raw-value" },
      outputs
    );
    assertKeysDeclared(ManualTriggerNode, emitted);
    expect(emitted.data).toBe("raw-value");
  });

  it("IntervalTrigger synthesizes a tick event onto declared slots", async () => {
    const node = new IntervalTriggerNode();
    node.assign({ interval_seconds: 30 });
    const { outputs, emitted } = makeStubOutputs();
    await node.emitTriggerEvent(
      { node_id: "n1", input_id: "i1", payload: { tick: 5 } },
      outputs
    );
    assertKeysDeclared(IntervalTriggerNode, emitted);
    expect(emitted.tick).toBe(5);
    expect(emitted.interval_seconds).toBe(30);
    expect(emitted.source).toBe("interval");
    expect(emitted.event_type).toBe("tick");
  });

  it("IntervalTrigger defaults tick to 1 with an empty payload", async () => {
    const node = new IntervalTriggerNode();
    const { outputs, emitted } = makeStubOutputs();
    await node.emitTriggerEvent(
      { node_id: "n1", input_id: "i1", payload: {} },
      outputs
    );
    assertKeysDeclared(IntervalTriggerNode, emitted);
    expect(emitted.tick).toBe(1);
  });

  it("WebhookTrigger maps the request onto declared slots", async () => {
    const node = new WebhookTriggerNode();
    const { outputs, emitted } = makeStubOutputs();
    await node.emitTriggerEvent(
      {
        node_id: "n1",
        input_id: "i1",
        payload: {
          body: { a: 1 },
          headers: { "content-type": "application/json" },
          query: { q: "x" },
          method: "PUT",
          path: "/hook"
        }
      },
      outputs
    );
    assertKeysDeclared(WebhookTriggerNode, emitted);
    expect(emitted.body).toEqual({ a: 1 });
    expect(emitted.method).toBe("PUT");
    expect(emitted.path).toBe("/hook");
    expect(emitted.event_type).toBe("webhook");
    expect(typeof emitted.timestamp).toBe("string");
  });

  it("WebhookTrigger fills missing fields with defaults", async () => {
    const node = new WebhookTriggerNode();
    const { outputs, emitted } = makeStubOutputs();
    await node.emitTriggerEvent(
      { node_id: "n1", input_id: "i1", payload: { body: "hi" } },
      outputs
    );
    assertKeysDeclared(WebhookTriggerNode, emitted);
    expect(emitted.body).toBe("hi");
    expect(emitted.method).toBe("POST");
    expect(emitted.headers).toEqual({});
    expect(emitted.query).toEqual({});
    expect(emitted.event_type).toBe("webhook");
  });

  it("FileWatchTrigger maps a filesystem event onto declared slots", async () => {
    const node = new FileWatchTriggerNode();
    const { outputs, emitted } = makeStubOutputs();
    await node.emitTriggerEvent(
      {
        node_id: "n1",
        input_id: "i1",
        payload: {
          event: "created",
          path: "/tmp/x.txt",
          is_directory: false
        }
      },
      outputs
    );
    assertKeysDeclared(FileWatchTriggerNode, emitted);
    expect(emitted.event).toBe("created");
    expect(emitted.path).toBe("/tmp/x.txt");
    expect(emitted.dest_path).toBe("");
    expect(emitted.is_directory).toBe(false);
    expect(typeof emitted.timestamp).toBe("string");
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
