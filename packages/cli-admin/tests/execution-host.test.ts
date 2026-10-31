import { beforeEach, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ install: vi.fn(), subscribe: vi.fn() }));
vi.mock("@nodetool-ai/compute", () => ({ installWorkerActivityHeartbeat: hooks.install }));
vi.mock("@nodetool-ai/runtime", () => ({ onPythonBridgeCreated: hooks.subscribe }));

beforeEach(() => { vi.resetModules(); hooks.install.mockReset(); });

it("binds worker activity to Python bridge creation once across concurrent bootstraps", async () => {
  const { initializeExecutionHost } = await import("../src/execution-host.js");
  expect(hooks.install).not.toHaveBeenCalled();
  await Promise.all([initializeExecutionHost(), initializeExecutionHost()]);
  expect(hooks.install).toHaveBeenCalledExactlyOnceWith(hooks.subscribe);
});

it("propagates configured heartbeat initialization failures", async () => {
  const failure = new Error("Worker heartbeat failed");
  hooks.install.mockImplementationOnce(() => { throw failure; });
  const { initializeExecutionHost } = await import("../src/execution-host.js");
  await expect(initializeExecutionHost()).rejects.toBe(failure);
});
