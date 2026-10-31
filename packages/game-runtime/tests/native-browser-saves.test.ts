import { describe, expect, it, vi } from "vitest";
import type { NativeJsonSaveRecord, NativeJsonSaveStorage, NativeSaveRequest } from "@nodetool-ai/protocol/native-game";
import { NativeJsonSaveHost, createNativeMemorySaveStorage } from "../src/native-browser/saves.js";

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void; reject(error: Error): void } {
  let resolve: (value: T) => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function save(generation: number, tick: number, sequence: number, value: number): NativeSaveRequest {
  return { kind: "save", generation, tick, sequence, scope: "progress", slot: "one", data: { value } };
}
function load(generation: number, tick: number, sequence: number): NativeSaveRequest {
  return { kind: "load", generation, tick, sequence, scope: "progress", slot: "one" };
}

describe("native browser committed save execution", () => {
  it.each(["resolved", "rejected"] as const)("keeps committed writes ordered across a generation transition behind a %s delayed load", async (completion) => {
    const delayed = deferred<NativeJsonSaveRecord | null>();
    const trace: string[] = [], memory = createNativeMemorySaveStorage(), diagnostic = vi.fn();
    const storage: NativeJsonSaveStorage = {
      persistence: "durable",
      read: async () => { trace.push("read"); return delayed.promise; },
      write: async (scope, slot, record) => { trace.push(`write:${record.data.value}`); await memory.write(scope, slot, record); }
    };
    const host = new NativeJsonSaveHost(storage, { onDiagnostic: diagnostic });
    const requests = [load(1, 0, 0), save(1, 0, 1, 1), load(1, 0, 2)];
    host.consume(requests, 1);
    host.consume(requests, 1); // Re-observing a committed frame cannot duplicate its writes.
    await Promise.resolve();
    expect(trace).toEqual(["read"]);
    host.reset(2); // The player invokes this on the next committed scene generation.
    host.consume([save(2, 1, 0, 2)], 2);
    if (completion === "resolved") { delayed.resolve({ formatVersion: 1, data: { value: 99 } }); }
    else { delayed.reject(new Error("read denied")); }
    await host.drain();
    expect(trace).toEqual(["read", "write:1", "write:2"]);
    expect(await memory.read("progress", "one")).toEqual({ formatVersion: 1, data: { value: 2 } });
    expect(host.takeLoaded(1)).toEqual([]);
    expect(host.takeLoaded(2)).toEqual([]);
    expect(diagnostic.mock.calls).toEqual(completion === "rejected" ? [["read denied"]] : []);
  });

  it("keeps old-generation committed writes in the existing bounded queue", async () => {
    const delayed = deferred<NativeJsonSaveRecord | null>(), writes: number[] = [];
    const host = new NativeJsonSaveHost({ persistence: "memory", read: () => delayed.promise, write: async (_scope, _slot, record) => { writes.push(Number(record.data.value)); } });
    host.consume([load(1, 0, 0), save(1, 0, 1, 1), save(1, 0, 2, 2), save(1, 0, 3, 3)], 1);
    host.consume([0, 1, 2, 3].map((sequence) => save(1, 1, sequence, sequence + 4)), 1);
    await Promise.resolve();
    host.reset(2);
    expect(() => host.consume([save(2, 2, 0, 8)], 2)).toThrow("queue is full");
    delayed.resolve(null);
    await host.drain();
    expect(writes).toEqual([1, 2, 3, 4, 5, 6, 7]);
    host.consume([save(2, 2, 0, 8)], 2);
    await host.drain();
    expect(writes).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("continues committed writes after write failure and a throwing diagnostic sink", async () => {
    const calls: number[] = [];
    const host = new NativeJsonSaveHost({ persistence: "durable", read: async () => null, write: async (_scope, _slot, record) => { const value = Number(record.data.value); calls.push(value); if (value === 1) { throw new Error("write denied"); } } }, { onDiagnostic: () => { throw new Error("sink failed"); } });
    host.consume([save(1, 0, 0, 1), save(1, 0, 1, 2)], 1);
    host.reset(2);
    host.consume([save(2, 1, 0, 3)], 2);
    await host.drain();
    expect(calls).toEqual([1, 2, 3]);
  });

  it("retains generation/sequence validation and replay performs no IO", async () => {
    const storage = { persistence: "memory", read: vi.fn(async () => null), write: vi.fn(async () => {}) } as const;
    const host = new NativeJsonSaveHost(storage);
    host.reset(2);
    expect(() => host.consume([save(1, 0, 0, 1)], 1)).toThrow("Stale native save generation");
    expect(() => host.consume([save(2, 0, 1, 1)], 2)).toThrow("sequence zero");
    host.consume([save(2, 0, 0, 1)], 2);
    expect(() => host.consume([save(2, 0, 2, 2)], 2)).toThrow("sequence gap");
    await host.drain();
    const replay = new NativeJsonSaveHost(storage, { replay: true });
    replay.consume([load(1, 0, 0), save(1, 0, 1, 4)], 1);
    replay.reset(2);
    await replay.drain();
    expect(storage.read).not.toHaveBeenCalled();
    expect(storage.write).toHaveBeenCalledTimes(1);
    expect(replay.takeLoaded(2)).toEqual([]);
  });
});
