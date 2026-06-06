/**
 * Invocation joining algebra.
 *
 *   comparable-prefix scopes join by identity
 *   same-ForEach diamonds pair by lineage, not arrival order
 *   constants / empty-scope inputs act sticky
 *   parent-scope inputs reuse for child keys
 *   nested ForEach joins parent + child correctly
 *   incomparable scopes reject without an explicit join
 *
 * See docs/correlation-design.md §3-4 and tests/correlation/README.md.
 */

import { describe, expect, it } from "vitest";
import {
  runWorkflow,
  expectGraphRejected,
  forwardOutput,
  iterationOutput,
  singleOutput,
  dataEdge,
  forwardNode,
  joinNode,
  foreachNode,
  passthrough
} from "../_harness.js";
import {
  assertJoinRejected,
  assertRootIndex,
  valuesFrom
} from "../_assertions.js";
import type { MessageEnvelope } from "../../../src/inbox.js";
import type { NodeExecutor } from "../../../src/actor.js";
import type { NodeInputs, NodeOutputs } from "../../../src/io.js";

describe("joining — same-ForEach diamonds join by lineage identity", () => {
  it("pairs A↔A and B↔B even when one branch reverses delivery order", async () => {
    // Slow branch reverses its outputs so FIFO would mispair.
    const slow: NodeExecutor = {
      async process() {
        return {};
      },
      async run(inputs: NodeInputs, outputs: NodeOutputs) {
        const buf: MessageEnvelope[] = [];
        for await (const e of inputs.streamWithEnvelope("value")) buf.push(e);
        for (let i = buf.length - 1; i >= 0; i--) {
          await outputs.forward("value", buf[i]);
        }
      }
    };

    const { result, captured } = await runWorkflow({
      jobId: "joining-diamond",
      nodes: [
        {
          id: "src",
          type: "nodetool.input.IntegerInput",
          name: "items",
          properties: { value: ["A", "B"] }
        },
        {
          id: "fe",
          type: "nodetool.control.ForEach",
          is_streaming_output: true,
          outputs: { output: "any" },
          output_correlation: { output: iterationOutput("items") }
        },
        {
          id: "fast",
          type: "test.Pass",
          outputs: { value: "any" },
          output_correlation: { value: forwardOutput("value") }
        },
        {
          id: "slow",
          type: "test.Slow",
          is_streaming_input: true,
          outputs: { value: "any" },
          output_correlation: { value: forwardOutput("value") }
        },
        {
          id: "join",
          type: "test.Join",
          outputs: { value: "any" },
          output_correlation: { value: singleOutput() }
        },
        { id: "sink", type: "test.Sink", is_streaming_input: true }
      ],
      edges: [
        dataEdge("src", "value", "fe", "input_list"),
        dataEdge("fe", "output", "fast", "value"),
        dataEdge("fe", "output", "slow", "value"),
        dataEdge("fast", "value", "join", "left"),
        dataEdge("slow", "value", "join", "right"),
        dataEdge("join", "value", "sink", "value")
      ],
      executors: {
        fe: foreachNode(),
        fast: passthrough(),
        slow,
        join: joinNode()
      },
      captureFrom: { sink: ["value"] }
    });

    expect(result.status).toBe("completed");
    const envs = captured.get("sink")!.get("value")!;
    expect(valuesFrom(envs).sort()).toEqual(["A|A", "B|B"]);
    // Each pair retains the per-item iteration token.
    for (const env of envs) {
      const idx = env.correlation_lineage["fe:items"]?.index;
      expect(idx).toBeDefined();
      if (env.data === "A|A") expect(idx).toBe(0);
      if (env.data === "B|B") expect(idx).toBe(1);
    }
  });
});

describe("joining — constants / empty-scope inputs act sticky", () => {
  // A buffered node with one max-scope (iteration) input and one
  // empty-scope (constant) input fires once per item, reusing the constant.
  it("an empty-scope input is reused across every iteration key", async () => {
    const concatConst: NodeExecutor = {
      async process(ins) {
        return { value: `${ins.value}+${ins.k}` };
      }
    };
    const { result, captured } = await runWorkflow({
      jobId: "joining-constant",
      nodes: [
        {
          id: "k",
          type: "nodetool.input.IntegerInput",
          name: "k",
          properties: { value: "K" }
        },
        {
          id: "src",
          type: "nodetool.input.IntegerInput",
          name: "items",
          properties: { value: ["a", "b", "c"] }
        },
        {
          id: "fe",
          type: "nodetool.control.ForEach",
          is_streaming_output: true,
          outputs: { output: "any" },
          output_correlation: { output: iterationOutput("items") }
        },
        {
          id: "map",
          type: "test.Concat",
          outputs: { value: "any" },
          output_correlation: { value: forwardOutput("value") },
          propertyTypes: { value: "any", k: "any" }
        },
        { id: "sink", type: "test.Sink", is_streaming_input: true }
      ],
      edges: [
        dataEdge("src", "value", "fe", "input_list"),
        dataEdge("fe", "output", "map", "value"),
        dataEdge("k", "value", "map", "k"),
        dataEdge("map", "value", "sink", "value")
      ],
      executors: { fe: foreachNode(), map: concatConst },
      captureFrom: { sink: ["value"] }
    });

    expect(result.status).toBe("completed");
    const envs = captured.get("sink")!.get("value")!;
    expect(valuesFrom(envs)).toEqual(["a+K", "b+K", "c+K"]);
    for (let i = 0; i < envs.length; i++) {
      assertRootIndex(envs[i], "fe:items", i);
    }
  });
});

describe("joining — incomparable scopes reject without an explicit join", () => {
  it("two unrelated ForEach branches feeding one non-join node fail at graph load", async () => {
    await expectGraphRejected(
      {
        jobId: "joining-incomparable",
        nodes: [
          {
            id: "a",
            type: "nodetool.input.IntegerInput",
            name: "a",
            properties: { value: [1, 2] }
          },
          {
            id: "b",
            type: "nodetool.input.IntegerInput",
            name: "b",
            properties: { value: [3, 4] }
          },
          {
            id: "feA",
            type: "nodetool.control.ForEach",
            is_streaming_output: true,
            outputs: { output: "any" },
            output_correlation: { output: iterationOutput("items") }
          },
          {
            id: "feB",
            type: "nodetool.control.ForEach",
            is_streaming_output: true,
            outputs: { output: "any" },
            output_correlation: { output: iterationOutput("items") }
          },
          {
            id: "plain",
            type: "test.Join",
            outputs: { value: "any" },
            output_correlation: { value: singleOutput() }
          }
        ],
        edges: [
          dataEdge("a", "value", "feA", "input_list"),
          dataEdge("b", "value", "feB", "input_list"),
          dataEdge("feA", "output", "plain", "left"),
          dataEdge("feB", "output", "plain", "right")
        ],
        executors: { feA: foreachNode(), feB: foreachNode(), plain: joinNode() }
      },
      /independent iteration sources/
    );
  });

  it("emits an error message naming Zip and Cross as the fix", async () => {
    const out = await runWorkflow({
      jobId: "joining-incomparable-msg",
      nodes: [
        {
          id: "feA",
          type: "nodetool.control.ForEach",
          is_streaming_output: true,
          outputs: { output: "any" },
          output_correlation: { output: iterationOutput("items") }
        },
        {
          id: "feB",
          type: "nodetool.control.ForEach",
          is_streaming_output: true,
          outputs: { output: "any" },
          output_correlation: { output: iterationOutput("items") }
        },
        {
          id: "j",
          type: "test.Join",
          outputs: { value: "any" },
          output_correlation: { value: singleOutput() }
        }
      ],
      edges: [
        dataEdge("feA", "output", "j", "left"),
        dataEdge("feB", "output", "j", "right")
      ],
      executors: { feA: foreachNode(), feB: foreachNode(), j: joinNode() }
    });
    assertJoinRejected(out.result.error);
  });
});

describe("joining — parent-scope inputs reuse for child keys", () => {
  it("a parent ForEach value is reused across each child ForEach key", async () => {
    // Outer ForEach yields ["P", "Q"]; for each parent we run an inner
    // ForEach yielding ["x", "y", "z"]. A buffered map receives BOTH the
    // parent value (scope [outer:items]) and the child value (scope
    // [outer:items, inner:items]). The parent value must be reused for
    // every child key under the same parent token.
    const inner: NodeExecutor = {
      async process() {
        return {};
      },
      async *genProcess() {
        // We can't easily parametrize inner from input; just emit fixed.
        yield { output: "x" };
        yield { output: "y" };
        yield { output: "z" };
      }
    };
    const map: NodeExecutor = {
      async process(ins) {
        return { value: `${ins.parent}/${ins.child}` };
      }
    };

    const { result, captured } = await runWorkflow({
      jobId: "joining-nested-reuse",
      nodes: [
        {
          id: "src",
          type: "nodetool.input.IntegerInput",
          name: "items",
          properties: { value: ["P", "Q"] }
        },
        {
          id: "outer",
          type: "nodetool.control.ForEach",
          is_streaming_output: true,
          outputs: { output: "any" },
          output_correlation: { output: iterationOutput("items") }
        },
        {
          id: "inner",
          type: "nodetool.control.ForEach",
          is_streaming_output: true,
          outputs: { output: "any" },
          output_correlation: { output: iterationOutput("items") }
        },
        {
          id: "map",
          type: "test.PairUp",
          outputs: { value: "any" },
          output_correlation: { value: singleOutput() },
          propertyTypes: { parent: "any", child: "any" }
        },
        { id: "sink", type: "test.Sink", is_streaming_input: true }
      ],
      edges: [
        dataEdge("src", "value", "outer", "input_list"),
        dataEdge("outer", "output", "inner", "input_list"),
        dataEdge("outer", "output", "map", "parent"),
        dataEdge("inner", "output", "map", "child"),
        dataEdge("map", "value", "sink", "value")
      ],
      executors: { outer: foreachNode(), inner, map },
      captureFrom: { sink: ["value"] }
    });

    expect(result.status).toBe("completed");
    const envs = captured.get("sink")!.get("value")!;
    expect(valuesFrom(envs).sort()).toEqual([
      "P/x",
      "P/y",
      "P/z",
      "Q/x",
      "Q/y",
      "Q/z"
    ]);
    // Each child carries both outer and inner tokens.
    for (const env of envs) {
      expect(env.correlation_lineage["outer:items"]).toBeDefined();
      expect(env.correlation_lineage["inner:items"]).toBeDefined();
    }
  });
});
