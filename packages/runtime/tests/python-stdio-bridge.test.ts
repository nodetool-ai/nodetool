/**
 * Integration tests for {@link PythonStdioBridge} against a faithful stdio
 * fake worker (`tests/fixtures/fake-python-stdio-worker.ts`) that speaks the
 * REAL length-prefixed msgpack framing over a real child process — closing
 * the gap noted in docs/RELIABILITY_ARCHITECTURE.md §1: only a differently
 * framed (length-prefix-free) WebSocket fake existed before this file.
 *
 * The fake is launched through `fake-python-interpreter.mjs`, which stands in
 * for the `python` executable `PythonStdioBridge` always spawns with
 * `-m nodetool.worker --stdio` — see that file for why the indirection exists.
 */

import { describe, it, expect, afterEach } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { PythonStdioBridge } from "../src/python-stdio-bridge.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FAKE_INTERPRETER = resolve(
  __dirname,
  "fixtures/fake-python-interpreter.mjs"
);

// Matches the bridge's own production default. At 5s a loaded CI runner lost
// the race often enough to fail unrelated PRs: the spawn deadline elapsed
// before the fake interpreter reported ready, so tests asserting on framing or
// status errors saw a startup timeout instead. Tests that mean to exercise the
// deadline itself pass an explicit short value.
const DEFAULT_TEST_TIMEOUT_MS = 20000;

function makeBridge(
  env: Record<string, string> = {},
  options: { startupTimeoutMs?: number; statusTimeoutMs?: number } = {}
): PythonStdioBridge {
  const prevEnv: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    prevEnv[key] = process.env[key];
    process.env[key] = env[key];
  }
  const bridge = new PythonStdioBridge({
    pythonPath: FAKE_INTERPRETER,
    startupTimeoutMs: options.startupTimeoutMs ?? DEFAULT_TEST_TIMEOUT_MS,
    statusTimeoutMs: options.statusTimeoutMs ?? DEFAULT_TEST_TIMEOUT_MS
  });
  // The spawned child inherits process.env synchronously when connect() is
  // called, so the env stays set for the whole test body; afterEach restores
  // it once the bridge is closed.
  (bridge as unknown as { __restoreEnv?: () => void }).__restoreEnv = () => {
    for (const key of Object.keys(prevEnv)) {
      if (prevEnv[key] === undefined) delete process.env[key];
      else process.env[key] = prevEnv[key];
    }
  };
  return bridge;
}

const openBridges: PythonStdioBridge[] = [];
function track(bridge: PythonStdioBridge): PythonStdioBridge {
  openBridges.push(bridge);
  return bridge;
}

afterEach(() => {
  for (const bridge of openBridges.splice(0)) {
    try {
      bridge.close();
    } catch {
      // best-effort cleanup
    }
    (bridge as unknown as { __restoreEnv?: () => void }).__restoreEnv?.();
  }
});

describe("PythonStdioBridge against the faithful stdio fake", () => {
  it("connects (discover + worker.status) and executes a node round-trip", async () => {
    const bridge = track(makeBridge({ FAKE_WORKER_NODE_TYPE: "fake.RoundTrip" }));
    await bridge.connect();

    expect(bridge.isConnected).toBe(true);
    expect(bridge.hasNodeType("fake.RoundTrip")).toBe(true);

    const result = await bridge.execute(
      "fake.RoundTrip",
      { value: "hello-from-test" },
      {},
      {}
    );
    expect(result.outputs).toEqual({ out: "hello-from-test" });
    expect(result.blobs).toEqual({});
  });

  it("reassembles a frame split across multiple stdout chunks", async () => {
    const bridge = track(
      makeBridge({ FAKE_WORKER_SPLIT_FRAMES: "1", FAKE_WORKER_NODE_TYPE: "fake.Split" })
    );
    await bridge.connect();

    expect(bridge.isConnected).toBe(true);
    expect(bridge.hasNodeType("fake.Split")).toBe(true);
  });

  it("parses multiple frames delivered in a single stdout chunk", async () => {
    const bridge = track(
      makeBridge({ FAKE_WORKER_COALESCE_FILLER: "1", FAKE_WORKER_NODE_TYPE: "fake.Coalesced" })
    );
    await bridge.connect();

    expect(bridge.isConnected).toBe(true);
    expect(bridge.hasNodeType("fake.Coalesced")).toBe(true);
  });

  it("times out connect() when the worker never becomes ready", async () => {
    const bridge = track(
      makeBridge({ FAKE_WORKER_MODE: "never-ready" }, { startupTimeoutMs: 300 })
    );
    await expect(bridge.connect()).rejects.toThrow(/did not become ready/i);
    expect(bridge.isConnected).toBe(false);
  });

  it("fails connect() with EPIPE when the worker's read pipe is already broken", async () => {
    // The close fires before the fixture even becomes ready (READY_DELAY_MS
    // gives it a head start), so the very first write connect() makes
    // (discover) hits a genuinely broken pipe. A write to a closed pipe does
    // not throw synchronously in Node — it surfaces asynchronously as an
    // 'error' on the stdin stream, which is exactly why `_send` alone isn't
    // enough and the bridge keeps a dedicated stdin 'error' listener (see its
    // comment) to reject in-flight requests instead of crashing the process.
    const bridge = track(
      makeBridge(
        {
          FAKE_WORKER_CLOSE_STDIN_AFTER_MS: "0",
          FAKE_WORKER_READY_DELAY_MS: "400"
        },
        { startupTimeoutMs: 30000 }
      )
    );
    await expect(bridge.connect()).rejects.toThrow(/stdin error.*EPIPE/i);
    expect(bridge.isConnected).toBe(false);
  });

  it("rejects pending requests when the worker exits mid-request", async () => {
    const bridge = track(
      makeBridge({ FAKE_WORKER_EXIT_ON_TYPE: "execute" })
    );
    await bridge.connect();
    expect(bridge.isConnected).toBe(true);

    await expect(
      bridge.execute("fake.TestNode", { value: "x" }, {}, {})
    ).rejects.toThrow(/exited with code/i);
    expect(bridge.isConnected).toBe(false);
  });

  it("fails the whole connection on a framing violation (bad length prefix)", async () => {
    const bridge = track(
      makeBridge({ FAKE_WORKER_BAD_LENGTH_ON_TYPE: "discover" })
    );
    await expect(bridge.connect()).rejects.toThrow(/frame exceeds max size/i);
    expect(bridge.isConnected).toBe(false);
  });

  it("delivers valid frames that precede a corrupt one in the same chunk before failing", async () => {
    const bridge = track(
      makeBridge({ FAKE_WORKER_BAD_LENGTH_AFTER_COUNT: "2" })
    );
    await bridge.connect();
    expect(bridge.isConnected).toBe(true);

    // The fake worker buffers both `execute` results and writes them to
    // stdout together with a trailing bad-length frame in a single chunk:
    // both requests below must still resolve with their own results before
    // the connection is failed by the corrupt frame that follows them.
    const [first, second] = await Promise.all([
      bridge.execute("fake.TestNode", { value: "a" }, {}, {}),
      bridge.execute("fake.TestNode", { value: "b" }, {}, {})
    ]);
    expect(first.outputs.out).toBe("a");
    expect(second.outputs.out).toBe("b");

    // The connection is then failed by the corrupt frame that followed them.
    await new Promise((r) => setTimeout(r, 50));
    expect(bridge.isConnected).toBe(false);
  });
});
