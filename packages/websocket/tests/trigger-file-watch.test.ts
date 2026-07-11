/**
 * Tests for the file-watch adapter (Task 12) and downtime catch-up (Task 13).
 *
 * fs.watch is OS-dependent, so live-event assertions poll the durable
 * `trigger_inputs` table with a timeout helper rather than sleeping a fixed
 * amount. Deterministic behavior (config diffing, catch-up synthesis, missing
 * path handling) is driven through `reconcileFileWatchers` with an explicit
 * watcher map; the real `startFileWatchAdapter` stop path is exercised for the
 * snapshot-on-stop case.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  initTestDb,
  TriggerRegistration,
  TriggerInput
} from "@nodetool-ai/models";
import { setTriggerWakeupService } from "../src/triggers/dispatcher.js";
import {
  reconcileFileWatchers,
  startFileWatchAdapter
} from "../src/triggers/file-watch.js";

// Local minimal shape for the exported reconcile map; the adapter's WatcherEntry
// is internal, so tests only ever inspect map size / membership and call close.
type WatcherMap = Parameters<typeof reconcileFileWatchers>[0];

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/** The absolute path the adapter emits for a file directly under tmpDir. */
function emittedPath(name: string): string {
  return path.join(path.resolve(tmpDir), name);
}

async function waitFor<T>(
  fn: () => Promise<T | null | undefined | false>,
  timeoutMs = 5000,
  stepMs = 50
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T | null | undefined | false = null;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last as T;
    await sleep(stepMs);
  }
  throw new Error(`waitFor timed out (last=${JSON.stringify(last)})`);
}

async function unprocessed(): Promise<TriggerInput[]> {
  return TriggerInput.findUnprocessed(100);
}

function closeAll(watchers: WatcherMap): void {
  for (const entry of watchers.values()) {
    (entry as { close: () => void }).close();
  }
  watchers.clear();
}

let tmpDir: string;

async function seedFileWatch(
  config: Record<string, unknown>,
  overrides: Record<string, unknown> = {}
): Promise<TriggerRegistration> {
  const reg = new TriggerRegistration({
    user_id: "u1",
    workflow_id: "wf-1",
    node_id: "node-1",
    kind: "file_watch",
    config_json: config,
    enabled: 1,
    ...overrides
  });
  await reg.save();
  return reg;
}

describe("file-watch adapter", () => {
  beforeEach(() => {
    initTestDb();
    setTriggerWakeupService(null);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "filewatch-test-"));
  });

  afterEach(() => {
    setTriggerWakeupService(null);
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  });

  it("delivers one input with the node payload shape on a matching create", async () => {
    await seedFileWatch({ path: tmpDir, patterns: ["*.txt"] });

    const watchers: WatcherMap = new Map();
    await reconcileFileWatchers(watchers);
    expect(watchers.size).toBe(1);
    await sleep(80); // let fs.watch arm

    const filePath = path.join(tmpDir, "hello.txt");
    fs.writeFileSync(filePath, "hi");

    const inputs = await waitFor(async () => {
      const all = await unprocessed();
      return all.length > 0 ? all : null;
    });
    closeAll(watchers);

    const payload = inputs[0].payload_json as Record<string, unknown>;
    expect(payload.event).toBe("created");
    expect(payload.path).toBe(emittedPath("hello.txt"));
    expect(payload.dest_path).toBe("");
    expect(payload.is_directory).toBe(false);
    expect(typeof payload.timestamp).toBe("string");
  });

  it("honors ignore patterns", async () => {
    await seedFileWatch({
      path: tmpDir,
      patterns: ["*"],
      ignore_patterns: ["*.tmp"]
    });

    const watchers: WatcherMap = new Map();
    await reconcileFileWatchers(watchers);
    await sleep(80);

    fs.writeFileSync(path.join(tmpDir, "skip.tmp"), "x");
    fs.writeFileSync(path.join(tmpDir, "keep.txt"), "y");

    const inputs = await waitFor(async () => {
      const all = await unprocessed();
      return all.some(
        (i) =>
          (i.payload_json as Record<string, unknown>).path ===
          emittedPath("keep.txt")
      )
        ? all
        : null;
    });
    closeAll(watchers);

    const paths = inputs.map(
      (i) => (i.payload_json as Record<string, unknown>).path
    );
    expect(paths).not.toContain(emittedPath("skip.tmp"));
  });

  it("collapses rapid writes (dedupe by inputId; at least one input)", async () => {
    // Debounce is best-effort across platforms. The stronger guarantee is that
    // deterministic input ids dedupe fs.watch double-fires: assert at-least-once
    // and that every stored input id is distinct.
    await seedFileWatch({
      path: tmpDir,
      patterns: ["*.txt"],
      debounce_seconds: 1
    });

    const watchers: WatcherMap = new Map();
    await reconcileFileWatchers(watchers);
    await sleep(80);

    const filePath = path.join(tmpDir, "busy.txt");
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(filePath, `write-${i}`);
    }

    const inputs = await waitFor(async () => {
      const all = await unprocessed();
      return all.length > 0 ? all : null;
    });
    await sleep(150); // allow any stragglers to land (should be deduped/debounced)
    closeAll(watchers);

    const finalInputs = await unprocessed();
    const ids = finalInputs.map((i) => i.input_id);
    expect(ids.length).toBeGreaterThanOrEqual(1);
    expect(new Set(ids).size).toBe(ids.length); // all distinct
  });

  it("closes the watcher after the registration is disabled", async () => {
    const reg = await seedFileWatch({ path: tmpDir, patterns: ["*"] });

    const watchers: WatcherMap = new Map();
    await reconcileFileWatchers(watchers);
    expect(watchers.has(reg.id)).toBe(true);

    reg.enabled = 0;
    await reg.save();
    await reconcileFileWatchers(watchers);

    expect(watchers.has(reg.id)).toBe(false);
    expect(watchers.size).toBe(0);
  });

  it("records last_error for a missing path and recovers when it appears", async () => {
    const missing = path.join(tmpDir, "not-yet");
    const reg = await seedFileWatch({ path: missing, patterns: ["*"] });

    const watchers: WatcherMap = new Map();
    // Must not throw.
    await reconcileFileWatchers(watchers);
    expect(watchers.size).toBe(0);

    const reloaded = (await TriggerRegistration.get(
      reg.id
    )) as TriggerRegistration;
    expect(reloaded.last_error).toBeTruthy();

    // Path appears — next reconcile starts watching and clears the error.
    fs.mkdirSync(missing);
    await reconcileFileWatchers(watchers);
    expect(watchers.size).toBe(1);

    const cleared = (await TriggerRegistration.get(
      reg.id
    )) as TriggerRegistration;
    expect(cleared.last_error).toBeNull();
    closeAll(watchers);
  });

  it("catch_up: persists a snapshot on stop", async () => {
    await seedFileWatch({ path: tmpDir, patterns: ["*.txt"], catch_up: true });

    const stop = startFileWatchAdapter({ resyncMs: 1_000_000 });
    // Baseline snapshot (empty dir → "{}") is written once the watcher arms.
    await waitFor(async () => {
      const regs = await TriggerRegistration.findByWorkflow("wf-1");
      return regs[0]?.cursor != null ? regs[0].cursor : null;
    });

    fs.writeFileSync(path.join(tmpDir, "late.txt"), "z");
    await sleep(80);

    stop();

    const cursor = await waitFor(async () => {
      const regs = await TriggerRegistration.findByWorkflow("wf-1");
      const c = regs[0]?.cursor;
      return c && c.includes("late.txt") ? c : null;
    });
    const snapshot = JSON.parse(cursor) as Record<string, number>;
    expect(Object.keys(snapshot)).toContain("late.txt");
  });

  it("catch_up: synthesizes a modified event for an offline change", async () => {
    const filePath = path.join(tmpDir, "doc.txt");
    fs.writeFileSync(filePath, "original");
    const staleMtime =
      Math.round(fs.statSync(filePath).mtimeMs) - 60_000; // clearly older

    await seedFileWatch(
      { path: tmpDir, patterns: ["*.txt"], catch_up: true },
      { cursor: JSON.stringify({ "doc.txt": staleMtime }) }
    );

    const watchers: WatcherMap = new Map();
    await reconcileFileWatchers(watchers);
    closeAll(watchers);

    const modified = await waitFor(async () => {
      const all = await unprocessed();
      const hit = all.find(
        (i) => (i.payload_json as Record<string, unknown>).event === "modified"
      );
      return hit ?? null;
    });
    const payload = modified.payload_json as Record<string, unknown>;
    expect(payload.path).toBe(emittedPath("doc.txt"));

    // Baseline refreshed to the real mtime.
    const reg = (await TriggerRegistration.findByWorkflow("wf-1"))[0];
    const snapshot = JSON.parse(reg.cursor ?? "{}") as Record<string, number>;
    expect(snapshot["doc.txt"]).toBe(Math.round(fs.statSync(filePath).mtimeMs));
  });

  it("does not synthesize or snapshot when catch_up is absent", async () => {
    const filePath = path.join(tmpDir, "pre.txt");
    fs.writeFileSync(filePath, "pre-existing");
    const seededCursor = JSON.stringify({ "pre.txt": 1 });

    await seedFileWatch(
      { path: tmpDir, patterns: ["*.txt"] },
      { cursor: seededCursor }
    );

    const watchers: WatcherMap = new Map();
    await reconcileFileWatchers(watchers);
    await sleep(120);
    closeAll(watchers);

    // No catch-up: the pre-existing file yields no synthesized input.
    expect(await unprocessed()).toHaveLength(0);
    // Cursor left untouched (no snapshot written for a non-catch_up reg).
    const reg = (await TriggerRegistration.findByWorkflow("wf-1"))[0];
    expect(reg.cursor).toBe(seededCursor);
  });
});
