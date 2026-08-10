/**
 * The WASM host: conversion, budgets, the pool, and the dispatcher boundary.
 *
 * These drive the host directly rather than through QuickJS, because the
 * things under test — a terminated worker, a wall-clock budget, the peak
 * concurrency a run reached — are host facts a guest cannot observe. The
 * end-to-end path is `js-sandbox-wasm.test.ts`.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  compileSandboxWasm,
  createSandboxWasmDispatcher,
  resetSandboxWasmModuleCache,
  resetSandboxWasmWorkerPool,
  WasmWorkerPool
} from "../src/wasm-sandbox/host.js";
import type {
  WasmCallRequest,
  WasmCallWorker,
  WasmWorkerFactory
} from "../src/wasm-sandbox/workers.js";
import {
  referenceWasmModule,
  REFERENCE_SPECIFIER
} from "./fixtures/sandbox-wasm/cases.js";

afterEach(() => {
  resetSandboxWasmWorkerPool();
  resetSandboxWasmModuleCache();
});

/** A worker that answers after a delay, recording how many ran at once. */
class FakeFactory implements WasmWorkerFactory {
  created = 0;
  terminated = 0;
  inFlight = 0;
  peak = 0;
  constructor(private readonly delayMs = 0) {}
  create(): Promise<WasmCallWorker> {
    this.created += 1;
    const factory = this;
    let dead = false;
    return Promise.resolve({
      async call(request: WasmCallRequest) {
        factory.inFlight += 1;
        if (factory.inFlight > factory.peak) factory.peak = factory.inFlight;
        try {
          if (factory.delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, factory.delayMs));
          }
          if (dead) throw new Error("terminated");
          return { value: request.args.length === 0 ? 1 : Number(request.args[0]) };
        } finally {
          factory.inFlight -= 1;
        }
      },
      terminate() {
        dead = true;
        factory.terminated += 1;
      }
    });
  }
}

/** A worker that never answers, so every call hits its timeout. */
const hangingFactory: WasmWorkerFactory = {
  create: () =>
    Promise.resolve({
      call: () => new Promise<{ value: number | undefined }>(() => {}),
      terminate: () => {}
    })
};

function dispatcherFor(
  options: Parameters<typeof referenceWasmModule>[0] = {},
  factory: WasmWorkerFactory = new FakeFactory()
) {
  const pool = new WasmWorkerPool(4, factory);
  const dispatcher = createSandboxWasmDispatcher([referenceWasmModule(options)], {
    pool
  });
  if (dispatcher === undefined) throw new Error("expected a dispatcher");
  return { dispatcher, pool };
}

describe("WASM host arguments", () => {
  it("rejects out-of-range, non-integer, and non-number i32 arguments", async () => {
    const { dispatcher } = dispatcherFor();
    for (const bad of [2147483648, -2147483649, 1.5, Number.NaN, "2", null, true]) {
      await expect(dispatcher.call(REFERENCE_SPECIFIER, "add", [bad, 0])).rejects.toThrow(
        /expects i32/
      );
    }
    // The int32 boundaries themselves are in range.
    await expect(
      dispatcher.call(REFERENCE_SPECIFIER, "add", [2147483647, 0])
    ).resolves.toBe(2147483647);
  });

  it("accepts NaN and infinities for floats, and rejects a wrong argument count", async () => {
    const { dispatcher } = dispatcherFor();
    await expect(
      dispatcher.call(REFERENCE_SPECIFIER, "scale", [Number.POSITIVE_INFINITY])
    ).resolves.toBeTypeOf("number");
    await expect(dispatcher.call(REFERENCE_SPECIFIER, "scale", [Number.NaN])).resolves
      .toBeTypeOf("number");
    await expect(dispatcher.call(REFERENCE_SPECIFIER, "add", [1])).rejects.toThrow(
      /takes 2 arguments, received 1/
    );
    await expect(dispatcher.call(REFERENCE_SPECIFIER, "add", "nope")).rejects.toThrow(
      /non-list argument/
    );
  });
});

describe("WASM dispatcher boundary", () => {
  it("serves only the modules and exports the run declared", async () => {
    const { dispatcher } = dispatcherFor();
    await expect(dispatcher.call("@other/pack/scalar", "add", [1, 2])).rejects.toThrow(
      /is not a WASM sandbox module declared by this node/
    );
    await expect(dispatcher.call(REFERENCE_SPECIFIER, "sum-f32", [1, 2])).rejects.toThrow(
      /has no export named/
    );
    await expect(dispatcher.call(REFERENCE_SPECIFIER, "grow", [1])).rejects.toThrow(
      /has no export named/
    );
    await expect(dispatcher.call({ toString: () => REFERENCE_SPECIFIER }, "add", [1, 2]))
      .rejects.toThrow(/is not a WASM sandbox module declared by this node/);
  });

  it("has no dispatcher at all for a run with no WASM modules", () => {
    expect(createSandboxWasmDispatcher([])).toBeUndefined();
  });
});

describe("WASM budgets", () => {
  it("exhausts the call count and names the budget and the module", async () => {
    const { dispatcher } = dispatcherFor({ limits: { callsPerInvocation: 2 } });
    expect(dispatcher.budgets.callsPerInvocation).toBe(2);
    await dispatcher.call(REFERENCE_SPECIFIER, "bump", []);
    await dispatcher.call(REFERENCE_SPECIFIER, "bump", []);
    await expect(dispatcher.call(REFERENCE_SPECIFIER, "bump", [])).rejects.toThrow(
      new RegExp(`${REFERENCE_SPECIFIER}.*budget of 2 WASM calls per invocation`)
    );
  });

  it("exhausts the aggregate wall clock and names the budget and the module", async () => {
    // A call is never allowed to outlive the invocation's remaining aggregate
    // budget, so a 60 ms call under a 30 ms budget is cut at 30 — and the
    // budget is then spent, which is what the next call is told.
    const { dispatcher } = dispatcherFor(
      { limits: { wallClockMs: 30 } },
      new FakeFactory(60)
    );
    await expect(dispatcher.call(REFERENCE_SPECIFIER, "bump", [])).rejects.toThrow(
      /per-call timeout/
    );
    await expect(dispatcher.call(REFERENCE_SPECIFIER, "bump", [])).rejects.toThrow(
      new RegExp(`${REFERENCE_SPECIFIER}.*budget of 30 ms of WASM wall clock`)
    );
  });

  it("never admits more wall clock than the cap, however many calls run at once", async () => {
    // Two calls run concurrently under the default concurrency of 2. Each is
    // admitted against what is left *after* the other reserved, so the budget
    // the two are handed sums to the cap rather than to twice it. The worker
    // never answers, so each call spends exactly the timeout it was admitted
    // with, and the error names that number.
    const { dispatcher, pool } = dispatcherFor(
      { limits: { wallClockMs: 60, callTimeoutMs: 50 } },
      hangingFactory
    );

    const settled = await Promise.allSettled([
      dispatcher.call(REFERENCE_SPECIFIER, "spin", []),
      dispatcher.call(REFERENCE_SPECIFIER, "spin", [])
    ]);

    const admitted = settled.map((outcome) => {
      expect(outcome.status).toBe("rejected");
      const message = String(
        (outcome as PromiseRejectedResult).reason?.message ?? ""
      );
      const timeout = /exceeded its (\d+) ms per-call timeout/.exec(message);
      // A call refused outright admits nothing — that is the other legal
      // answer for the second call.
      if (timeout === null) {
        expect(message).toMatch(/budget of 60 ms of WASM wall clock/);
        return 0;
      }
      return Number(timeout[1]);
    });

    expect(admitted[0]).toBe(50);
    expect(admitted.reduce((sum, ms) => sum + ms, 0)).toBeLessThanOrEqual(60);
    // And the cap is spent: nothing further is admitted.
    await expect(dispatcher.call(REFERENCE_SPECIFIER, "spin", [])).rejects.toThrow(
      /budget of 60 ms of WASM wall clock/
    );
    pool.dispose();
  });

  it("refunds a reservation a fast call did not spend", async () => {
    // Each call reserves its whole per-call timeout up front. Without the
    // refund on completion, three 80 ms reservations would exhaust a 200 ms
    // budget even though the calls take no time at all.
    const { dispatcher } = dispatcherFor(
      { limits: { wallClockMs: 200, callTimeoutMs: 80 } },
      new FakeFactory()
    );

    for (let call = 0; call < 5; call += 1) {
      await expect(
        dispatcher.call(REFERENCE_SPECIFIER, "add", [7, 0])
      ).resolves.toBe(7);
    }
  });

  it("holds the per-invocation call concurrency at two", async () => {
    const factory = new FakeFactory(15);
    const { dispatcher } = dispatcherFor({}, factory);
    expect(dispatcher.budgets.callConcurrency).toBe(2);
    await Promise.all(
      Array.from({ length: 6 }, () => dispatcher.call(REFERENCE_SPECIFIER, "bump", []))
    );
    expect(factory.peak).toBeLessThanOrEqual(2);
    expect(dispatcher.peakConcurrency).toBe(2);
  });

  it("lets a manifest lower a budget, never raise one", () => {
    const { dispatcher } = dispatcherFor({
      limits: { callConcurrency: 1, callsPerInvocation: 8, wallClockMs: 1000 }
    });
    expect(dispatcher.budgets).toEqual({
      callConcurrency: 1,
      callsPerInvocation: 8,
      wallClockMs: 1000
    });
  });
});

describe("WASM worker pool", () => {
  it("terminates and replaces a worker whose call overruns", async () => {
    const pool = new WasmWorkerPool(2, hangingFactory);
    const dispatcher = createSandboxWasmDispatcher(
      [referenceWasmModule({ limits: { callTimeoutMs: 30 } })],
      { pool }
    );
    await expect(dispatcher?.call(REFERENCE_SPECIFIER, "spin", [])).rejects.toThrow(
      /exceeded its 30 ms per-call timeout; the worker was terminated and replaced/
    );
    expect(pool.replacements).toBe(1);
    // The killed worker is not returned to the pool, so the next call gets a
    // freshly created one rather than the corpse.
    await expect(dispatcher?.call(REFERENCE_SPECIFIER, "spin", [])).rejects.toThrow(
      /per-call timeout/
    );
    expect(pool.replacements).toBe(2);
    pool.dispose();
  });

  it("compiles a module once per process", async () => {
    const bytes = referenceWasmModule().bytes;
    const first = await compileSandboxWasm("digest-a", bytes);
    const second = await compileSandboxWasm("digest-a", bytes);
    expect(second).toBe(first);
    resetSandboxWasmModuleCache();
    expect(await compileSandboxWasm("digest-a", bytes)).not.toBe(first);
  });
});
