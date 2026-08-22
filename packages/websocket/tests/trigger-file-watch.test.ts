import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { EventEmitter } from "node:events";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initTestDb, ModelObserver, TriggerRegistration } from "@nodetool-ai/models";
import { TriggerWakeupService } from "@nodetool-ai/kernel";
import {
  createFileWatchState,
  runFileWatchSweepOnce,
  startFileWatch,
  stopFileWatch
} from "../src/triggers/file-watch.js";

function mkTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "nodetool-file-watch-test-"));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class FakeWatcher extends EventEmitter implements fs.FSWatcher {
  close = vi.fn();

  ref(): this {
    return this;
  }

  unref(): this {
    return this;
  }
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2_000,
  stepMs = 20
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor timed out");
    }
    await sleep(stepMs);
  }
}

async function makeRegistration(
  overrides: Partial<{
    config: Record<string, unknown>;
    enabled: number;
    workflowId: string;
    nodeId: string;
  }> = {}
): Promise<TriggerRegistration> {
  return (await TriggerRegistration.create<TriggerRegistration>({
    user_id: "user-1",
    workflow_id: overrides.workflowId ?? "wf-1",
    node_id: overrides.nodeId ?? "n1",
    kind: "file_watch",
    config_json: overrides.config ?? {},
    enabled: overrides.enabled ?? 1
  })) as TriggerRegistration;
}

describe("file-watch adapter", () => {
  let tmpDir: string;
  let state: ReturnType<typeof createFileWatchState>;

  beforeEach(() => {
    initTestDb();
    tmpDir = mkTmpDir();
    state = createFileWatchState();
  });

  afterEach(async () => {
    await stopFileWatch(state);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    ModelObserver.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("runFileWatchSweepOnce", () => {
    it("delivers a created event with {event, path} when a matching file appears", async () => {
      const registration = await makeRegistration({
        config: { path: tmpDir, patterns: ["*.txt"], debounce_seconds: 0 }
      });
      const wakeupService = new TriggerWakeupService();
      const deliverSpy = vi.spyOn(wakeupService, "deliverTriggerInput");

      await runFileWatchSweepOnce(state, { wakeupService });

      const filePath = path.join(tmpDir, "a.txt");
      fs.writeFileSync(filePath, "hello");

      await waitFor(() => deliverSpy.mock.calls.length > 0);

      const call = deliverSpy.mock.calls[0][0];
      expect(call.runId).toBe(registration.workflow_id);
      expect(call.nodeId).toBe(registration.node_id);
      expect(call.payload).toMatchObject({
        event: "created",
        path: filePath
      });
    });

    it("ignores a file matched by an ignore pattern", async () => {
      await makeRegistration({
        config: {
          path: tmpDir,
          patterns: ["*"],
          ignore_patterns: ["*.log"],
          debounce_seconds: 0
        }
      });
      const wakeupService = new TriggerWakeupService();
      const deliverSpy = vi.spyOn(wakeupService, "deliverTriggerInput");

      await runFileWatchSweepOnce(state, { wakeupService });

      fs.writeFileSync(path.join(tmpDir, "ignored.log"), "x");
      // Give the (non-)event time to arrive if it were going to.
      await sleep(200);

      expect(deliverSpy).not.toHaveBeenCalled();
    });

    it("ignores a modified event for a path that does not exist", async () => {
      await makeRegistration({
        config: { path: tmpDir, patterns: ["*"], debounce_seconds: 0 }
      });
      const wakeupService = new TriggerWakeupService();
      const deliverSpy = vi.spyOn(wakeupService, "deliverTriggerInput");
      let listener:
        | ((
            eventType: "rename" | "change",
            filename: string | Buffer | null
          ) => void)
        | null = null;

      await runFileWatchSweepOnce(state, {
        wakeupService,
        watch: (_watchPath, _options, nextListener) => {
          listener = nextListener;
          return new FakeWatcher();
        }
      });

      if (!listener) throw new Error("Watcher listener was not installed");
      listener("change", path.basename(tmpDir));

      expect(deliverSpy).not.toHaveBeenCalled();
    });

    it("debounces repeated events for the same path", async () => {
      await makeRegistration({
        config: { path: tmpDir, patterns: ["*.txt"], debounce_seconds: 5 }
      });
      const wakeupService = new TriggerWakeupService();
      const deliverSpy = vi.spyOn(wakeupService, "deliverTriggerInput");

      await runFileWatchSweepOnce(state, { wakeupService });

      const filePath = path.join(tmpDir, "b.txt");
      fs.writeFileSync(filePath, "1");
      await waitFor(() => deliverSpy.mock.calls.length > 0);
      expect(deliverSpy).toHaveBeenCalledTimes(1);

      // A second write within the debounce window must be suppressed.
      fs.writeFileSync(filePath, "2");
      await sleep(200);
      expect(deliverSpy).toHaveBeenCalledTimes(1);
    });

    it("closes the watcher for a registration that becomes disabled", async () => {
      const registration = await makeRegistration({
        config: { path: tmpDir, patterns: ["*.txt"], debounce_seconds: 0 }
      });
      const wakeupService = new TriggerWakeupService();
      const deliverSpy = vi.spyOn(wakeupService, "deliverTriggerInput");

      await runFileWatchSweepOnce(state, { wakeupService });
      expect(state.has(registration.id)).toBe(true);

      registration.enabled = 0;
      await registration.save();
      await runFileWatchSweepOnce(state, { wakeupService });

      expect(state.has(registration.id)).toBe(false);

      fs.writeFileSync(path.join(tmpDir, "after-disable.txt"), "x");
      await sleep(200);

      expect(deliverSpy).not.toHaveBeenCalled();
    });

    it("skips a registration whose path does not exist and records last_error", async () => {
      const missingPath = path.join(tmpDir, "does-not-exist");
      const registration = await makeRegistration({
        config: { path: missingPath }
      });
      const wakeupService = new TriggerWakeupService();

      await runFileWatchSweepOnce(state, { wakeupService });

      expect(state.has(registration.id)).toBe(false);
      const updated = (await TriggerRegistration.get(
        registration.id
      )) as TriggerRegistration;
      expect(updated.last_error).toContain(missingPath);
    });

    it("never watches a disabled registration", async () => {
      const registration = await makeRegistration({
        config: { path: tmpDir },
        enabled: 0
      });
      const wakeupService = new TriggerWakeupService();

      await runFileWatchSweepOnce(state, { wakeupService });

      expect(state.has(registration.id)).toBe(false);
    });
  });

  describe("startFileWatch", () => {
    it("watches on start and stops watching once the handle is called", async () => {
      const registration = await makeRegistration({
        config: {
          path: tmpDir,
          patterns: ["*.txt"],
          // A single writeFileSync fires both a "rename" (create) and a
          // "change" (content write) native fs event; restrict to "created"
          // so this test's call count reflects one logical file appearing.
          events: ["created"],
          debounce_seconds: 0
        }
      });
      const wakeupService = new TriggerWakeupService();
      const deliverSpy = vi.spyOn(wakeupService, "deliverTriggerInput");

      const stop = startFileWatch({ wakeupService, intervalMs: 50 });
      try {
        // Sweep runs synchronously on start; give fs.watch a beat to attach.
        await sleep(50);

        fs.writeFileSync(path.join(tmpDir, "c.txt"), "1");
        await waitFor(() => deliverSpy.mock.calls.length > 0);
        expect(deliverSpy).toHaveBeenCalledTimes(1);
      } finally {
        await stop();
      }

      const callsAtStop = deliverSpy.mock.calls.length;
      fs.writeFileSync(path.join(tmpDir, "d.txt"), "1");
      await sleep(200);
      expect(deliverSpy.mock.calls.length).toBe(callsAtStop);
      void registration;
    });

    it("waits for an in-flight sweep before the stop handle resolves", async () => {
      const pendingFind = Promise.withResolvers<TriggerRegistration[]>();
      vi.spyOn(TriggerRegistration, "findEnabledByKind").mockReturnValue(
        pendingFind.promise
      );
      const wakeupService = new TriggerWakeupService();

      const stop = startFileWatch({ wakeupService, intervalMs: 50 });
      let stopResolved = false;
      const stopPromise = stop().then(() => {
        stopResolved = true;
      });

      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(stopResolved).toBe(false);

      pendingFind.resolve([]);
      await stopPromise;
      expect(stopResolved).toBe(true);
    });
  });

  describe("downtime catch-up", () => {
    it("synthesizes exactly one modified event for a file changed while stopped, when catch_up is true", async () => {
      const filePath = path.join(tmpDir, "a.txt");
      fs.writeFileSync(filePath, "before");

      const registration = await makeRegistration({
        config: {
          path: tmpDir,
          patterns: ["*.txt"],
          debounce_seconds: 0,
          catch_up: true
        }
      });
      const wakeupService = new TriggerWakeupService();
      const deliverSpy = vi.spyOn(wakeupService, "deliverTriggerInput");

      // First start: no cursor yet, nothing to catch up on.
      await runFileWatchSweepOnce(state, { wakeupService });
      expect(deliverSpy).not.toHaveBeenCalled();

      // Simulate downtime: stop (persists a {path -> mtime} snapshot into
      // `cursor`), then mutate the file while no watcher is attached.
      await stopFileWatch(state);
      const stopped = (await TriggerRegistration.get(
        registration.id
      )) as TriggerRegistration;
      expect(stopped.cursor).toBeTruthy();
      const snapshot = JSON.parse(stopped.cursor as string) as {
        entries: Record<string, number>;
      };
      expect(snapshot.entries[filePath]).toBeGreaterThan(0);

      // Ensure a distinguishable mtime on filesystems with coarse timestamp
      // resolution.
      const future = new Date(Date.now() + 5_000);
      fs.writeFileSync(filePath, "after");
      fs.utimesSync(filePath, future, future);

      // Restart: exactly one synthesized "modified" event, before any live
      // fs.watch event could fire (the write already happened).
      state = createFileWatchState();
      await runFileWatchSweepOnce(state, { wakeupService });

      expect(deliverSpy).toHaveBeenCalledTimes(1);
      const call = deliverSpy.mock.calls[0][0];
      expect(call.runId).toBe(registration.workflow_id);
      expect(call.nodeId).toBe(registration.node_id);
      expect(call.payload).toMatchObject({
        event: "modified",
        path: filePath
      });

      // The cursor is consumed once replayed so a later restart with no
      // further downtime does not re-diff against the same stale baseline.
      const afterRestart = (await TriggerRegistration.get(
        registration.id
      )) as TriggerRegistration;
      expect(afterRestart.cursor).toBeNull();
    });

    it("does not persist a snapshot or synthesize events when catch_up is absent (default)", async () => {
      const filePath = path.join(tmpDir, "b.txt");
      fs.writeFileSync(filePath, "before");

      const registration = await makeRegistration({
        config: { path: tmpDir, patterns: ["*.txt"], debounce_seconds: 0 }
      });
      const wakeupService = new TriggerWakeupService();
      const deliverSpy = vi.spyOn(wakeupService, "deliverTriggerInput");

      await runFileWatchSweepOnce(state, { wakeupService });
      await stopFileWatch(state);

      const stopped = (await TriggerRegistration.get(
        registration.id
      )) as TriggerRegistration;
      expect(stopped.cursor).toBeNull();

      const future = new Date(Date.now() + 5_000);
      fs.writeFileSync(filePath, "after");
      fs.utimesSync(filePath, future, future);

      state = createFileWatchState();
      await runFileWatchSweepOnce(state, { wakeupService });

      expect(deliverSpy).not.toHaveBeenCalled();
    });
  });
});
