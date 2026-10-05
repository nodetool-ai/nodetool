import { expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  createCapabilityRun,
  toolFromLazyCapability,
  UNGATED
} from "../src/capabilities/index.js";
import { sandboxToolBridgeGlobals } from "../src/sandbox-toolbelt.js";

it("a per-call abort does not stop an in-flight capability that waits on context.signal (Q4)", async () => {
  const action = new AbortController();
  const caller = new AbortController();
  // This boundary needs only a context variable bag and the caller's signal.
  const context = {
    get: () => undefined,
    signal: caller.signal
  } as unknown as ProcessingContext;
  let start: () => void = () => undefined;
  let release: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  const work = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tool = toolFromLazyCapability(
    {
      name: "signal_probe",
      description: "Probe cancellation",
      inputSchema: { type: "object", properties: {} },
      category: "read"
    },
    createCapabilityRun({ context, gate: UNGATED }),
    async (run) => {
      start();
      await work;
      run.context.signal.throwIfAborted();
      return { completed: true };
    }
  );
  const globals = sandboxToolBridgeGlobals(context, [tool], {
    signal: action.signal
  });
  const call = globals.__callTool;
  if (typeof call !== "function") throw new Error("Missing tool bridge");
  let finished = false;
  const result = call("signal_probe", "{}").then((value: unknown) => {
    finished = true;
    return value;
  });
  await started;
  action.abort(new Error("run_code timeout"));
  await Promise.resolve();
  expect(finished).toBe(false);
  expect(context.signal.aborted).toBe(false);
  release();
  expect(await result).toEqual({ ok: true, result: { completed: true } });
});
