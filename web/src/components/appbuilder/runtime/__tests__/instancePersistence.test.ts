import { createInstanceState } from "@nodetool-ai/app-runtime";
import {
  AppInstanceConflictError,
  instanceValues,
  restoredInstanceValues,
  InstanceWriter
} from "../instancePersistence";

/** A server row with compare-and-swap saves, like PATCH /api/app-instances. */
const serverRow = (values: Record<string, unknown>) => {
  const row = { revision: 0, values };
  const save = jest.fn(
    async (expected: number, next: Record<string, unknown>) => {
      if (expected !== row.revision) {
        throw new AppInstanceConflictError();
      }
      row.values = next;
      return ++row.revision;
    }
  );
  const load = jest.fn(async () => ({
    revision: row.revision,
    values: row.values
  }));
  /** A write that did not come from this client, such as a run settle. */
  const writeElsewhere = (next: Record<string, unknown>) => {
    row.values = next;
    row.revision += 1;
  };
  return { row, save, load, writeElsewhere };
};

describe("server instance persistence", () => {
  it("restores instance variables, input edits and produced outputs without transport ownership", () => {
    const state = createInstanceState();
    state.variables = { checkpoint: 42, transient: "kept" };
    state.inputs = {
      "main:input": { value: "prompt", dirty: true, revision: 1 }
    };
    state.outputs = {
      "main:output": {
        value: "answer",
        status: "done",
        invocationId: "old-job",
        revision: 2
      }
    };
    const restored = restoredInstanceValues(instanceValues(state));
    expect(restored.variables).toEqual(state.variables);
    expect(restored.inputs["main:input"].value).toBe("prompt");
    expect(restored.outputs["main:output"].value).toBe("answer");
    expect(restored.outputs["main:output"].invocationId).toBeNull();
  });

  it("serializes edits arriving during a save and advances the expected revision", async () => {
    let release: (revision: number) => void = () => undefined;
    const save = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<number>((resolve) => {
            release = resolve;
          })
      )
      .mockResolvedValueOnce(2);
    const writer = new InstanceWriter(0, {}, save);
    writer.stage({ name: "first" });
    const flushed = writer.flush();
    writer.stage({ name: "second" });
    const overlapping = writer.flush();
    expect(save).toHaveBeenCalledTimes(1);
    release(1);
    await Promise.all([flushed, overlapping]);
    expect(save.mock.calls).toEqual([
      [0, { name: "first" }],
      [1, { name: "second" }]
    ]);
  });

  it("keeps two instances independent and refuses stale browser replacement", async () => {
    let revision = 0;
    let values: Record<string, unknown> = {};
    const save = jest.fn(
      async (expected: number, next: Record<string, unknown>) => {
        if (expected !== revision) {
          throw new Error("Instance changed. Reload before saving.");
        }
        values = next;
        return ++revision;
      }
    );
    const first = new InstanceWriter(0, {}, save);
    const stale = new InstanceWriter(0, {}, save);
    const otherSave = jest.fn(async () => 1);
    const other = new InstanceWriter(0, {}, otherSave);
    first.stage({ total: 20 });
    await first.flush();
    stale.stage({ total: 99 });
    await expect(stale.flush()).rejects.toThrow("Reload");
    stale.stage({ total: 101 });
    await expect(stale.flush()).rejects.toThrow("Reload");
    other.stage({ total: 5 });
    await other.flush();
    expect(values).toEqual({ total: 20 });
    expect(otherSave).toHaveBeenCalledWith(0, { total: 5 });
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("merges a save with a run result the server wrote meanwhile", async () => {
    const base = {
      step: "voice",
      __app_outputs: { "voice:out": null }
    };
    const server = serverRow(base);
    const onRebase = jest.fn();
    const writer = new InstanceWriter(0, base, server.save, {
      load: server.load,
      onRebase
    });
    // The server settles the voice run while this client still holds rev 0.
    server.writeElsewhere({
      step: "voice",
      narration: { type: "audio", asset_id: "a1" },
      __app_outputs: { "voice:out": { type: "audio", asset_id: "a1" } }
    });
    // The user moves to the next step. The client's copy of the outputs is
    // stale, but the run result is the server's to keep.
    writer.stage({ step: "lipsync", __app_outputs: { "voice:out": null } });

    await writer.flush();

    const merged = {
      step: "lipsync",
      narration: { type: "audio", asset_id: "a1" },
      __app_outputs: { "voice:out": { type: "audio", asset_id: "a1" } }
    };
    expect(server.row.values).toEqual(merged);
    expect(server.row.revision).toBe(2);
    expect(onRebase).toHaveBeenCalledWith(merged);
  });

  it("still refuses when two sessions change the same variable", async () => {
    const server = serverRow({ total: 1 });
    const writer = new InstanceWriter(0, { total: 1 }, server.save, {
      load: server.load
    });
    server.writeElsewhere({ total: 20 });
    writer.stage({ total: 99 });

    await expect(writer.flush()).rejects.toBeInstanceOf(
      AppInstanceConflictError
    );
    expect(server.row.values).toEqual({ total: 20 });
  });

  it("rebases an idle writer onto a newer server state", () => {
    const writer = new InstanceWriter(0, { a: 1 }, jest.fn());
    const onRebase = jest.fn();
    const rebased = writer.rebase(
      { revision: 3, values: { a: 1, b: 2 } },
      { a: 5 },
      onRebase
    );
    expect(rebased).toEqual({ a: 5, b: 2 });
    expect(onRebase).toHaveBeenCalledWith({ a: 5, b: 2 });
  });
});
