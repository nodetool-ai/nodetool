import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  closeDb,
  initDb,
  RunInboxMessage,
  TriggerInput
} from "@nodetool-ai/models";
import {
  DurableInbox,
  TriggerWakeupService,
  type DurableInboxStore,
  type TriggerInputStore,
  type TriggerInput as KernelTriggerInput
} from "@nodetool-ai/kernel";
import {
  DrizzleDurableInboxStore,
  DrizzleTriggerInputStore
} from "../src/triggers/stores.js";

let dbDir: string;
let dbPath: string;

function input(
  overrides: Partial<KernelTriggerInput> = {}
): KernelTriggerInput {
  return {
    runId: "r1",
    nodeId: "n1",
    inputId: "i1",
    payload: { a: 1 },
    processed: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides
  };
}

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), "trigger-stores-"));
  dbPath = join(dbDir, "test.sqlite3");
  initDb(dbPath);
});

afterEach(() => {
  closeDb();
  rmSync(dbDir, { recursive: true, force: true });
});

describe("DrizzleTriggerInputStore", () => {
  it("satisfies TriggerInputStore", () => {
    const store: TriggerInputStore = new DrizzleTriggerInputStore();
    expect(typeof store.insertIfAbsent).toBe("function");
    expect(typeof store.findUnprocessed).toBe("function");
    expect(typeof store.markProcessed).toBe("function");
    expect(typeof store.cleanupProcessed).toBe("function");
    expect(typeof store.has).toBe("function");
    expect(typeof store.hasInputsFor).toBe("function");
    expect(typeof store.deleteRun).toBe("function");
  });

  it("has() answers for processed and unprocessed rows alike", async () => {
    const store = new DrizzleTriggerInputStore();
    expect(await store.has("i1")).toBe(false);
    await store.insertIfAbsent(input());
    expect(await store.has("i1")).toBe(true);
    await store.markProcessed("i1");
    expect(await store.has("i1")).toBe(true);
  });

  it("hasInputsFor() and deleteRun() scope to the run", async () => {
    const store = new DrizzleTriggerInputStore();
    await store.insertIfAbsent(input({ inputId: "a" }));
    await store.insertIfAbsent(input({ inputId: "b", runId: "r2" }));

    expect(await store.hasInputsFor("r1", "n1")).toBe(true);
    expect(await store.hasInputsFor("r1", "n2")).toBe(false);

    await store.deleteRun("r1");
    expect(await store.hasInputsFor("r1", "n1")).toBe(false);
    expect(await store.hasInputsFor("r2", "n1")).toBe(true);
  });

  it("backs a TriggerWakeupService so delivered events land in trigger_inputs", async () => {
    const service = new TriggerWakeupService(
      new DrizzleDurableInboxStore(),
      new DrizzleTriggerInputStore()
    );

    expect(
      await service.deliverTriggerInput({
        runId: "wf-1",
        nodeId: "node-1",
        inputId: "evt-1",
        payload: { hello: 1 }
      })
    ).toBe(true);

    const row = await TriggerInput.findByInputId("evt-1");
    expect(row).not.toBeNull();
    expect(row?.run_id).toBe("wf-1");
    expect(row?.node_id).toBe("node-1");
    expect(row?.processed).toBe(0);
    expect(row?.payload_json).toEqual({ hello: 1 });

    // Idempotency now survives a fresh service over the same database.
    const restarted = new TriggerWakeupService(
      new DrizzleDurableInboxStore(),
      new DrizzleTriggerInputStore()
    );
    expect(
      await restarted.deliverTriggerInput({
        runId: "wf-1",
        nodeId: "node-1",
        inputId: "evt-1",
        payload: { hello: 2 }
      })
    ).toBe(false);
  });

  it("persists an input and reads it back unprocessed", async () => {
    const store = new DrizzleTriggerInputStore();
    expect(await store.insertIfAbsent(input({ cursor: "c1" }))).toBe(true);

    const pending = await store.findUnprocessed("r1", "n1");
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      runId: "r1",
      nodeId: "n1",
      inputId: "i1",
      payload: { a: 1 },
      cursor: "c1",
      processed: false
    });
    expect(pending[0].createdAt).toBeInstanceOf(Date);
  });

  it("returns false for a duplicate input_id instead of throwing", async () => {
    const store = new DrizzleTriggerInputStore();
    expect(await store.insertIfAbsent(input())).toBe(true);
    expect(await store.insertIfAbsent(input({ payload: { a: 2 } }))).toBe(
      false
    );

    const rows = await TriggerInput.findUnprocessed(10);
    expect(rows).toHaveLength(1);
    expect(rows[0].payload_json).toEqual({ a: 1 });
  });

  it("findUnprocessed filters by run and node, oldest first, honoring the limit", async () => {
    const store = new DrizzleTriggerInputStore();
    await store.insertIfAbsent(
      input({ inputId: "b", createdAt: new Date("2026-01-01T00:00:02.000Z") })
    );
    await store.insertIfAbsent(
      input({ inputId: "a", createdAt: new Date("2026-01-01T00:00:01.000Z") })
    );
    await store.insertIfAbsent(input({ inputId: "other-node", nodeId: "n2" }));
    await store.insertIfAbsent(input({ inputId: "other-run", runId: "r2" }));

    expect(
      (await store.findUnprocessed("r1", "n1")).map((i) => i.inputId)
    ).toEqual(["a", "b"]);
    expect(await store.findUnprocessed("r1", "n1", 1)).toHaveLength(1);
    expect(
      (await store.findUnprocessed("r1", "n2")).map((i) => i.inputId)
    ).toEqual(["other-node"]);
  });

  it("markProcessed excludes the input and is a no-op for unknown ids", async () => {
    const store = new DrizzleTriggerInputStore();
    await store.insertIfAbsent(input({ inputId: "i1" }));
    await store.insertIfAbsent(input({ inputId: "i2" }));

    await store.markProcessed("i1");
    await expect(store.markProcessed("nope")).resolves.toBeUndefined();

    expect(
      (await store.findUnprocessed("r1", "n1")).map((i) => i.inputId)
    ).toEqual(["i2"]);
    const row = await TriggerInput.findByInputId("i1");
    expect(row?.processed).toBe(1);
    expect(row?.processed_at).toBeTruthy();
  });

  it("cleanupProcessed removes only old processed inputs of that (run, node)", async () => {
    const store = new DrizzleTriggerInputStore();
    await store.insertIfAbsent(input({ inputId: "old" }));
    await store.insertIfAbsent(input({ inputId: "unprocessed" }));
    await store.insertIfAbsent(input({ inputId: "other-run", runId: "r2" }));
    await store.markProcessed("old");
    await store.markProcessed("other-run");

    // An hour-old cutoff keeps the just-processed rows.
    expect(await store.cleanupProcessed("r1", "n1", 1)).toBe(0);
    // A zero-hour cutoff is "everything processed before now".
    await new Promise((r) => setTimeout(r, 2));
    expect(await store.cleanupProcessed("r1", "n1", 0)).toBe(1);
    expect(await store.cleanupProcessed("r1", "n1", 0)).toBe(0);

    expect(await TriggerInput.findByInputId("old")).toBeNull();
    expect(await TriggerInput.findByInputId("unprocessed")).not.toBeNull();
    expect(await TriggerInput.findByInputId("other-run")).not.toBeNull();
  });
});

describe("DrizzleDurableInboxStore", () => {
  it("satisfies DurableInboxStore and round-trips a message", async () => {
    const store: DurableInboxStore = new DrizzleDurableInboxStore();
    await store.save({
      id: "m1",
      runId: "r1",
      nodeId: "n1",
      handle: "trigger",
      messageId: "m1",
      seq: 1,
      payload: { hello: 1 },
      status: "pending",
      createdAt: new Date("2026-01-01T00:00:00.000Z")
    });

    const found = await store.findByMessageId("m1");
    expect(found).toMatchObject({
      messageId: "m1",
      runId: "r1",
      nodeId: "n1",
      handle: "trigger",
      seq: 1,
      payload: { hello: 1 },
      status: "pending"
    });
    expect(await store.findByMessageId("missing")).toBeNull();
  });

  it("append through DurableInbox preserves msg_seq ordering", async () => {
    const store = new DrizzleDurableInboxStore();
    const inbox = new DurableInbox("r1", "n1", store);

    for (const i of [1, 2, 3]) {
      await inbox.append("trigger", { i }, `trigger-${i}`);
    }

    const pending = await store.findPending("r1", "n1", "trigger", 100);
    expect(pending.map((m) => m.seq)).toEqual([1, 2, 3]);
    expect(pending.map((m) => m.payload)).toEqual([
      { i: 1 },
      { i: 2 },
      { i: 3 }
    ]);

    // Idempotent: the same messageId does not append a second row.
    await inbox.append("trigger", { i: 1 }, "trigger-1");
    expect(await store.findPending("r1", "n1", "trigger", 100)).toHaveLength(3);

    const rows = await RunInboxMessage.findPending("r1", "n1", "trigger");
    expect(rows.map((r) => r.msg_seq)).toEqual([1, 2, 3]);
  });

  it("findPending filters by minSeq, handle and status", async () => {
    const store = new DrizzleDurableInboxStore();
    const inbox = new DurableInbox("r1", "n1", store);
    await inbox.append("trigger", { i: 1 }, "a");
    await inbox.append("trigger", { i: 2 }, "b");
    await inbox.append("other", { i: 3 }, "c");

    expect(
      (await store.findPending("r1", "n1", "trigger", 100, 2)).map((m) => m.seq)
    ).toEqual([2]);
    expect(await store.findPending("r1", "n1", "trigger", 1)).toHaveLength(1);
    expect(await store.findPending("r1", "n1", "other", 100)).toHaveLength(1);

    await store.markConsumed("a");
    expect(
      (await store.findPending("r1", "n1", "trigger", 100)).map(
        (m) => m.messageId
      )
    ).toEqual(["b"]);
    expect((await store.findByMessageId("a"))?.status).toBe("consumed");
    expect((await store.findByMessageId("a"))?.consumedAt).toBeInstanceOf(Date);
    await expect(store.markConsumed("missing")).resolves.toBeUndefined();
  });

  it("deleteConsumed drops consumed messages below a sequence", async () => {
    const store = new DrizzleDurableInboxStore();
    const inbox = new DurableInbox("r1", "n1", store);
    await inbox.append("trigger", { i: 1 }, "a");
    await inbox.append("trigger", { i: 2 }, "b");
    await store.markConsumed("a");
    await store.markConsumed("b");

    expect(await store.deleteConsumed("r1", "n1", "trigger", 2)).toBe(1);
    expect(await store.findByMessageId("a")).toBeNull();
    expect(await store.findByMessageId("b")).not.toBeNull();
  });

  it("getMaxSeq survives a restart — new store instance, same DB file", async () => {
    const store = new DrizzleDurableInboxStore();
    const inbox = new DurableInbox("r1", "n1", store);
    await inbox.append("trigger", { i: 1 }, "a");
    await inbox.append("trigger", { i: 2 }, "b");
    expect(await store.getMaxSeq("r1", "n1", "trigger")).toBe(2);
    expect(await store.getMaxSeq("r1", "n1", "unused")).toBe(0);

    // Restart: close the connection and reopen the same file.
    closeDb();
    initDb(dbPath);

    const restarted = new DrizzleDurableInboxStore();
    expect(await restarted.getMaxSeq("r1", "n1", "trigger")).toBe(2);

    // The next append continues the sequence instead of colliding at 1.
    const restartedInbox = new DurableInbox("r1", "n1", restarted);
    const next = await restartedInbox.append("trigger", { i: 3 }, "c");
    expect(next.seq).toBe(3);
    expect(
      (await restarted.findPending("r1", "n1", "trigger", 100)).map(
        (m) => m.seq
      )
    ).toEqual([1, 2, 3]);
  });
});
