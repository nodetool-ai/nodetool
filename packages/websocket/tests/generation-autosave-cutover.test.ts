/**
 * Autosave cutover (RFC: generation-events §7 / §12 step 4, Decisions D3 / D8 / D9).
 *
 * Step 4 hard-switch: the unified websocket runner persists ONE asset per
 * `generation_complete` (on the raw `outputs`, before normalization strips
 * inline bytes), tagged { jobId, nodeId, index }. The old terminal
 * `node_update{completed}` autosave branch is gone — so an N-execution run
 * persists N distinct assets instead of collapsing to the single last result.
 *
 *   - D3: autosave is driven per generation_complete, not by node_update.
 *   - D8: a reconnect replay (the same N events arriving again) is a no-op
 *         because an asset already exists at each arrival position.
 *   - D9: server-only — this path is the websocket runner; the browser never
 *         reaches runJob, so no browser autosave is introduced.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { unpack } from "msgpackr";
import { initTestDb, Asset } from "@nodetool-ai/models";
import type { NodeTypeResolver, ResolvedNodeType } from "@nodetool-ai/kernel";
import type { NodeMetadata } from "@nodetool-ai/node-sdk";
import {
  UnifiedWebSocketRunner,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/unified-websocket-runner.js";

class MockWS implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";
  sentBytes: Uint8Array[] = [];
  sentText: string[] = [];
  queue: Array<WebSocketReceiveFrame> = [];
  async accept() {}
  async receive(): Promise<WebSocketReceiveFrame> {
    return this.queue.shift() ?? { type: "websocket.disconnect" };
  }
  async sendBytes(data: Uint8Array) {
    this.sentBytes.push(data);
  }
  async sendText(data: string) {
    this.sentText.push(data);
  }
  async close() {
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
  }
}

function sentMsgs(ws: MockWS): Record<string, unknown>[] {
  return ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>);
}

// Poll until at least `count` sent messages match `predicate`, or time out.
// Autosave is awaited inline before each generation_complete is relayed, so once
// the events are out their assets are already persisted — making the matched
// event count a reliable gate. Replaces fixed setTimeout delays that flaked
// under CI load when N async events took longer than the delay to stream.
async function waitForMessages(
  ws: MockWS,
  predicate: (m: Record<string, unknown>) => boolean,
  count: number,
  timeoutMs = 5000
): Promise<Record<string, unknown>[]> {
  const start = Date.now();
  for (;;) {
    const matched = sentMsgs(ws).filter(predicate);
    if (matched.length >= count || Date.now() - start > timeoutMs) {
      return matched;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

const isGen = (nodeId: string) => (m: Record<string, unknown>) =>
  m.type === "generation_complete" && m.node_id === nodeId;

// A valid 1x1 PNG so both the asset bytes store and the sharp thumbnail path
// succeed cleanly (no swallowed thumbnail warning).
const PNG_1x1 = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0,
  0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120,
  218, 99, 100, 248, 207, 0, 0, 0, 3, 1, 1, 0, 24, 221, 141, 180, 0, 0, 0, 0,
  73, 69, 78, 68, 174, 66, 96, 130
]);

const imageOutput = () => ({ image: { type: "image", data: PNG_1x1 } });

// A list[image] output: ONE generation_complete carries TWO asset-like values,
// so autoSaveAssets persists two rows for a single arrival index.
const listImageOutput = () => ({
  images: [
    { type: "image", data: PNG_1x1 },
    { type: "image", data: PNG_1x1 }
  ]
});

// resolveNodeType for the ForEach generator + a buffered consumer (mirrors the
// generation_complete relay test harness).
const resolveNodeType: NodeTypeResolver = {
  resolveNodeType: async (
    nodeType: string
  ): Promise<ResolvedNodeType | null> => {
    if (nodeType === "nodetool.input.IntegerInput") {
      return {
        nodeType,
        propertyTypes: { value: "any", name: "str" },
        outputs: { value: "any" },
        descriptorDefaults: { name: "IntegerInput" }
      };
    }
    if (nodeType === "nodetool.control.ForEach") {
      return {
        nodeType,
        outputs: { output: "any", index: "int" },
        descriptorDefaults: {
          is_streaming_output: true,
          output_correlation: {
            output: {
              kind: "iteration",
              source: "__execution__",
              group: "items"
            },
            index: {
              kind: "iteration",
              source: "__execution__",
              group: "items"
            }
          },
          name: "ForEach"
        }
      };
    }
    if (nodeType === "test.ImageGen") {
      return {
        nodeType,
        propertyTypes: { prompt: "any" },
        outputs: { image: "any" },
        descriptorDefaults: { name: "ImageGen" }
      };
    }
    if (nodeType === "test.ListImageGen") {
      return {
        nodeType,
        propertyTypes: { prompt: "any" },
        outputs: { images: "any" },
        descriptorDefaults: { name: "ListImageGen" }
      };
    }
    if (nodeType === "test.JsonGen") {
      return {
        nodeType,
        propertyTypes: { prompt: "any" },
        outputs: { output: "any", index: "int" },
        descriptorDefaults: { name: "JsonGen" }
      };
    }
    return null;
  }
};

// Minimal metadata: only `auto_save_asset` and `outputs` are read by the
// autosave gate (the latter via primaryTextOutputName — `image` is not a text
// type, so no text asset is persisted).
const imageGenMeta = {
  auto_save_asset: true,
  outputs: [{ name: "image", type: { type: "image" } }]
} as unknown as NodeMetadata;

const listImageGenMeta = {
  auto_save_asset: true,
  outputs: [{ name: "images", type: { type: "list" } }]
} as unknown as NodeMetadata;

// A structured generator (mirrors the nodetool.generators.* family): primary
// output is neither media nor a plain string, so the autosave persists the
// whole output dict as one application/json asset.
const jsonGenMeta = {
  auto_save_asset: true,
  primary_output: "output",
  outputs: [
    { name: "output", type: { type: "list" } },
    { name: "index", type: { type: "int" } }
  ]
} as unknown as NodeMetadata;

const getNodeMetadata = (nodeType: string): NodeMetadata | undefined => {
  if (nodeType === "test.ImageGen") return imageGenMeta;
  if (nodeType === "test.ListImageGen") return listImageGenMeta;
  if (nodeType === "test.JsonGen") return jsonGenMeta;
  return undefined;
};

// A ForEach(N) → ImageGen graph: N iterations, each emitting one image
// generation_complete for node "gen".
function makeRunner() {
  return new UnifiedWebSocketRunner({
    resolveExecutor: (node) => {
      if (node.type === "nodetool.control.ForEach") {
        return {
          async process() {
            return {};
          },
          async *genProcess(inputs: Record<string, unknown>) {
            const raw = inputs.input_list ?? [];
            const items = Array.isArray(raw) ? raw : [raw];
            for (let i = 0; i < items.length; i++) {
              yield { output: items[i], index: i };
            }
          }
        };
      }
      if (node.type === "test.ImageGen") {
        return {
          async process() {
            return imageOutput();
          }
        };
      }
      if (node.type === "test.ListImageGen") {
        return {
          async process() {
            return listImageOutput();
          }
        };
      }
      if (node.type === "test.JsonGen") {
        return {
          async process() {
            return { output: ["x", "y", "z"], index: 2 };
          }
        };
      }
      return {
        async process() {
          return {};
        }
      };
    },
    resolveNodeType,
    getNodeMetadata
  });
}

function foreachGraph(items: unknown[], genType = "test.ImageGen") {
  return {
    nodes: [
      {
        id: "src",
        type: "nodetool.input.IntegerInput",
        name: "items",
        properties: { value: items }
      },
      { id: "fe", type: "nodetool.control.ForEach" },
      { id: "gen", type: genType }
    ],
    edges: [
      {
        id: "eSrc",
        source: "src",
        sourceHandle: "value",
        target: "fe",
        targetHandle: "input_list",
        edge_type: "data"
      },
      {
        id: "eFe",
        source: "fe",
        sourceHandle: "output",
        target: "gen",
        targetHandle: "prompt",
        edge_type: "data"
      }
    ]
  };
}

let ws: MockWS;

beforeEach(async () => {
  await initTestDb();
  ws = new MockWS();
});

describe("autosave cutover (generation_complete → N assets)", () => {
  it("persists one distinct asset per generation_complete (N events → N assets)", async () => {
    const runner = makeRunner();
    await runner.connect(ws);
    await runner.runJob({
      job_id: "JOBN",
      workflow_id: "WFN",
      graph: foreachGraph(["a", "b", "c", "d", "e", "f"])
    });
    // Sanity: 6 generation_complete relayed for the gen node, indices 0..5.
    const gens = await waitForMessages(ws, isGen("gen"), 6);
    expect(gens).toHaveLength(6);
    expect(gens.map((g) => g.index)).toEqual([0, 1, 2, 3, 4, 5]);

    // 6 distinct image assets persisted for (job, node) — NOT 1 (the old
    // node_update{completed} branch saved only the last result).
    const [assets] = await Asset.paginate("1", {
      jobId: "JOBN",
      nodeId: "gen",
      limit: 1000
    });
    expect(assets).toHaveLength(6);
    expect(assets.every((a) => a.job_id === "JOBN")).toBe(true);
    expect(assets.every((a) => a.node_id === "gen")).toBe(true);
    expect(assets.every((a) => a.content_type === "image/png")).toBe(true);
    // Distinct asset ids — six separate rows, not the same one six times.
    expect(new Set(assets.map((a) => a.id)).size).toBe(6);

    await runner.disconnect();
  });

  it("persists every asset when each event yields >1 asset (list[image]×N)", async () => {
    // Regression for the count-vs-index dedupe bug: a list[image]-of-2 output
    // persists TWO assets per generation_complete. A `persisted.length <=
    // arrivalIndex` gate would skip event 1 (2 <= 1 is false) and under-save —
    // 4 assets for a 3-event run instead of 6. The (nodeId,index) dedupe saves
    // all 6.
    const runner = makeRunner();
    await runner.connect(ws);
    await runner.runJob({
      job_id: "JOBL",
      workflow_id: "WFL",
      graph: foreachGraph(["a", "b", "c"], "test.ListImageGen")
    });
    // 3 generation_complete (indices 0..2), each a list of 2 images.
    const gens = await waitForMessages(ws, isGen("gen"), 3);
    expect(gens).toHaveLength(3);
    expect(gens.map((g) => g.index)).toEqual([0, 1, 2]);

    // 6 assets persisted (2 per event × 3 events), NOT 4.
    const [assets] = await Asset.paginate("1", {
      jobId: "JOBL",
      nodeId: "gen",
      limit: 1000
    });
    expect(assets).toHaveLength(6);
    expect(new Set(assets.map((a) => a.id)).size).toBe(6);

    await runner.disconnect();
  });

  it("is a no-op on reconnect replay even with multi-asset events (list[image]×N)", async () => {
    // The multi-asset replay path: re-running the same list[image] job must add
    // nothing. The cross-run guard keys on metadata.generation_index, so the
    // count of persisted assets (6, two per slot) never confuses the dedupe.
    const runner1 = makeRunner();
    await runner1.connect(ws);
    await runner1.runJob({
      job_id: "JOBLR",
      workflow_id: "WFLR",
      graph: foreachGraph(["a", "b", "c"], "test.ListImageGen")
    });
    await waitForMessages(ws, isGen("gen"), 3);
    await runner1.disconnect();

    const [afterFirst] = await Asset.paginate("1", {
      jobId: "JOBLR",
      nodeId: "gen",
      limit: 1000
    });
    expect(afterFirst).toHaveLength(6);

    const ws2 = new MockWS();
    const runner2 = makeRunner();
    await runner2.connect(ws2);
    await runner2.runJob({
      job_id: "JOBLR",
      workflow_id: "WFLR",
      graph: foreachGraph(["a", "b", "c"], "test.ListImageGen")
    });
    await waitForMessages(ws2, isGen("gen"), 3);
    await runner2.disconnect();

    const [afterReplay] = await Asset.paginate("1", {
      jobId: "JOBLR",
      nodeId: "gen",
      limit: 1000
    });
    expect(afterReplay).toHaveLength(6);
    expect(new Set(afterReplay.map((a) => a.id))).toEqual(
      new Set(afterFirst.map((a) => a.id))
    );
  });

  it("is a no-op on reconnect replay (persisted already at N)", async () => {
    // First run persists 6 assets.
    const runner1 = makeRunner();
    await runner1.connect(ws);
    await runner1.runJob({
      job_id: "JOBR",
      workflow_id: "WFR",
      graph: foreachGraph(["a", "b", "c", "d", "e", "f"])
    });
    await waitForMessages(ws, isGen("gen"), 6);
    await runner1.disconnect();

    const [afterFirst] = await Asset.paginate("1", {
      jobId: "JOBR",
      nodeId: "gen",
      limit: 1000
    });
    expect(afterFirst).toHaveLength(6);

    // Reconnect + replay the SAME job: arrivalIndex returns to 0..5 while 6
    // assets are already persisted, so the dedupe gate (persisted.length <=
    // arrivalIndex) is false for every event → no new asset rows.
    const ws2 = new MockWS();
    const runner2 = makeRunner();
    await runner2.connect(ws2);
    await runner2.runJob({
      job_id: "JOBR",
      workflow_id: "WFR",
      graph: foreachGraph(["a", "b", "c", "d", "e", "f"])
    });
    await waitForMessages(ws2, isGen("gen"), 6);
    await runner2.disconnect();

    const [afterReplay] = await Asset.paginate("1", {
      jobId: "JOBR",
      nodeId: "gen",
      limit: 1000
    });
    expect(afterReplay).toHaveLength(6);
    // Same six rows — replay added nothing.
    expect(new Set(afterReplay.map((a) => a.id))).toEqual(
      new Set(afterFirst.map((a) => a.id))
    );
  });

  it("does NOT double-save on node_update{completed} (cutover removed that branch)", async () => {
    // A single-execution node emits BOTH one generation_complete AND a terminal
    // node_update{completed}, each carrying the same asset-like result. The old
    // code autosaved on node_update; the cutover moved autosave exclusively to
    // generation_complete. So the asset count must equal the generation_complete
    // count (exactly 1) — never doubled by a surviving node_update branch.
    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: (node) => {
        if (node.type === "test.ImageGen") {
          return {
            async process() {
              return imageOutput();
            }
          };
        }
        return {
          async process() {
            return {};
          }
        };
      },
      resolveNodeType,
      getNodeMetadata
    });

    await runner.connect(ws);
    await runner.runJob({
      job_id: "JOBU",
      workflow_id: "WFU",
      graph: {
        nodes: [{ id: "gen", type: "test.ImageGen" }],
        edges: []
      }
    });
    // Wait for the terminal node_update{completed} (it is relayed at/after the
    // generation_complete), so both counts below are observed deterministically.
    await waitForMessages(
      ws,
      (m) =>
        m.type === "node_update" &&
        m.node_id === "gen" &&
        m.status === "completed",
      1
    );

    const msgs = sentMsgs(ws);
    // Exactly one generation_complete and one node_update{completed} for gen.
    const gens = msgs.filter(
      (m) => m.type === "generation_complete" && m.node_id === "gen"
    );
    expect(gens).toHaveLength(1);
    const completes = msgs.filter(
      (m) =>
        m.type === "node_update" &&
        m.node_id === "gen" &&
        m.status === "completed"
    );
    expect(completes).toHaveLength(1);

    // Exactly one asset — the generation_complete save — not two. A surviving
    // node_update autosave branch would have produced a second row.
    const [assets] = await Asset.paginate("1", {
      jobId: "JOBU",
      nodeId: "gen",
      limit: 1000
    });
    expect(assets).toHaveLength(1);

    await runner.disconnect();
  });

  it("persists a structured (non-media, non-text) output as one application/json generation", async () => {
    // The generator family (List/Data/Chart/SVG/StructuredOutput) emits lists /
    // dicts / dataframes — neither media nor a plain string. Their whole output
    // dict persists as ONE application/json asset (the value inlined in
    // metadata.json) so the node reloads its generation on reopen.
    const runner = makeRunner();
    await runner.connect(ws);
    await runner.runJob({
      job_id: "JOBJ",
      workflow_id: "WFJ",
      graph: {
        nodes: [{ id: "gen", type: "test.JsonGen" }],
        edges: []
      }
    });
    const gens = await waitForMessages(ws, isGen("gen"), 1);
    expect(gens).toHaveLength(1);

    const [assets] = await Asset.paginate("1", {
      jobId: "JOBJ",
      nodeId: "gen",
      limit: 1000
    });
    // Exactly one JSON asset — no media, no text row.
    expect(assets).toHaveLength(1);
    expect(assets[0].content_type).toBe("application/json");
    expect((assets[0].metadata as Record<string, unknown> | null)?.json).toEqual(
      { output: ["x", "y", "z"], index: 2 }
    );
    expect(
      (assets[0].metadata as Record<string, unknown> | null)?.generation_index
    ).toBe(0);

    await runner.disconnect();
  });

  it("saves the prompt that produced each image into asset metadata", async () => {
    // ForEach feeds each item into gen.prompt (edge fe.output → gen.prompt), so
    // the actor's resolved inputs carry the prompt. The autosave lifts it into
    // each image asset's metadata.prompt — what the asset viewer surfaces as the
    // text that generated the image.
    const runner = makeRunner();
    await runner.connect(ws);
    await runner.runJob({
      job_id: "JOBP",
      workflow_id: "WFP",
      graph: foreachGraph(["a sunset over the sea", "a snowy mountain"])
    });
    const gens = await waitForMessages(ws, isGen("gen"), 2);
    expect(gens).toHaveLength(2);

    const [assets] = await Asset.paginate("1", {
      jobId: "JOBP",
      nodeId: "gen",
      limit: 1000
    });
    expect(assets).toHaveLength(2);
    const promptsByIndex = new Map(
      assets.map((a) => {
        const md = a.metadata as Record<string, unknown> | null;
        return [md?.generation_index as number, md?.prompt as string];
      })
    );
    expect(promptsByIndex.get(0)).toBe("a sunset over the sea");
    expect(promptsByIndex.get(1)).toBe("a snowy mountain");

    await runner.disconnect();
  });
});
