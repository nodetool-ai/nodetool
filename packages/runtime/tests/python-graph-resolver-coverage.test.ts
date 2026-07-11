/**
 * Coverage tests for python-graph-resolver: the branches the base test skips —
 * the "needs Python" path where a bridge is actually connected (success,
 * local-failure fallthrough, remote-failure surfacing) and executor resolution
 * reading node.data / metadata output types.
 *
 * createPythonBridge is mocked so no worker is ever spawned.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({
  makeBridge: null as ((opts: unknown) => unknown) | null
}));

vi.mock("../src/python-bridge-factory.js", () => ({
  createPythonBridge: (opts: unknown) => {
    if (!h.makeBridge) throw new Error("makeBridge not set");
    return h.makeBridge(opts);
  }
}));

import {
  connectPythonBridgeForGraph,
  resolvePythonNodeExecutor
} from "../src/python-graph-resolver.js";
import { PythonNodeExecutor } from "../src/python-node-executor.js";
import type { PythonBridgeBase } from "../src/python-bridge-base.js";

const ENV_KEY = "NODETOOL_WORKER_URL";

describe("connectPythonBridgeForGraph (needs Python)", () => {
  let savedUrl: string | undefined;

  beforeEach(() => {
    savedUrl = process.env[ENV_KEY];
    delete process.env[ENV_KEY];
    h.makeBridge = null;
  });

  afterEach(() => {
    if (savedUrl === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = savedUrl;
    vi.restoreAllMocks();
  });

  it("connects and returns the bridge when a node needs Python", async () => {
    const connect = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn();
    const fake = { connect, close } as unknown as PythonBridgeBase;
    h.makeBridge = () => fake;

    const bridge = await connectPythonBridgeForGraph(
      [{ type: "known.Ts" }, { type: "py.Custom" }],
      (t) => t === "known.Ts"
    );

    expect(bridge).toBe(fake);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });

  it("returns null and closes the bridge when a LOCAL worker fails (no wsUrl)", async () => {
    const connect = vi.fn().mockRejectedValue(new Error("spawn failed"));
    const close = vi.fn();
    const fake = { connect, close } as unknown as PythonBridgeBase;
    h.makeBridge = () => fake;

    const bridge = await connectPythonBridgeForGraph(
      [{ type: "py.Custom" }],
      () => false
    );

    expect(bridge).toBeNull();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("re-throws when a REMOTE worker (options.wsUrl) fails to connect", async () => {
    const connect = vi.fn().mockRejectedValue(new Error("remote down"));
    const close = vi.fn();
    const fake = { connect, close } as unknown as PythonBridgeBase;
    h.makeBridge = () => fake;

    await expect(
      connectPythonBridgeForGraph([{ type: "py.Custom" }], () => false, {
        wsUrl: "ws://worker:9000"
      })
    ).rejects.toThrow("remote down");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("re-throws when a REMOTE worker via NODETOOL_WORKER_URL fails", async () => {
    process.env[ENV_KEY] = "ws://env-worker:9000";
    const connect = vi.fn().mockRejectedValue(new Error("env remote down"));
    const close = vi.fn();
    const fake = { connect, close } as unknown as PythonBridgeBase;
    h.makeBridge = () => fake;

    await expect(
      connectPythonBridgeForGraph([{ type: "py.Custom" }], () => false)
    ).rejects.toThrow("env remote down");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("falls through (returns null) when NODETOOL_WORKER_URL is blank whitespace", async () => {
    process.env[ENV_KEY] = "   ";
    const connect = vi.fn().mockRejectedValue(new Error("local down"));
    const close = vi.fn();
    const fake = { connect, close } as unknown as PythonBridgeBase;
    h.makeBridge = () => fake;

    const bridge = await connectPythonBridgeForGraph(
      [{ type: "py.Custom" }],
      () => false
    );
    expect(bridge).toBeNull();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does not create a bridge when nothing needs Python", async () => {
    h.makeBridge = vi.fn(() => {
      throw new Error("should not be called");
    });
    const bridge = await connectPythonBridgeForGraph(
      [{ type: "a.B" }],
      () => true
    );
    expect(bridge).toBeNull();
  });
});

describe("resolvePythonNodeExecutor (metadata + fallbacks)", () => {
  function fakeBridge(
    known: Record<
      string,
      {
        outputs?: Array<{ name: string; type: { type: string } }>;
        required_settings?: string[];
      }
    >
  ): PythonBridgeBase {
    return {
      hasNodeType: (t: string) => t in known,
      getNodeMetadata: () =>
        Object.entries(known).map(([node_type, meta]) => ({
          node_type,
          outputs: meta.outputs ?? [],
          required_settings: meta.required_settings ?? []
        })),
      close: vi.fn()
    } as unknown as PythonBridgeBase;
  }

  it("reads properties from node.data when node.properties is absent", () => {
    const bridge = fakeBridge({
      "py.Node": {
        outputs: [
          { name: "out1", type: { type: "str" } },
          { name: "out2", type: { type: "int" } }
        ],
        required_settings: ["HF_TOKEN"]
      }
    });
    const exec = resolvePythonNodeExecutor(bridge, {
      id: "node-7",
      type: "py.Node",
      data: { threshold: 0.5 }
    });
    expect(exec).toBeInstanceOf(PythonNodeExecutor);
  });

  it("handles a known type whose metadata entry is missing (no outputs)", () => {
    // hasNodeType says yes, but getNodeMetadata has no matching entry.
    const bridge = {
      hasNodeType: () => true,
      getNodeMetadata: () => [],
      close: vi.fn()
    } as unknown as PythonBridgeBase;

    const exec = resolvePythonNodeExecutor(bridge, {
      id: "node-8",
      type: "py.Orphan",
      properties: {}
    });
    expect(exec).toBeInstanceOf(PythonNodeExecutor);
  });
});
