/**
 * Drops and closes algebra.
 *
 *   outputs.drop emits lineage_done for the consumed envelope's key
 *   source EOS synthesizes lineage_scope_closed for every possible child root
 *   a zero-child parent still emits lineage_scope_closed
 *   filtered child stream does not hang downstream aggregate
 *
 * See docs/correlation-design.md §5-6.
 */

import { describe, expect, it } from "vitest";
import { NodeInbox } from "../../../src/inbox.js";
import { WorkflowRunner } from "../../../src/runner.js";
import type { NodeExecutor } from "../../../src/actor.js";
import type { NodeInputs, NodeOutputs } from "../../../src/io.js";
import type { Edge, NodeDescriptor } from "@nodetool-ai/protocol";
import {
  runWorkflow,
  iterationOutput,
  forwardOutput,
  aggregateOutput,
  dataEdge,
  foreachNode,
  collectNode,
  filterNode
} from "../_harness.js";

describe("drops-closes — outputs.drop emits lineage_done downstream", () => {
  it("a filter that drops some keys announces lineage_done on the downstream inbox", async () => {
    // Use a side capture: hook into the runner to grab the downstream inbox.
    const seenDone: Array<{ edge: string; key: string }> = [];

    // We can't easily reach into private state from the harness; instead
    // build the runner inline and read its inbox state after run.
    let downstreamInbox: NodeInbox | null = null;
    const sinkExec: NodeExecutor = {
      async process() {
        return {};
      },
      async run(inputs: NodeInputs) {
        downstreamInbox = (inputs as unknown as { _inbox: NodeInbox })._inbox;
        for await (const _ of inputs.stream("value")) {
          // drain
        }
      }
    };

    const nodes: NodeDescriptor[] = [
      {
        id: "src",
        type: "nodetool.input.IntegerInput",
        name: "items",
        properties: { value: [1, 2, 3, 4] }
      },
      {
        id: "fe",
        type: "nodetool.control.ForEach",
        is_streaming_output: true,
        outputs: { output: "any" },
        output_correlation: { output: iterationOutput("items") }
      },
      {
        id: "filt",
        type: "test.Filter",
        is_streaming_input: true,
        outputs: { value: "any" },
        output_correlation: { value: forwardOutput("value") }
      },
      { id: "sink", type: "test.Sink", is_streaming_input: true }
    ];
    const edges: Edge[] = [
      dataEdge("src", "value", "fe", "input_list"),
      dataEdge("fe", "output", "filt", "value"),
      dataEdge("filt", "value", "sink", "value", "eFilt")
    ];

    const orig = process.env.NODETOOL_USE_CORRELATION;
    process.env.NODETOOL_USE_CORRELATION = "1";
    try {
      const runner = new WorkflowRunner("drops-job", {
        resolveExecutor: (node) => {
          if (node.type.startsWith("nodetool.input.")) {
            return {
              async process() {
                return {};
              }
            };
          }
          if (node.id === "fe") return foreachNode();
          if (node.id === "filt") return filterNode((v) => (v as number) % 2 === 0);
          if (node.id === "sink") return sinkExec;
          throw new Error(`No executor for ${node.id}`);
        }
      });
      const result = await runner.run(
        { job_id: "drops-job", params: {} },
        { nodes, edges }
      );
      expect(result.status).toBe("completed");
      expect(downstreamInbox).not.toBeNull();
      const inbox = downstreamInbox as NodeInbox;
      // Filter dropped odd indices 1 and 3 — corresponding to fe:items
      // tokens 0 (value=1) and 2 (value=3). lineage_done should be
      // recorded for the downstream edge at those keys.
      expect(inbox.isEdgeDoneFor("eFilt", "fe:items=0")).toBe(true);
      expect(inbox.isEdgeDoneFor("eFilt", "fe:items=2")).toBe(true);
      // Kept keys (1 and 3) should NOT be marked done.
      expect(inbox.isEdgeDoneFor("eFilt", "fe:items=1")).toBe(false);
      expect(inbox.isEdgeDoneFor("eFilt", "fe:items=3")).toBe(false);
    } finally {
      if (orig === undefined) {
        delete process.env.NODETOOL_USE_CORRELATION;
      } else {
        process.env.NODETOOL_USE_CORRELATION = orig;
      }
      expect(seenDone.length).toBe(0); // suppress unused-var
    }
  });
});

describe("drops-closes — source EOS synthesizes lineage_scope_closed", () => {
  it("an empty ForEach records scope_closed for the iteration root downstream", async () => {
    let downstream: NodeInbox | null = null;
    const captureInbox: NodeExecutor = {
      async process() {
        return {};
      },
      async run(inputs: NodeInputs) {
        downstream = (inputs as unknown as { _inbox: NodeInbox })._inbox;
        for await (const _ of inputs.stream("input_item")) {
          // drain
        }
      }
    };

    const nodes: NodeDescriptor[] = [
      {
        id: "src",
        type: "nodetool.input.IntegerInput",
        name: "items",
        properties: { value: [] }
      },
      {
        id: "fe",
        type: "nodetool.control.ForEach",
        is_streaming_output: true,
        outputs: { output: "any" },
        output_correlation: { output: iterationOutput("items") }
      },
      {
        id: "c",
        type: "nodetool.control.Collect",
        is_streaming_input: true,
        input_mode: "stream",
        outputs: { output: "list[any]" },
        output_correlation: { output: aggregateOutput("input_item") }
      }
    ];
    const edges: Edge[] = [
      dataEdge("src", "value", "fe", "input_list"),
      dataEdge("fe", "output", "c", "input_item", "eFe")
    ];

    const orig = process.env.NODETOOL_USE_CORRELATION;
    process.env.NODETOOL_USE_CORRELATION = "1";
    try {
      const runner = new WorkflowRunner("close-job", {
        resolveExecutor: (node) => {
          if (node.type.startsWith("nodetool.input.")) {
            return { async process() { return {}; } };
          }
          if (node.id === "fe") return foreachNode();
          if (node.id === "c") return captureInbox;
          throw new Error(`No executor for ${node.id}`);
        }
      });
      const result = await runner.run(
        { job_id: "close-job", params: {} },
        { nodes, edges }
      );
      expect(result.status).toBe("completed");
      expect(downstream).not.toBeNull();
      // The runner synthesizes scope_closed for fe:items on the outgoing
      // edge (empty parent_lineage).
      expect(
        (downstream as NodeInbox).isScopeClosedFor("eFe", "", "fe:items")
      ).toBe(true);
    } finally {
      if (orig === undefined) {
        delete process.env.NODETOOL_USE_CORRELATION;
      } else {
        process.env.NODETOOL_USE_CORRELATION = orig;
      }
    }
  });

  it("a populated ForEach still emits scope_closed once it finishes", async () => {
    let downstream: NodeInbox | null = null;
    const cap: NodeExecutor = {
      async process() {
        return {};
      },
      async run(inputs: NodeInputs) {
        downstream = (inputs as unknown as { _inbox: NodeInbox })._inbox;
        for await (const _ of inputs.stream("input_item")) {
          // drain
        }
      }
    };

    const nodes: NodeDescriptor[] = [
      {
        id: "src",
        type: "nodetool.input.IntegerInput",
        name: "items",
        properties: { value: ["x", "y"] }
      },
      {
        id: "fe",
        type: "nodetool.control.ForEach",
        is_streaming_output: true,
        outputs: { output: "any" },
        output_correlation: { output: iterationOutput("items") }
      },
      {
        id: "c",
        type: "nodetool.control.Collect",
        is_streaming_input: true,
        input_mode: "stream",
        outputs: { output: "list[any]" },
        output_correlation: { output: aggregateOutput("input_item") }
      }
    ];
    const edges: Edge[] = [
      dataEdge("src", "value", "fe", "input_list"),
      dataEdge("fe", "output", "c", "input_item", "eFe2")
    ];

    const orig = process.env.NODETOOL_USE_CORRELATION;
    process.env.NODETOOL_USE_CORRELATION = "1";
    try {
      const runner = new WorkflowRunner("close2", {
        resolveExecutor: (node) => {
          if (node.type.startsWith("nodetool.input.")) {
            return { async process() { return {}; } };
          }
          if (node.id === "fe") return foreachNode();
          if (node.id === "c") return cap;
          throw new Error(`No executor for ${node.id}`);
        }
      });
      const result = await runner.run(
        { job_id: "close2", params: {} },
        { nodes, edges }
      );
      expect(result.status).toBe("completed");
      expect(
        (downstream as NodeInbox).isScopeClosedFor("eFe2", "", "fe:items")
      ).toBe(true);
    } finally {
      if (orig === undefined) {
        delete process.env.NODETOOL_USE_CORRELATION;
      } else {
        process.env.NODETOOL_USE_CORRELATION = orig;
      }
    }
  });
});

describe("drops-closes — filtered stream does not hang downstream Collect", () => {
  it("a filter that drops every other item lets Collect finalize with the kept items", async () => {
    const { result, captured } = await runWorkflow({
      jobId: "drops-collect",
      nodes: [
        {
          id: "src",
          type: "nodetool.input.IntegerInput",
          name: "items",
          properties: { value: [1, 2, 3, 4] }
        },
        {
          id: "fe",
          type: "nodetool.control.ForEach",
          is_streaming_output: true,
          outputs: { output: "any" },
          output_correlation: { output: iterationOutput("items") }
        },
        {
          id: "filt",
          type: "test.Filter",
          is_streaming_input: true,
          outputs: { value: "any" },
          output_correlation: { value: forwardOutput("value") }
        },
        {
          id: "c",
          type: "nodetool.control.Collect",
          is_streaming_input: true,
          input_mode: "stream",
          outputs: { output: "list[any]" },
          output_correlation: { output: aggregateOutput("input_item") }
        },
        { id: "sink", type: "test.Sink", is_streaming_input: true }
      ],
      edges: [
        dataEdge("src", "value", "fe", "input_list"),
        dataEdge("fe", "output", "filt", "value"),
        dataEdge("filt", "value", "c", "input_item"),
        dataEdge("c", "output", "sink", "value")
      ],
      executors: {
        fe: foreachNode(),
        filt: filterNode((v) => (v as number) % 2 === 0),
        c: collectNode()
      },
      captureFrom: { sink: ["value"] }
    });

    expect(result.status).toBe("completed");
    const envs = captured.get("sink")!.get("value")!;
    expect(envs).toHaveLength(1);
    expect(envs[0].data).toEqual([2, 4]);
  });
});
