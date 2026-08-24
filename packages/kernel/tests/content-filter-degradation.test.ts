/**
 * A content-filter refusal costs the item, not the run.
 *
 * Veo filtered one shot of a five-shot trailer. Classified as a hard error
 * that fails the node, which fails the run, which discards the four shots
 * already generated and paid for — so in a fan-out the kernel retires just the
 * refused item's lineage and lets the rest of the cut through.
 *
 * The blast radius is what is under test, so both edges are pinned: an
 * ordinary failure in the same graph still fails the run, and so does a
 * refusal with no siblings to protect.
 */

import { describe, expect, it } from "vitest";
import { ContentFilterRefusal } from "@nodetool-ai/runtime";
import type { LogUpdate } from "@nodetool-ai/protocol";
import {
  aggregateOutput,
  collectNode,
  dataEdge,
  forwardOutput,
  iterationOutput,
  runWorkflow,
  seedSource,
  type Edge,
  type NodeDescriptor
} from "./correlation/_harness.js";
import type { NodeExecutor } from "../src/actor.js";

const SHOTS = ["shot-1", "shot-2", "shot-3"];

/** Renders every shot but `refused`, which the provider filters. */
function animator(refused: string, error: Error): NodeExecutor {
  return {
    async process(ins) {
      if (ins.value === refused) throw error;
      return { value: `${ins.value}.mp4` };
    }
  };
}

const REFUSAL = (): ContentFilterRefusal =>
  new ContentFilterRefusal(
    "videos were filtered out because they violated Vertex AI's usage guidelines",
    { provider: "gemini", model: "veo-3.1-generate-preview" }
  );

/** shots ⇉ animate → collect → sink, one invocation per shot. */
function fanOut(): { nodes: NodeDescriptor[]; edges: Edge[] } {
  return {
    nodes: [
      {
        id: "shots",
        type: "test.Seed",
        is_streaming_input: true,
        outputs: { value: "any" },
        output_correlation: { value: iterationOutput("shots") }
      },
      {
        id: "animate",
        type: "test.Work",
        outputs: { value: "any" },
        output_correlation: { value: forwardOutput("value") }
      },
      {
        id: "collect",
        type: "nodetool.control.Collect",
        is_streaming_input: true,
        input_mode: "stream",
        outputs: { output: "list[any]" },
        output_correlation: { output: aggregateOutput("input_item") }
      },
      { id: "sink", type: "test.Sink", is_streaming_input: true }
    ],
    edges: [
      dataEdge("shots", "value", "animate", "value", "eShots"),
      dataEdge("animate", "value", "collect", "input_item", "eAnimate"),
      dataEdge("collect", "output", "sink", "value", "eCollect")
    ]
  };
}

function shotSource(): NodeExecutor {
  return seedSource(
    SHOTS.map((value, index) => ({
      value,
      lineage: { "shots:shots": { index } }
    }))
  );
}

describe("content-filter refusal in a fan-out", () => {
  it("drops the refused shot and delivers the rest of the cut", async () => {
    const { result, captured } = await runWorkflow({
      jobId: "content-filter-fanout",
      ...fanOut(),
      executors: {
        shots: shotSource(),
        animate: animator("shot-2", REFUSAL()),
        collect: collectNode()
      },
      captureFrom: { sink: ["value"] }
    });

    expect(result.status).toBe("completed");
    const envs = captured.get("sink")!.get("value")!;
    expect(envs).toHaveLength(1);
    expect(envs[0].data).toEqual(["shot-1.mp4", "shot-3.mp4"]);

    // Dropped, not swallowed: the run says which item went and why.
    const dropped = result.messages.filter(
      (m): m is LogUpdate =>
        m.type === "log_update" && m.content.includes("Dropped one item")
    );
    expect(dropped).toHaveLength(1);
    expect(dropped[0].node_id).toBe("animate");
    expect(dropped[0].severity).toBe("warning");
    expect(dropped[0].content).toContain("usage guidelines");
  });

  it("still fails the run on an ordinary error", async () => {
    const { result } = await runWorkflow({
      jobId: "content-filter-fanout-hard-error",
      ...fanOut(),
      executors: {
        shots: shotSource(),
        animate: animator("shot-2", new Error("401 Incorrect API key")),
        collect: collectNode()
      },
      captureFrom: { sink: ["value"] }
    });

    expect(result.status).toBe("failed");
  });
});

describe("content-filter refusal outside a fan-out", () => {
  it("fails the run when the invocation has no siblings to protect", async () => {
    const { result } = await runWorkflow({
      jobId: "content-filter-single",
      nodes: [
        {
          id: "shot",
          type: "nodetool.input.StringInput",
          name: "shot",
          properties: { value: "shot-2" }
        },
        { id: "animate", type: "test.Work", outputs: { value: "any" } },
        { id: "sink", type: "test.Sink", is_streaming_input: true }
      ],
      edges: [
        dataEdge("shot", "value", "animate", "value", "eShot"),
        dataEdge("animate", "value", "sink", "value", "eAnimate")
      ],
      executors: { animate: animator("shot-2", REFUSAL()) },
      captureFrom: { sink: ["value"] }
    });

    expect(result.status).toBe("failed");
  });
});
