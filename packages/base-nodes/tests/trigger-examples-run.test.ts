/**
 * Executes the shipped trigger examples in `examples/workflows/` instead of
 * merely validating their shape.
 *
 * `example-workflows-validation.test.ts` hydrates every example and checks its
 * structure, but never runs one. That gap is what let trigger delivery break
 * unnoticed: `actor.ts` gates the trigger entry point on `node.is_trigger`,
 * saved JSON never carries that flag, and the `resolveNodeType` hydration path
 * dropped it — so a delivered webhook, manual or file-watch event was accepted
 * and then silently ignored. The run completed, the trigger node reported
 * success, and nothing came out of it. A structural check cannot see that.
 *
 * These cases go through `ExecutionSession` with `resolveNodeType`, which is
 * exactly what `nodetool workflows run` and the websocket server both do.
 *
 * Every assertion is on the *payload value*, never on the presence of output.
 * `IntervalTrigger.genProcess` emits a tick of its own on start, so a test that
 * only checked "something was emitted" would have passed against the bug. The
 * delivered tick is 7 precisely because the buggy path returned 1.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeRegistry, createGraphNodeTypeResolver } from "@nodetool-ai/node-sdk";
import { ExecutionSession } from "@nodetool-ai/execution";
import { registerBaseNodes } from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = path.resolve(__dirname, "../../../examples/workflows");

function loadExample(file: string): { nodes: unknown[]; edges: unknown[] } {
  const raw = JSON.parse(
    fs.readFileSync(path.join(EXAMPLES_DIR, file), "utf8")
  ) as { graph: { nodes: unknown[]; edges: unknown[] } };
  return raw.graph;
}

/**
 * Mirrors the CLI: a registry of the shipped nodes plus `resolveNodeType`.
 * The resolver is not incidental — it selects the `Graph.loadFromDict`
 * hydration branch, the one that dropped `is_trigger`.
 */
async function run(
  graph: unknown,
  triggerEvent?: { node_id: string; payload: unknown }
): Promise<Record<string, unknown[]>> {
  const registry = new NodeRegistry();
  registerBaseNodes(registry);
  const session = await ExecutionSession.create({
    graph,
    registry,
    resolveNodeType: createGraphNodeTypeResolver(registry).resolveNodeType,
    jobId: `trigger-example-${triggerEvent?.node_id ?? "live"}`,
    params: {},
    ...(triggerEvent
      ? { triggerEvent: { ...triggerEvent, input_id: "test" } }
      : {})
  } as never);
  const result = await session.result;
  expect(result.error ?? null).toBeNull();
  expect(result.status).toBe("completed");
  return (result.outputs ?? {}) as Record<string, unknown[]>;
}

describe("shipped trigger examples run on a delivered event", () => {
  it("trigger_webhook_cli delivers the request body and method", async () => {
    const outputs = await run(loadExample("trigger_webhook_cli.json"), {
      node_id: "hook",
      payload: {
        body: { repo: "nodetool", stars: 1200 },
        method: "POST",
        path: "/api/webhooks/x"
      }
    });
    expect(outputs["body"]).toEqual([{ repo: "nodetool", stars: 1200 }]);
    expect(outputs["method"]).toEqual(["POST"]);
  });

  it("trigger_manual_cli delivers the envelope's data and source", async () => {
    const outputs = await run(loadExample("trigger_manual_cli.json"), {
      node_id: "start",
      payload: { data: { job: "reindex", priority: 3 }, source: "cli" }
    });
    expect(outputs["data"]).toEqual([{ job: "reindex", priority: 3 }]);
    expect(outputs["source"]).toEqual(["cli"]);
  });

  it("trigger_interval_cli delivers the event's tick, not genProcess's", async () => {
    const outputs = await run(loadExample("trigger_interval_cli.json"), {
      node_id: "every",
      payload: { tick: 7, elapsed_seconds: 420, interval_seconds: 60 }
    });
    // The bug returned 1 here — genProcess's own first tick.
    expect(outputs["tick"]).toEqual([7]);
    expect(outputs["elapsed"]).toEqual([420]);
  });

  it("trigger_filewatch_cli delivers a synthesized filesystem event", async () => {
    const outputs = await run(loadExample("trigger_filewatch_cli.json"), {
      node_id: "watch",
      payload: {
        event: "modified",
        path: "/data/inbox/report.json",
        is_directory: false
      }
    });
    expect(outputs["event"]).toEqual(["modified"]);
    expect(outputs["path"]).toEqual(["/data/inbox/report.json"]);
  });
});

describe("shipped trigger examples run on a live adapter", () => {
  /**
   * The other cases all wake the node through `emitTriggerEvent`. This one
   * drives `FileWatchTrigger.genProcess` with a real `fs.watch`, so the
   * adapter path stays covered too — the path the delivered-event bug hid
   * behind.
   */
  it("trigger_filewatch_cli reacts to a file appearing on disk", async () => {
    const watchDir = fs.mkdtempSync(path.join(os.tmpdir(), "nodetool-fw-"));
    try {
      const graph = loadExample("trigger_filewatch_cli.json") as {
        nodes: { id: string; data?: Record<string, unknown> }[];
      };
      const watcher = graph.nodes.find((n) => n.id === "watch");
      if (!watcher?.data) throw new Error("example lost its watch node");
      watcher.data["path"] = watchDir;

      const pending = run(graph);
      // The watcher has to be listening before the write, or the event it is
      // waiting for happens before it starts and the run hangs to its timeout.
      await new Promise((r) => setTimeout(r, 500));
      fs.writeFileSync(path.join(watchDir, "dropped.json"), '{"hello":"world"}');

      const outputs = await pending;
      expect(outputs["event"]).toEqual(["created"]);
      expect(outputs["path"]).toEqual([path.join(watchDir, "dropped.json")]);
    } finally {
      fs.rmSync(watchDir, { recursive: true, force: true });
    }
  }, 20000);
});
