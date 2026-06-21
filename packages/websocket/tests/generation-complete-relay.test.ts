/**
 * `generation_complete` relay (RFC: generation-events §5 / §11 / §13, Decision 8).
 *
 * Step 2 (behavior-neutral, no autosave): the unified websocket runner's
 * message interception relays the BARE `generation_complete` the kernel emits,
 *   - backfilling `job_id` / `workflow_id` (via the outbound spread),
 *   - stamping an in-memory arrival-order `index` per (job_id, node_id),
 *   - normalizing `.outputs` the same way `node_update.result` is.
 *
 * No autosave happens in this step.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { unpack } from "msgpackr";
import { initTestDb, Asset } from "@nodetool-ai/models";
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

// resolveNodeType for the ForEach generator + a buffered consumer.
const resolveNodeType = {
  resolveNodeType: async (nodeType: string) => {
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
            output: { kind: "iteration", source: "__execution__", group: "items" },
            index: { kind: "iteration", source: "__execution__", group: "items" }
          },
          name: "ForEach"
        }
      };
    }
    if (nodeType === "test.TextToImage") {
      return {
        nodeType,
        propertyTypes: { prompt: "any" },
        outputs: { image: "any" },
        descriptorDefaults: { name: "TextToImage" }
      };
    }
    return null;
  }
};

let ws: MockWS;

beforeEach(async () => {
  await initTestDb();
  ws = new MockWS();
});

describe("generation_complete relay", () => {
  it("stamps arrival-order index 0..N-1 per (job, node) and backfills job_id", async () => {
    const list = ["p0", "p1", "p2", "p3", "p4", "p5"];
    const runner = new UnifiedWebSocketRunner({
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
        if (node.type === "test.TextToImage") {
          return {
            async process(inputs: Record<string, unknown>) {
              return { image: `img(${inputs.prompt})` };
            }
          };
        }
        return { async process() { return {}; } };
      },
      resolveNodeType
    });

    await runner.connect(ws);
    await runner.runJob({
      job_id: "JOB1",
      workflow_id: "WF1",
      graph: {
        nodes: [
          {
            id: "src",
            type: "nodetool.input.IntegerInput",
            name: "items",
            properties: { value: list }
          },
          { id: "fe", type: "nodetool.control.ForEach" },
          { id: "gen", type: "test.TextToImage" }
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
      }
    });
    await new Promise((r) => setTimeout(r, 200));

    const gens = sentMsgs(ws).filter(
      (m) => m.type === "generation_complete" && m.node_id === "gen"
    );
    expect(gens).toHaveLength(6);

    // index stamped 0..N-1 in arrival order, per (job, node).
    expect(gens.map((g) => g.index)).toEqual([0, 1, 2, 3, 4, 5]);
    // job_id / workflow_id backfilled on every relayed generation_complete.
    expect(gens.every((g) => g.job_id === "JOB1")).toBe(true);
    expect(gens.every((g) => g.workflow_id === "WF1")).toBe(true);

    await runner.disconnect();
  });

  it("normalizes .outputs (raw bytes → client-bytes wrapper) before relay", async () => {
    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: (node) => {
        if (node.type === "test.TextToImage") {
          return {
            async process() {
              // Raw bytes on the output → normalizeOutputValue must convert
              // them to a client-bytes wrapper, like node_update.result.
              return { image: new Uint8Array([1, 2, 3, 4, 5]) };
            }
          };
        }
        return { async process() { return {}; } };
      },
      resolveNodeType
    });

    await runner.connect(ws);
    await runner.runJob({
      job_id: "JOB2",
      workflow_id: "WF2",
      graph: {
        nodes: [{ id: "gen", type: "test.TextToImage" }],
        edges: []
      }
    });
    await new Promise((r) => setTimeout(r, 150));

    const gen = sentMsgs(ws).find(
      (m) => m.type === "generation_complete" && m.node_id === "gen"
    );
    expect(gen).toBeDefined();
    const outputs = gen!.outputs as Record<string, unknown>;
    // Raw Uint8Array became the client-bytes wrapper, not raw bytes.
    expect(outputs.image).toEqual({ type: "bytes", length: 5 });

    await runner.disconnect();
  });

  it("does NOT autosave generation_complete (no Asset row created)", async () => {
    // Step 2 is behavior-neutral: the generation_complete relay branch must not
    // persist anything (autosave is step 4). We leave getNodeMetadata unset so
    // the separate node_update{completed} autosave branch also cannot fire —
    // isolating the generation_complete path. We assert both that the event is
    // relayed AND that zero Asset rows exist for the job, so a future author who
    // wires autosave onto generation_complete here hits a failing test.
    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: (node) => {
        if (node.type === "test.TextToImage") {
          return {
            async process() {
              return { image: "img(x)" };
            }
          };
        }
        return { async process() { return {}; } };
      },
      resolveNodeType
    });

    await runner.connect(ws);
    await runner.runJob({
      job_id: "JOB3",
      workflow_id: "WF3",
      graph: {
        nodes: [{ id: "gen", type: "test.TextToImage" }],
        edges: []
      }
    });
    await new Promise((r) => setTimeout(r, 150));

    const gen = sentMsgs(ws).find(
      (m) => m.type === "generation_complete" && m.node_id === "gen"
    );
    expect(gen).toBeDefined();
    expect((gen!.outputs as Record<string, unknown>).image).toBe("img(x)");

    // No autosave in step 2: zero Asset rows persisted for this job.
    const [jobAssets] = await Asset.paginate("1", { jobId: "JOB3" });
    expect(jobAssets).toHaveLength(0);

    await runner.disconnect();
  });
});
