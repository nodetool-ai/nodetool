import { describe, it, expect, vi } from "vitest";

import {
  connectPythonBridgeForGraph,
  resolvePythonNodeExecutor
} from "../src/python-graph-resolver.js";
import { PythonNodeExecutor } from "../src/python-node-executor.js";
import type { PythonBridgeBase } from "../src/python-bridge-base.js";

/**
 * Minimal fake bridge exposing just the surface the resolver reads
 * (hasNodeType + getNodeMetadata). Cast to PythonBridgeBase at the call site.
 */
function fakeBridge(
  known: Record<
    string,
    { outputs?: Array<{ name: string; type: { type: string } }> }
  >
): PythonBridgeBase {
  return {
    hasNodeType: (t: string) => t in known,
    getNodeMetadata: () =>
      Object.entries(known).map(([node_type, meta]) => ({
        node_type,
        outputs: meta.outputs ?? [],
        required_settings: []
      })),
    close: vi.fn()
  } as unknown as PythonBridgeBase;
}

describe("connectPythonBridgeForGraph", () => {
  it("returns null (no bridge) when every node resolves in the TS registry", async () => {
    const bridge = await connectPythonBridgeForGraph(
      [{ type: "a.B" }, { type: "c.D" }],
      () => true
    );
    expect(bridge).toBeNull();
  });

  it("returns null for an empty graph (nothing needs Python)", async () => {
    const bridge = await connectPythonBridgeForGraph([], () => false);
    expect(bridge).toBeNull();
  });

  it("ignores nodes with a missing/blank type when deciding if Python is needed", async () => {
    const bridge = await connectPythonBridgeForGraph(
      [{ type: "" }, { type: undefined }, { type: "known.Ts" }],
      (t) => t === "known.Ts"
    );
    expect(bridge).toBeNull();
  });
});

describe("resolvePythonNodeExecutor", () => {
  it("returns null when there is no bridge", () => {
    expect(
      resolvePythonNodeExecutor(null, { id: "1", type: "py.Node" })
    ).toBeNull();
  });

  it("returns null when the bridge does not advertise the node type", () => {
    const bridge = fakeBridge({ "py.Known": {} });
    expect(
      resolvePythonNodeExecutor(bridge, { id: "1", type: "py.Unknown" })
    ).toBeNull();
  });

  it("builds a PythonNodeExecutor for a known Python node type", () => {
    const bridge = fakeBridge({
      "huggingface.sentence_similarity.SentenceSimilarity": {
        outputs: [{ name: "output", type: { type: "np_array" } }]
      }
    });
    const exec = resolvePythonNodeExecutor(bridge, {
      id: "node-1",
      type: "huggingface.sentence_similarity.SentenceSimilarity",
      properties: { model: { type: "hf.sentence_similarity" } }
    });
    expect(exec).toBeInstanceOf(PythonNodeExecutor);
  });
});
