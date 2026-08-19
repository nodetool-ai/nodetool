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
  SandboxWasmError,
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
  /** Calls that reached a worker, so a test can prove one never was sent. */
  dispatched = 0;
  constructor(private readonly delayMs = 0) {}
  create(): Promise<WasmCallWorker> {
    this.created += 1;
    const factory = this;
    let dead = false;
    return Promise.resolve({
      async call(request: WasmCallRequest) {
        factory.dispatched += 1;
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

/** A hanging worker that records the terminations aimed at it. */
class HangingFactory implements WasmWorkerFactory {
  terminated = 0;
  private signalStarted: (() => void) | undefined;
  /** Resolves once a call has reached the worker and started hanging. */
  readonly started = new Promise<void>((resolve) => {
    this.signalStarted = resolve;
  });
  create(): Promise<WasmCallWorker> {
    const factory = this;
    return Promise.resolve({
      call: () => {
        factory.signalStarted?.();
        return new Promise<{ value: number | undefined }>(() => {});
      },
      terminate() {
        factory.terminated += 1;
      }
    });
  }
}

function dispatcherFor(
  options: Parameters<typeof referenceWasmModule>[0] = {},
  factory: WasmWorkerFactory = new FakeFactory(),
  signal?: AbortSignal
) {
  const pool = new WasmWorkerPool(4, factory);
  const dispatcher = createSandboxWasmDispatcher([referenceWasmModule(options)], {
    pool,
    ...(signal === undefined ? {} : { signal })
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
      /is not a WASM sandbox module this run serves/
    );
    await expect(dispatcher.call(REFERENCE_SPECIFIER, "sum-f32", [1, 2])).rejects.toThrow(
      /has no export named/
    );
    await expect(dispatcher.call(REFERENCE_SPECIFIER, "grow", [1])).rejects.toThrow(
      /has no export named/
    );
    await expect(dispatcher.call({ toString: () => REFERENCE_SPECIFIER }, "add", [1, 2]))
      .rejects.toThrow(/is not a WASM sandbox module this run serves/);
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

  it("keeps a timeout-cut call's full reservation even when the kill measures early", async () => {
    // The pool's timer can fire a millisecond before Date.now() sees the
    // reservation elapse. A settle that charges measured time would refund
    // that sliver and admit a next call the documented budget refuses. This
    // pool makes the race deterministic: the timeout kill settles instantly,
    // so measured time is ~0 and only a reservation-floored charge exhausts
    // the budget.
    class InstantTimeoutPool extends WasmWorkerPool {
      override run(
        _module: WebAssembly.Module,
        exportName: string,
        _args: readonly number[],
        timeoutMs: number
      ): Promise<number | undefined> {
        return Promise.reject(
          new SandboxWasmError(
            `WASM call ${exportName} exceeded its ${timeoutMs} ms per-call timeout; the worker was terminated and replaced`
          )
        );
      }
    }
    const pool = new InstantTimeoutPool(4, hangingFactory);
    const dispatcher = createSandboxWasmDispatcher(
      [referenceWasmModule({ limits: { wallClockMs: 60, callTimeoutMs: 50 } })],
      { pool }
    );
    if (dispatcher === undefined) throw new Error("expected a dispatcher");

    await expect(dispatcher.call(REFERENCE_SPECIFIER, "spin", [])).rejects.toThrow(
      /exceeded its 50 ms per-call timeout/
    );
    await expect(dispatcher.call(REFERENCE_SPECIFIER, "spin", [])).rejects.toThrow(
      /exceeded its 10 ms per-call timeout/
    );
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

  it("terminates the worker of a call cancelled while it runs", async () => {
    // The guest export has no yield point, so abandoning the promise would
    // leave the worker spinning for the whole 5 s timeout. Cancellation has to
    // reach the thread, and the caller must not wait for that timeout to hear
    // about it.
    const factory = new HangingFactory();
    const controller = new AbortController();
    const { dispatcher, pool } = dispatcherFor(
      { limits: { callTimeoutMs: 5_000, wallClockMs: 5_000 } },
      factory,
      controller.signal
    );

    const call = dispatcher.call(REFERENCE_SPECIFIER, "spin", []);
    // Abort only once the call is really running in the worker — a timer
    // could fire while the call is still on its way to dispatch, where the
    // signal recheck drops it without a worker to terminate.
    await factory.started;
    controller.abort();
    await expect(call).rejects.toThrow(/the run was cancelled/);
    expect(factory.terminated).toBe(1);
    pool.dispose();
  });

  it("drops a call cancelled while it waits for a slot, without waiting for one", async () => {
    // Concurrency is two, so the third call is parked in the queue behind two
    // 300 ms calls. It must leave the queue when the run is cancelled — not be
    // admitted 300 ms later only to be turned away, and never dispatched.
    const factory = new FakeFactory(300);
    const controller = new AbortController();
    const { dispatcher, pool } = dispatcherFor(
      { limits: { callTimeoutMs: 2_000, wallClockMs: 5_000 } },
      factory,
      controller.signal
    );

    const startedAt = Date.now();
    let queuedElapsed = Number.POSITIVE_INFINITY;
    const calls = Array.from({ length: 3 }, () =>
      dispatcher.call(REFERENCE_SPECIFIER, "bump", [])
    );
    void calls[2]?.catch(() => {
      queuedElapsed = Date.now() - startedAt;
    });
    // Abort once the two admitted calls are actually on workers, not after a
    // fixed delay: worker startup is slower than any wall-clock guess on a
    // loaded runner, and aborting first left nothing dispatched at all.
    while (factory.dispatched < 2) await new Promise(setImmediate);
    controller.abort();
    const settled = await Promise.allSettled(calls);

    expect(settled[2]?.status).toBe("rejected");
    expect(
      String((settled[2] as PromiseRejectedResult).reason?.message ?? "")
    ).toMatch(/the run was cancelled/);
    expect(queuedElapsed).toBeLessThan(250);
    expect(factory.dispatched).toBe(2);
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
