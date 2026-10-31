import { describe, expect, it, vi } from "vitest";
import { createNativeBrowserSession, NativeBrowserInput, NativeFixedTickClock, NativeJsonSaveHost,
  createNativeMemorySaveStorage, stepNativeExactly, nativeAssetPath, NativeInputRecording, type NativeBrowserWorkerTransport } from "../src/native-browser/index.js";
import { NativeWasmDispatcher, nativeWasmResponse, type NativeWasmModule } from "../src/native-browser/wasm.js";

class Transport implements NativeBrowserWorkerTransport {
  readonly sent: unknown[] = [];
  terminated = false;
  private message: ((event: MessageEvent<unknown>) => void) | undefined;
  private error: ((event: Event) => void) | undefined;
  postMessage(value: unknown): void {
    this.sent.push(value);
    if (typeof value === "object" && value !== null && "type" in value && value.type === "initialize") {
      queueMicrotask(() => this.receive({ type: "ready" }));
    }
    if (typeof value === "object" && value !== null && "type" in value && value.type === "releaseAssets" && "requestId" in value) {
      queueMicrotask(() => this.receive({ type: "assetsReleased", requestId: value.requestId }));
    }
  }
  terminate(): void { this.terminated = true; }
  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  addEventListener(type: "error", listener: (event: Event) => void): void;
  addEventListener(type: string, listener: ((event: MessageEvent<unknown>) => void) | ((event: Event) => void)): void {
    if (type === "message") { this.message = listener; } else { this.error = listener; }
  }
  removeEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: "error", listener: (event: Event) => void): void;
  removeEventListener(type: string): void { if (type === "message") { this.message = undefined; } else { this.error = undefined; } }
  receive(value: unknown): void { this.message?.(new MessageEvent("message", { data: value })); }
  crash(): void { this.error?.(new Event("error")); }
  reply(id: string): void { this.receive({ type: "response", response: { protocolVersion: 1, requestId: id, status: "ok", result: { closed: true } } }); }
}
const request = (requestId: string) => ({ protocolVersion: 1, requestId, operation: "close", sessionId: "game" } as const);
const options = (transport: Transport) => ({ workerUrl: "https://example.test/worker.js", moduleUrl: "https://example.test/native.mjs", wasmUrl: "https://example.test/native.wasm", createWorker: () => transport });

describe("native browser transport", () => {
  it("serializes calls, correlates replies and disposes listeners", async () => {
    const transport = new Transport(), session = await createNativeBrowserSession(options(transport));
    const first = session.request(request("first")), second = session.request(request("second"));
    expect(transport.sent).toHaveLength(2);
    transport.reply("first"); await first; expect(transport.sent).toHaveLength(3);
    transport.reply("second"); await second; await session.close(); expect(transport.terminated).toBe(true);
    await expect(session.request(request("third"))).rejects.toMatchObject({ code: "closed" });
  });
  it("serializes and acknowledges idempotent staging release", async () => {
    const transport = new Transport(), session = await createNativeBrowserSession(options(transport));
    await session.releaseAssets(); await session.releaseAssets(); expect(transport.sent).toHaveLength(3);
    expect(session.metrics()).toBeNull(); await session.close();
  });
  it("rejects invalid staging and aggregate byte backpressure before cloning", async () => {
    const transport = new Transport();
    await expect(createNativeBrowserSession({ ...options(transport), assets: [{ path: "../bad", bytes: new Uint8Array() }] })).rejects.toThrow("closed relative");
    expect(transport.sent).toHaveLength(0);
    const session = await createNativeBrowserSession({ ...options(transport), maxQueuedBytes: 1 });
    await expect(session.request(request("large"))).rejects.toMatchObject({ code: "backpressure" }); await session.close();
  });
  it("bounds queue and cancels queued input without dispatch", async () => {
    const transport = new Transport(), session = await createNativeBrowserSession({ ...options(transport), maxQueuedRequests: 2 });
    const first = session.request(request("first"));
    const controller = new AbortController(), second = session.request(request("second"), controller.signal);
    await expect(session.request(request("third"))).rejects.toMatchObject({ code: "backpressure" });
    controller.abort(); await expect(second).rejects.toMatchObject({ code: "cancelled" });
    expect(transport.sent).toHaveLength(2); transport.reply("first"); await first; await session.close();
  });
  it("rejects abort before dispatch and loses live state on in-flight abort", async () => {
    const transport = new Transport(), session = await createNativeBrowserSession(options(transport));
    const controller = new AbortController(); controller.abort();
    await expect(session.request(request("before"), controller.signal)).rejects.toBeDefined();
    expect(transport.sent).toHaveLength(1);
    const running = new AbortController(), pending = session.request(request("running"), running.signal);
    running.abort(); await expect(pending).rejects.toMatchObject({ code: "session_lost" }); expect(transport.terminated).toBe(true);
  });
  it("rejects out-of-order IDs and worker crashes", async () => {
    for (const fail of [(transport: Transport) => transport.reply("wrong"), (transport: Transport) => transport.crash()]) {
      const transport = new Transport(), session = await createNativeBrowserSession(options(transport));
      const pending = session.request(request("first")); fail(transport);
      await expect(pending).rejects.toBeDefined(); expect(transport.terminated).toBe(true); await session.close();
    }
  });
  it("terminates synchronous work when its host deadline expires", async () => {
    vi.useFakeTimers();
    try {
      const transport = new Transport(), session = await createNativeBrowserSession({ ...options(transport), requestTimeoutMs: 10 });
      const pending = session.request(request("first"));
      const rejection = expect(pending).rejects.toMatchObject({ code: "session_lost" });
      await vi.advanceTimersByTimeAsync(11); await rejection; expect(transport.terminated).toBe(true);
    } finally { vi.useRealTimers(); }
  });
});

describe("native recorded input", () => {
  it("delivers a quick digital tap for one tick while retaining its ordered release", () => {
    const input = new NativeBrowserInput();
    input.set("restart", true); input.set("restart", false);
    expect(input.sample()).toMatchObject({ actions: { restart: true }, edges: [
      {action:"restart",pressed:true,sequence:0}, {action:"restart",pressed:false,sequence:1}
    ] });
    expect(input.sample()).toMatchObject({actions:{restart:false},edges:[]});
  });
  it("retains held digital values, leaves analog values sampled, and cancels pending pulses on reset", () => {
    const input = new NativeBrowserInput();
    input.set("held", true); expect(input.sample()).toMatchObject({actions:{held:true}});
    expect(input.sample()).toMatchObject({actions:{held:true}});
    input.set("held", false); expect(input.sample()).toMatchObject({actions:{held:false}});
    input.set("axis", 0.75); input.set("axis", 0); input.set("analog", 0.25);
    expect(input.sample()).toMatchObject({actions:{axis:0,analog:0.25}});
    input.set("mixed", true); input.set("mixed", 0.5);
    expect(input.sample()).toMatchObject({actions:{mixed:0.5}});
    input.set("restart", true); input.set("restart", false); input.releaseAll();
    expect(input.sample()).toMatchObject({actions:{restart:false,analog:0,mixed:0}});
  });
  it("preserves quick input edges in order and releases on blur", () => {
    const input = new NativeBrowserInput(); input.set("jump", true); input.set("jump", false); input.set("left", true); input.releaseAll();
    expect(input.sample()).toEqual({ jump: false, move: [0, 0, 0], actions: { jump: false, left: false }, edges: [
      { action: "jump", pressed: true, sequence: 0 }, { action: "jump", pressed: false, sequence: 1 },
      { action: "left", pressed: true, sequence: 2 }, { action: "left", pressed: false, sequence: 3 }
    ] });
    expect(input.sample().edges).toEqual([]);
  });
  it("bounds catch-up, drops wall time while paused and steps exact ticks", async () => {
    const clock = new NativeFixedTickClock(60, 4); expect(clock.advance(0)).toBe(0); expect(clock.advance(1000)).toBe(4);
    expect(clock.advance(1000)).toBe(0);
    clock.pause(); expect(clock.advance(2000)).toBe(0); clock.pause(false); expect(clock.advance(3000)).toBe(0);
    expect(clock.advance(3000 + 1000 / 60)).toBe(1);
    const ticks: number[] = []; await stepNativeExactly(100, async (index) => { ticks.push(index); }); expect(ticks).toHaveLength(100);
  });
  it("matches native movement conventions for both dimensions", () => {
    const two = new NativeBrowserInput("2d"), three = new NativeBrowserInput("3d");
    for (const input of [two, three]) { input.set("right", true); input.set("forward", true); input.set("jump", true); }
    expect(two.sample()).toMatchObject({move:{x:1,y:1},jump:true,actions:{right:true,forward:true,jump:true}});
    expect(three.sample()).toMatchObject({move:[1,0,-1],jump:true});
  });
  it("records detached loaded responses, bounds history and rejects reordered ticks", () => {
    const recording = new NativeInputRecording(2), input = { loaded: [{scope:"progress",slot:"one",data:{score:3}}] };
    recording.record({tick:0,generation:1,input});input.loaded[0].data.score=9;
    expect(recording.entries()[0]?.input.loaded).toEqual([{scope:"progress",slot:"one",data:{score:3}}]);
    expect(() => recording.record({tick:0,generation:1,input})).toThrow("tick order");
    recording.record({tick:1,generation:1,input});expect(() => recording.record({tick:2,generation:1,input})).toThrow("recording is full");
    recording.clear();recording.record({tick:0,generation:2,input});expect(recording.length).toBe(1);
    const pending = recording.prepare({tick:1,generation:2,input});expect(recording.length).toBe(1);
    pending.cancel();expect(recording.length).toBe(1);
    const committed = recording.prepare({tick:1,generation:2,input});committed.commit();expect(recording.length).toBe(2);
  });
});

describe("native JSON save hosting", () => {
  it("separates scopes, deduplicates committed output and records later loads", async () => {
    const storage = createNativeMemorySaveStorage(), host = new NativeJsonSaveHost(storage);
    const save = { kind: "save", scope: "progress", slot: "one", data: { score: 1 }, generation: 1, tick: 1, sequence: 0 } as const;
    host.consume([save], 1); host.consume([save], 1);
    host.consume([{ kind: "load", scope: "progress", slot: "one", generation: 1, tick: 1, sequence: 1 }], 1);
    expect(host.takeLoaded(1)).toEqual([]); await host.drain();
    expect(host.takeLoaded(1)).toEqual([{ scope: "progress", slot: "one", data: { score: 1 } }]);
    expect(await storage.read("settings", "one")).toBeNull();
  });
  it("drops stale loads after reset and replay does not access storage", async () => {
    let finish: (value: null) => void = () => {};
    const read = vi.fn(() => new Promise<null>((resolve) => { finish = resolve; }));
    const storage = { persistence: "memory", read, write: vi.fn(async () => {}) } as const;
    const host = new NativeJsonSaveHost(storage);
    host.consume([{ kind: "load", scope: "progress", slot: "one", generation: 1, tick: 0, sequence: 0 }], 1);
    await Promise.resolve(); host.reset(2); finish(null); await host.drain(); expect(host.takeLoaded(2)).toEqual([]);
    const replay = new NativeJsonSaveHost(storage, { replay: true });
    replay.consume([{ kind: "load", scope: "progress", slot: "one", generation: 1, tick: 0, sequence: 0 }], 1);
    await replay.drain(); expect(read).toHaveBeenCalledTimes(1);
  });
  it("bounds queued requests and slots and reports denied storage as null", async () => {
    const storage = createNativeMemorySaveStorage();
    for (let index = 0; index < 16; index += 1) { await storage.write("progress", String(index), { formatVersion: 1, data: {} }); }
    await expect(storage.write("progress", "extra", { formatVersion: 1, data: {} })).rejects.toThrow("slot limit");
    const diagnostic = vi.fn(), host = new NativeJsonSaveHost({ persistence: "durable", read: async () => { throw new Error("denied"); }, write: async () => {} }, { onDiagnostic: diagnostic });
    host.consume([{ kind: "load", scope: "settings", slot: "one", generation: 1, tick: 0, sequence: 0 }], 1);
    await host.drain(); expect(host.takeLoaded(1)[0]?.data).toBeNull(); expect(diagnostic).toHaveBeenCalledWith("denied");
  });
  it("bounds pending and undelivered completions and JSON data", async () => {
    const storage = createNativeMemorySaveStorage(), host = new NativeJsonSaveHost(storage);
    await expect(storage.write("progress", "huge", { formatVersion: 1, data: { value: "x".repeat(16384) } })).rejects.toBeDefined();
    for (let tick = 0; tick < 2; tick += 1) {
      host.consume(Array.from({ length: 4 }, (_, sequence) => ({kind:"load",scope:"progress",slot:"one",generation:1,tick,sequence})),1);
    }
    expect(() => host.consume([{kind:"load",scope:"progress",slot:"one",generation:1,tick:2,sequence:0}],1)).toThrow("queue is full");
    await host.drain(); expect(host.takeLoaded(1)).toHaveLength(2);
    host.consume([{kind:"load",scope:"progress",slot:"one",generation:1,tick:2,sequence:0}],1); await host.drain();
  });
});

describe("native WASM ABI", () => {
  it("correlates only the exact allocation-free resource-limit fallback", () => {
    const emergency = { protocolVersion:1,requestId:"",status:"error",error:{code:"resource_limit",message:"Interface memory budget exhausted",path:""} };
    expect(nativeWasmResponse(emergency,"live-request")).toEqual({...emergency,requestId:"live-request"});
    for (const invalid of [
      {...emergency,requestId:"other-request"},
      {...emergency,error:{...emergency.error,message:"Different allocation failure"}},
      {...emergency,error:{...emergency.error,path:"/different"}},
      {...emergency,error:{...emergency.error,code:"worker_error"}},
      {...emergency,error:{...emergency.error,details:{}}},
      {...emergency,extra:true},
      {protocolVersion:1,requestId:"",status:"ok",result:{closed:true}}
    ]) { expect(() => nativeWasmResponse(invalid,"live-request")).toThrow(); }
    expect(() => nativeWasmResponse(emergency,"bad request id")).toThrow();
  });
  it("refreshes heap after growth and copies the borrowed result before free", () => {
    let heap = new Uint8Array(128); const response = new TextEncoder().encode('{"ok":true}');
    const module: NativeWasmModule = {
      get HEAPU8() { return heap; }, _malloc: () => 8, _free: () => { heap.fill(0); }, _ng_create: () => 1,
      _ng_dispatch: () => { heap = new Uint8Array(256); heap.set(response, 32); return 0; },
      _ng_response_pointer: () => 32, _ng_response_length: () => response.length, _ng_destroy: vi.fn(),
      FS: { mkdirTree() {}, writeFile() {}, unlink() {} }
    };
    const dispatcher = new NativeWasmDispatcher(module); expect(dispatcher.dispatch({})).toEqual({ ok: true });
    dispatcher.close(); dispatcher.close(); expect(module._ng_destroy).toHaveBeenCalledTimes(1);
    expect(() => dispatcher.dispatch({})).toThrow("closed");
  });
  it("rejects unsafe staging paths", () => {
    for (const path of ["../secret", "/absolute", "a\\b", "https://remote/x", "a/%2e", "a//b"]) { expect(() => nativeAssetPath(path)).toThrow(); }
    expect(nativeAssetPath("textures/one.png")).toBe("/assets/textures/one.png");
  });
});
