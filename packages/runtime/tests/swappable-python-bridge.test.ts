/**
 * Tests for SwappableBridge — a PythonBridge that delegates every call to a
 * current target and re-emits the target's events, so holders of one stable
 * reference automatically follow a swapped-in worker bridge. Uses lightweight
 * fake bridges (EventEmitters implementing the PythonBridge surface) rather
 * than real transports — SwappableBridge only delegates and re-points, it owns
 * no transport of its own.
 */

import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";

import { SwappableBridge } from "../src/swappable-python-bridge.js";
import type { PythonBridge } from "../src/python-bridge-types.js";
import type { UnifiedModelLike } from "../src/python-bridge-types.js";

/**
 * A minimal fake PythonBridge: an EventEmitter whose methods are spies. Only
 * the members the tests exercise carry real behavior; the rest are stubbed so
 * the object structurally satisfies PythonBridge.
 */
class FakeBridge extends EventEmitter {
  connected = false;
  connectSpy = vi.fn(async () => {
    this.connected = true;
  });
  closeSpy = vi.fn(() => {
    this.connected = false;
  });
  cachedModels: UnifiedModelLike[];

  constructor(models: UnifiedModelLike[] = []) {
    super();
    this.cachedModels = models;
  }

  connect(): Promise<void> {
    return this.connectSpy();
  }
  ensureConnected(): Promise<void> {
    return Promise.resolve();
  }
  execute(): Promise<never> {
    return Promise.reject(new Error("not used"));
  }
  async *executeStream(): AsyncGenerator<never> {
    // empty
  }
  cancel(): void {}
  getNodeMetadata(): never[] {
    return [];
  }
  getLoadErrors(): never[] {
    return [];
  }
  getWorkerStatus(): Promise<never> {
    return Promise.reject(new Error("not used"));
  }
  hasNodeType(): boolean {
    return false;
  }
  get isConnected(): boolean {
    return this.connected;
  }
  isAvailable(): boolean {
    return true;
  }
  listProviders(): Promise<never[]> {
    return Promise.resolve([]);
  }
  getProviderModels(): Promise<never[]> {
    return Promise.resolve([]);
  }
  providerGenerate(): Promise<Record<string, unknown>> {
    return Promise.resolve({});
  }
  providerTextToImage(): Promise<Uint8Array> {
    return Promise.resolve(new Uint8Array());
  }
  providerImageToImage(): Promise<Uint8Array> {
    return Promise.resolve(new Uint8Array());
  }
  providerASR(): Promise<{ text: string }> {
    return Promise.resolve({ text: "" });
  }
  providerEmbedding(): Promise<number[][]> {
    return Promise.resolve([]);
  }
  listCachedModels(): Promise<UnifiedModelLike[]> {
    return Promise.resolve(this.cachedModels);
  }
  downloadModel(): Promise<void> {
    return Promise.resolve();
  }
  cancelModelDownload(): void {}
  deleteCachedModel(): Promise<boolean> {
    return Promise.resolve(false);
  }
  supportsModelManagement(): boolean {
    return false;
  }
  supportsComfy(): boolean {
    return false;
  }
  getComfyStatus(): null {
    return null;
  }
  comfyExecute(): Promise<Record<string, unknown>> {
    return Promise.resolve({});
  }
  cancelComfyExecute(): void {}
  comfyQueue(): Promise<Record<string, unknown>> {
    return Promise.resolve({});
  }
  comfyInterrupt(): Promise<void> {
    return Promise.resolve();
  }
  comfyCancelPrompt(): Promise<void> {
    return Promise.resolve();
  }
  comfyUpload(): Promise<Record<string, unknown>> {
    return Promise.resolve({});
  }
  comfyView(): Promise<Record<string, unknown>> {
    return Promise.resolve({});
  }
  comfyObjectInfo(): Promise<Record<string, unknown>> {
    return Promise.resolve({});
  }
  comfySystemStats(): Promise<Record<string, unknown>> {
    return Promise.resolve({});
  }
  comfyStatus(): Promise<{ enabled: boolean }> {
    return Promise.resolve({ enabled: false });
  }
  comfyFree(): Promise<void> {
    return Promise.resolve();
  }
  comfyModelsList(): Promise<never[]> {
    return Promise.resolve([]);
  }
  comfyModelsDownload(): Promise<void> {
    return Promise.resolve();
  }
  comfyModelsDelete(): Promise<boolean> {
    return Promise.resolve(false);
  }
  getRecentStderrSummary(): string | null {
    return null;
  }
  close(): void {
    this.closeSpy();
  }
}

function makeFake(models: UnifiedModelLike[] = []): FakeBridge {
  return new FakeBridge(models);
}

describe("SwappableBridge", () => {
  it("is assignable to PythonBridge", () => {
    const fake = makeFake();
    const bridge: PythonBridge = new SwappableBridge(fake);
    expect(bridge).toBeInstanceOf(EventEmitter);
  });

  it("delegates method calls to the current target", async () => {
    const a = makeFake([{ id: "a", name: "A" }]);
    const swap = new SwappableBridge(a);
    await expect(swap.listCachedModels()).resolves.toEqual([
      { id: "a", name: "A" }
    ]);
  });

  it("routes calls to the new target after swap", async () => {
    const a = makeFake([{ id: "a", name: "A" }]);
    const b = makeFake([{ id: "b", name: "B" }]);
    const swap = new SwappableBridge(a);
    swap.swap(b);
    await expect(swap.listCachedModels()).resolves.toEqual([
      { id: "b", name: "B" }
    ]);
    expect(swap.target).toBe(b);
  });

  it("reflects the current target's isConnected", () => {
    const a = makeFake();
    const b = makeFake();
    a.connected = false;
    b.connected = true;
    const swap = new SwappableBridge(a);
    expect(swap.isConnected).toBe(false);
    swap.swap(b);
    expect(swap.isConnected).toBe(true);
  });

  it("re-emits events from the current target", () => {
    const a = makeFake();
    const swap = new SwappableBridge(a);
    const onStderr = vi.fn();
    swap.on("stderr", onStderr);
    a.emit("stderr", "hello");
    expect(onStderr).toHaveBeenCalledWith("hello");
  });

  it("re-points event forwarding across a swap", () => {
    const a = makeFake();
    const b = makeFake();
    const swap = new SwappableBridge(a);
    const onActivity = vi.fn();
    swap.on("activity", onActivity);

    a.emit("activity");
    expect(onActivity).toHaveBeenCalledTimes(1);

    swap.swap(b);

    // Old target no longer forwards.
    a.emit("activity");
    expect(onActivity).toHaveBeenCalledTimes(1);

    // New target forwards.
    b.emit("activity");
    expect(onActivity).toHaveBeenCalledTimes(2);
  });

  it("forwards every declared event type", () => {
    const a = makeFake();
    const swap = new SwappableBridge(a);
    const events = [
      "stderr",
      "stdout",
      "exit",
      "activity",
      "progress",
      "reconnected"
    ] as const;
    for (const ev of events) {
      const spy = vi.fn();
      swap.on(ev, spy);
      a.emit(ev, "payload");
      expect(spy, `event ${ev} should forward`).toHaveBeenCalledWith("payload");
    }
  });

  it("does not throw when re-emitting 'error' with no listener", () => {
    const a = makeFake();
    new SwappableBridge(a);
    // No "error" listener on swap → re-emit must be guarded, not throw.
    expect(() => a.emit("error", new Error("boom"))).not.toThrow();
  });

  it("forwards 'error' when a listener exists", () => {
    const a = makeFake();
    const swap = new SwappableBridge(a);
    const onError = vi.fn();
    swap.on("error", onError);
    const err = new Error("boom");
    a.emit("error", err);
    expect(onError).toHaveBeenCalledWith(err);
  });

  it("swap to the same target is a no-op (does not re-subscribe)", () => {
    const a = makeFake();
    const swap = new SwappableBridge(a);
    const onActivity = vi.fn();
    swap.on("activity", onActivity);
    swap.swap(a);
    a.emit("activity");
    // Still exactly one forward, not two (no duplicate subscription).
    expect(onActivity).toHaveBeenCalledTimes(1);
    expect(swap.target).toBe(a);
  });

  it("swap neither connects nor closes either target", () => {
    const a = makeFake();
    const b = makeFake();
    const swap = new SwappableBridge(a);
    swap.swap(b);
    expect(a.connectSpy).not.toHaveBeenCalled();
    expect(a.closeSpy).not.toHaveBeenCalled();
    expect(b.connectSpy).not.toHaveBeenCalled();
    expect(b.closeSpy).not.toHaveBeenCalled();
  });

  it("delegates close() to the current target only", () => {
    const a = makeFake();
    const b = makeFake();
    const swap = new SwappableBridge(a);
    swap.swap(b);
    swap.close();
    expect(b.closeSpy).toHaveBeenCalledTimes(1);
    expect(a.closeSpy).not.toHaveBeenCalled();
  });
});
