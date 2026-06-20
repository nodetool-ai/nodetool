import { normalizeWorkerStreamMessage } from "../browserRunnerRelay";
import type { WebSocketMessage } from "../../websocket/GlobalWebSocketManager";

/**
 * Worker-path relay (the production browser path: Web Worker → main thread).
 *
 * `runBrowserGraphJobInWorker` spawns a real `Worker`, which jsdom/jest cannot
 * run, so we test its per-message normalization seam directly. This is the
 * branch that the main-thread fallback (`runBrowserGraphJobLocal`) also runs;
 * both must stamp an arrival-order `index` per (job, node) on
 * `generation_complete` and materialize `.outputs` (RFC §8.5 / Decision 9).
 */

const gc = (
  nodeId: string,
  outputs: Record<string, unknown>
): WebSocketMessage =>
  ({
    type: "generation_complete",
    node_id: nodeId,
    node_name: nodeId,
    node_type: "browser.Gen",
    outputs
  }) as unknown as WebSocketMessage;

describe("normalizeWorkerStreamMessage (worker-path relay)", () => {
  it("stamps arrival-order index 0..N-1 per (job, node) on generation_complete", () => {
    const counter = new Map<string, number>();
    const a = gc("gen", { image: "a" });
    const b = gc("gen", { image: "b" });
    const c = gc("gen", { image: "c" });

    normalizeWorkerStreamMessage(a, counter);
    normalizeWorkerStreamMessage(b, counter);
    normalizeWorkerStreamMessage(c, counter);

    expect([a, b, c].map((m) => (m as Record<string, unknown>).index)).toEqual([
      0, 1, 2
    ]);
  });

  it("resets the per-node counter at 0 for a different node", () => {
    const counter = new Map<string, number>();
    const first = gc("gen", { image: "a" });
    const second = gc("gen", { image: "b" });
    const other = gc("other", { image: "z" });

    normalizeWorkerStreamMessage(first, counter);
    normalizeWorkerStreamMessage(second, counter);
    normalizeWorkerStreamMessage(other, counter);

    expect((first as Record<string, unknown>).index).toBe(0);
    expect((second as Record<string, unknown>).index).toBe(1);
    expect((other as Record<string, unknown>).index).toBe(0);
  });

  it("preserves outputs through materialize for plain (non-image) values", () => {
    const counter = new Map<string, number>();
    const msg = gc("gen", { text: "hello", count: 7 });

    normalizeWorkerStreamMessage(msg, counter);

    expect((msg as Record<string, unknown>).outputs).toEqual({
      text: "hello",
      count: 7
    });
  });

  it("leaves node_update/output_update without an index and does not bump the counter", () => {
    const counter = new Map<string, number>();
    const nodeUpdate = {
      type: "node_update",
      node_id: "gen",
      status: "completed",
      result: { text: "x" }
    } as unknown as WebSocketMessage;

    normalizeWorkerStreamMessage(nodeUpdate, counter);

    expect((nodeUpdate as Record<string, unknown>).index).toBeUndefined();
    expect(counter.get("gen")).toBeUndefined();
  });
});
