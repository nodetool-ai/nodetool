/**
 * The file-watch listener runs inside `fs.watch`, so anything it throws or
 * leaves rejected is an uncaught error that ends the server process.
 */
import * as os from "node:os";
import * as path from "node:path";
import { EventEmitter } from "node:events";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// A file that vanishes between "does it exist" and "stat it": the existence
// probe still reports it, the stat finds nothing.
vi.mock("node:fs", async (orig) => {
  const actual = await orig<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: (p: import("node:fs").PathLike) =>
      String(p).includes("vanished") ? true : actual.existsSync(p)
  };
});

import * as fs from "node:fs";
import { initTestDb, ModelObserver, TriggerRegistration } from "@nodetool-ai/models";
import { TriggerWakeupService } from "@nodetool-ai/kernel";
import {
  createFileWatchState,
  runFileWatchSweepOnce,
  stopFileWatch
} from "../src/triggers/file-watch.js";

class FakeWatcher extends EventEmitter {
  close = vi.fn();
  ref(): this {
    return this;
  }
  unref(): this {
    return this;
  }
}

type Listener = (
  eventType: "rename" | "change",
  filename: string | Buffer | null
) => void;

describe("file-watch listener races", () => {
  let tmpDir: string;
  let state: ReturnType<typeof createFileWatchState>;

  beforeEach(() => {
    initTestDb();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nodetool-fw-race-"));
    state = createFileWatchState();
  });

  afterEach(async () => {
    await stopFileWatch(state);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    ModelObserver.clear();
    vi.restoreAllMocks();
  });

  async function watchWithListener(
    wakeupService: TriggerWakeupService
  ): Promise<Listener> {
    await TriggerRegistration.create<TriggerRegistration>({
      user_id: "user-1",
      workflow_id: "wf-1",
      node_id: "n1",
      kind: "file_watch",
      config_json: { path: tmpDir, patterns: ["*"], debounce_seconds: 0 },
      enabled: 1
    });
    let listener: Listener | null = null;
    await runFileWatchSweepOnce(state, {
      wakeupService,
      watch: (_watchPath, _options, next) => {
        listener = next as Listener;
        return new FakeWatcher() as unknown as fs.FSWatcher;
      }
    });
    if (!listener) throw new Error("Watcher listener was not installed");
    return listener;
  }

  it("treats a file removed before the stat as deleted instead of throwing", async () => {
    const wakeupService = new TriggerWakeupService();
    const deliverSpy = vi
      .spyOn(wakeupService, "deliverTriggerInput")
      .mockResolvedValue(undefined as never);
    const listener = await watchWithListener(wakeupService);

    expect(() => listener("rename", "vanished.txt")).not.toThrow();
    await vi.waitFor(() => expect(deliverSpy).toHaveBeenCalledTimes(1));
    expect(deliverSpy.mock.calls[0][0].payload).toMatchObject({
      event: "deleted"
    });
  });

  it("does not leave a failed registration save unhandled", async () => {
    const wakeupService = new TriggerWakeupService();
    vi.spyOn(wakeupService, "deliverTriggerInput").mockResolvedValue(
      undefined as never
    );
    const saveSpy = vi
      .spyOn(TriggerRegistration, "updateColumns")
      .mockRejectedValue(new Error("database is locked"));
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const listener = await watchWithListener(wakeupService);
      fs.writeFileSync(path.join(tmpDir, "a.txt"), "x");
      listener("rename", "a.txt");
      await vi.waitFor(() => expect(saveSpy).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("does not undo a Stop or a failure count written after the watcher attached", async () => {
    const wakeupService = new TriggerWakeupService();
    vi.spyOn(wakeupService, "deliverTriggerInput").mockResolvedValue(
      undefined as never
    );
    const listener = await watchWithListener(wakeupService);
    const [registration] = await TriggerRegistration.findByWorkflow("wf-1");
    // The user presses Stop and the dispatcher has counted failures since.
    await TriggerRegistration.updateColumns(registration.id, {
      enabled: 0,
      consecutive_failures: 4
    });

    fs.writeFileSync(path.join(tmpDir, "b.txt"), "x");
    listener("rename", "b.txt");

    await vi.waitFor(async () => {
      const row = await TriggerRegistration.get<TriggerRegistration>(
        registration.id
      );
      expect(row?.last_fired_at).not.toBeNull();
    });
    const row = await TriggerRegistration.get<TriggerRegistration>(
      registration.id
    );
    expect(row?.enabled).toBe(0);
    expect(row?.consecutive_failures).toBe(4);
  });
});
