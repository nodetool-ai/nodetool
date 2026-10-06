import { createInstanceState } from "@nodetool-ai/app-runtime";
import {
  instanceValues,
  restoredInstanceValues,
  InstanceWriter
} from "../instancePersistence";

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
});
