import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { RunInboxMessage } from "../src/run-inbox-message.js";

function setup() {
  initTestDb();
}

describe("RunInboxMessage model", () => {
  beforeEach(setup);
  afterEach(() => ModelObserver.clear());

  it("round-trips and rejects duplicate message_id", async () => {
    const created = await RunInboxMessage.create<RunInboxMessage>({
      message_id: "m1",
      run_id: "r1",
      node_id: "n1",
      handle: "trigger",
      msg_seq: 1,
      status: "pending",
      payload_json: { a: 1 }
    });

    const loaded = await RunInboxMessage.get<RunInboxMessage>(created.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.message_id).toBe("m1");
    expect(loaded!.handle).toBe("trigger");
    expect(loaded!.msg_seq).toBe(1);
    expect(loaded!.status).toBe("pending");
    expect(loaded!.payload_json).toEqual({ a: 1 });

    await expect(
      RunInboxMessage.create<RunInboxMessage>({
        message_id: "m1",
        run_id: "r1",
        node_id: "n1",
        handle: "trigger",
        msg_seq: 2,
        status: "pending"
      })
    ).rejects.toThrow();
  });

  it("maxSeq returns the highest msg_seq for the key, 0 when none", async () => {
    expect(await RunInboxMessage.maxSeq("r1", "n1", "trigger")).toBe(0);

    await RunInboxMessage.create<RunInboxMessage>({
      message_id: "m1",
      run_id: "r1",
      node_id: "n1",
      handle: "trigger",
      msg_seq: 1,
      status: "pending"
    });
    await RunInboxMessage.create<RunInboxMessage>({
      message_id: "m2",
      run_id: "r1",
      node_id: "n1",
      handle: "trigger",
      msg_seq: 5,
      status: "pending"
    });
    await RunInboxMessage.create<RunInboxMessage>({
      message_id: "m3",
      run_id: "r1",
      node_id: "n1",
      handle: "other",
      msg_seq: 9,
      status: "pending"
    });

    expect(await RunInboxMessage.maxSeq("r1", "n1", "trigger")).toBe(5);
  });

  it("findPending returns pending rows ordered by msg_seq asc", async () => {
    await RunInboxMessage.create<RunInboxMessage>({
      message_id: "m1",
      run_id: "r1",
      node_id: "n1",
      handle: "trigger",
      msg_seq: 3,
      status: "pending"
    });
    await RunInboxMessage.create<RunInboxMessage>({
      message_id: "m2",
      run_id: "r1",
      node_id: "n1",
      handle: "trigger",
      msg_seq: 1,
      status: "pending"
    });
    await RunInboxMessage.create<RunInboxMessage>({
      message_id: "m3",
      run_id: "r1",
      node_id: "n1",
      handle: "trigger",
      msg_seq: 2,
      status: "consumed"
    });

    const pending = await RunInboxMessage.findPending("r1", "n1", "trigger");
    expect(pending.map((r) => r.msg_seq)).toEqual([1, 3]);
  });
});
