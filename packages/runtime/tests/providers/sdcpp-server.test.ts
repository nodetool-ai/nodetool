import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("@nodetool-ai/config", async (original) => {
  const actual = await original<typeof import("@nodetool-ai/config")>();
  return {
    ...actual,
    importNodeBuiltin: async (name: string) =>
      name === "node:child_process" ? { spawn: mocks.spawn } : import(name)
  };
});

import { stopSdServer, withSdServer } from "../../src/providers/sdcpp-server.js";

class FakeChild extends EventEmitter {
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn(() => {
    if (this.exitCode === null && this.signalCode === null) {
      this.signalCode = "SIGTERM";
      this.emit("exit", null, this.signalCode);
    }
    return true;
  });
}

const launch = { binary: "sd-server", args: ["--model", "model"] };

afterEach(async () => {
  await stopSdServer();
  vi.unstubAllGlobals();
  mocks.spawn.mockReset();
});

describe("sd-server lifecycle", () => {
  it("restarts and waits for readiness after startup is canceled", async () => {
    const children: FakeChild[] = [];
    mocks.spawn.mockImplementation(() => {
      const child = new FakeChild();
      children.push(child);
      return child;
    });
    const controller = new AbortController();
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => {
        setTimeout(() => controller.abort(), 10);
        throw new Error("not listening");
      })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const work = vi.fn(async () => "done");

    await expect(withSdServer(launch, controller.signal, work)).rejects.toMatchObject({ name: "AbortError" });
    expect(work).not.toHaveBeenCalled();
    await expect(withSdServer(launch, undefined, work)).resolves.toBe("done");
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(children[0].kill).toHaveBeenCalled();
  });

  it("keeps a ready server when work is canceled", async () => {
    const child = new FakeChild();
    mocks.spawn.mockReturnValue(child);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    await expect(withSdServer(launch, controller.signal, async () => {
      controller.abort();
      controller.signal.throwIfAborted();
    })).rejects.toMatchObject({ name: "AbortError" });
    await withSdServer(launch, undefined, async () => undefined);
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(child.kill).not.toHaveBeenCalled();
  });

  it("restarts a server that exited from a signal", async () => {
    const children: FakeChild[] = [];
    mocks.spawn.mockImplementation(() => {
      const child = new FakeChild();
      children.push(child);
      return child;
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await withSdServer(launch, undefined, async () => undefined);
    children[0].signalCode = "SIGKILL";
    children[0].emit("exit", null, "SIGKILL");
    await withSdServer(launch, undefined, async () => undefined);
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
