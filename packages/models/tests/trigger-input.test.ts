import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { TriggerInput } from "../src/trigger-input.js";

function setup() {
  initTestDb();
}

describe("TriggerInput model", () => {
  beforeEach(setup);
  afterEach(() => ModelObserver.clear());

  it("creates with defaults and round-trips", async () => {
    const created = await TriggerInput.create<TriggerInput>({
      input_id: "i1",
      run_id: "r1",
      node_id: "n1",
      payload_json: { a: 1 }
    });

    const loaded = await TriggerInput.get<TriggerInput>(created.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.input_id).toBe("i1");
    expect(loaded!.run_id).toBe("r1");
    expect(loaded!.node_id).toBe("n1");
    expect(loaded!.payload_json).toEqual({ a: 1 });
    expect(loaded!.processed).toBe(0);
    expect(loaded!.cursor).toBeNull();
    expect(loaded!.processed_at).toBeNull();
    expect(loaded!.created_at).toBeTruthy();
    expect(loaded!.updated_at).toBeTruthy();
  });

  it("findUnprocessed returns only unprocessed rows ordered by created_at asc", async () => {
    await TriggerInput.create<TriggerInput>({
      input_id: "i-a",
      run_id: "r1",
      node_id: "n1",
      created_at: "2026-01-01T00:00:02.000Z"
    });
    await TriggerInput.create<TriggerInput>({
      input_id: "i-b",
      run_id: "r1",
      node_id: "n1",
      created_at: "2026-01-01T00:00:01.000Z"
    });
    await TriggerInput.create<TriggerInput>({
      input_id: "i-processed",
      run_id: "r1",
      node_id: "n1",
      processed: 1,
      created_at: "2026-01-01T00:00:00.000Z"
    });

    const rows = await TriggerInput.findUnprocessed(10);
    expect(rows.map((r) => r.input_id)).toEqual(["i-b", "i-a"]);
  });

  it("markProcessed flips processed and sets processed_at", async () => {
    await TriggerInput.create<TriggerInput>({
      input_id: "i1",
      run_id: "r1",
      node_id: "n1"
    });

    const updated = await TriggerInput.markProcessed("i1");
    expect(updated).not.toBeNull();
    expect(updated!.processed).toBe(1);
    expect(updated!.processed_at).not.toBeNull();

    const remaining = await TriggerInput.findUnprocessed(10);
    expect(remaining.find((r) => r.input_id === "i1")).toBeUndefined();
  });

  it("markProcessed with unknown input_id resolves to null", async () => {
    await expect(TriggerInput.markProcessed("nope")).resolves.toBeNull();
  });
});
