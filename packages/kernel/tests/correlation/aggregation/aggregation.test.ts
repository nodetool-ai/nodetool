/**
 * Aggregation / collapse algebra.
 *
 *   aggregate(innermost) drops the last root from the lineage
 *   collect / last / count all collapse the innermost iteration
 *   empty iteration scope closes so aggregate finalizes
 *   nested aggregate only collapses the intended root
 *
 * See docs/correlation-design.md §1, §3 (aggregate kind), §6 (close
 * synthesis) and tests/correlation/README.md.
 */

import { describe, expect, it } from "vitest";
import {
  runWorkflow,
  iterationOutput,
  aggregateOutput,
  forwardOutput,
  singleOutput,
  dataEdge,
  foreachNode,
  collectNode,
  lastNode,
  countNode
} from "../_harness.js";
import {
  assertRootCollapsed,
  valuesFrom
} from "../_assertions.js";

describe("aggregation — collect collapses the innermost root", () => {
  it("Collect over ForEach drops fe:items and emits at the parent scope", async () => {
    const { result, captured } = await runWorkflow({
      jobId: "aggregation-collect",
      nodes: [
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
        dataEdge("fe", "output", "c", "input_item"),
        dataEdge("c", "output", "sink", "value")
      ],
      executors: { fe: foreachNode(), c: collectNode() },
      captureFrom: { sink: ["value"] }
    });

    expect(result.status).toBe("completed");
    const envs = captured.get("sink")!.get("value")!;
    expect(envs).toHaveLength(1);
    expect(envs[0].data).toEqual(["a", "b", "c"]);
    // fe:items is collapsed — the aggregate output sits at the parent scope.
    assertRootCollapsed(envs[0], "fe:items");
  });
});

describe("aggregation — last collapses the innermost root", () => {
  it("Last over ForEach emits the final value with the iteration root dropped", async () => {
    const { result, captured } = await runWorkflow({
      jobId: "aggregation-last",
      nodes: [
        {
          id: "src",
          type: "nodetool.input.IntegerInput",
          name: "items",
          properties: { value: [1, 2, 3] }
        },
        {
          id: "fe",
          type: "nodetool.control.ForEach",
          is_streaming_output: true,
          outputs: { output: "any" },
          output_correlation: { output: iterationOutput("items") }
        },
        {
          id: "l",
          type: "nodetool.control.Last",
          is_streaming_input: true,
          input_mode: "stream",
          outputs: { output: "any" },
          output_correlation: { output: aggregateOutput("input_item") }
        },
        { id: "sink", type: "test.Sink", is_streaming_input: true }
      ],
      edges: [
        dataEdge("src", "value", "fe", "input_list"),
        dataEdge("fe", "output", "l", "input_item"),
        dataEdge("l", "output", "sink", "value")
      ],
      executors: { fe: foreachNode(), l: lastNode() },
      captureFrom: { sink: ["value"] }
    });

    expect(result.status).toBe("completed");
    const envs = captured.get("sink")!.get("value")!;
    expect(envs).toHaveLength(1);
    expect(envs[0].data).toBe(3);
    assertRootCollapsed(envs[0], "fe:items");
  });
});

describe("aggregation — count collapses the innermost root", () => {
  it("Count over ForEach emits the element count at the parent scope", async () => {
    const { result, captured } = await runWorkflow({
      jobId: "aggregation-count",
      nodes: [
        {
          id: "src",
          type: "nodetool.input.IntegerInput",
          name: "items",
          properties: { value: ["x", "y", "z", "w"] }
        },
        {
          id: "fe",
          type: "nodetool.control.ForEach",
          is_streaming_output: true,
          outputs: { output: "any" },
          output_correlation: { output: iterationOutput("items") }
        },
        {
          id: "ct",
          type: "nodetool.control.Count",
          is_streaming_input: true,
          input_mode: "stream",
          outputs: { output: "int" },
          output_correlation: { output: aggregateOutput("input_item") }
        },
        { id: "sink", type: "test.Sink", is_streaming_input: true }
      ],
      edges: [
        dataEdge("src", "value", "fe", "input_list"),
        dataEdge("fe", "output", "ct", "input_item"),
        dataEdge("ct", "output", "sink", "value")
      ],
      executors: { fe: foreachNode(), ct: countNode() },
      captureFrom: { sink: ["value"] }
    });

    expect(result.status).toBe("completed");
    const envs = captured.get("sink")!.get("value")!;
    expect(envs).toHaveLength(1);
    expect(envs[0].data).toBe(4);
    assertRootCollapsed(envs[0], "fe:items");
  });
});

describe("aggregation — empty iteration still closes the scope", () => {
  it("Collect over an empty ForEach emits an empty list and finalizes", async () => {
    const { result, captured } = await runWorkflow({
      jobId: "aggregation-empty",
      nodes: [
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
        },
        { id: "sink", type: "test.Sink", is_streaming_input: true }
      ],
      edges: [
        dataEdge("src", "value", "fe", "input_list"),
        dataEdge("fe", "output", "c", "input_item"),
        dataEdge("c", "output", "sink", "value")
      ],
      executors: { fe: foreachNode(), c: collectNode() },
      captureFrom: { sink: ["value"] }
    });

    expect(result.status).toBe("completed");
    const envs = captured.get("sink")!.get("value")!;
    expect(envs).toHaveLength(1);
    expect(envs[0].data).toEqual([]);
    assertRootCollapsed(envs[0], "fe:items");
  });
});

describe("aggregation — nested aggregate only collapses the inner root", () => {
  it("Collect inside an outer ForEach drops inner:items but keeps outer:items", async () => {
    const inner = foreachNode();
    const { result, captured } = await runWorkflow({
      jobId: "aggregation-nested",
      nodes: [
        {
          id: "src",
          type: "nodetool.input.IntegerInput",
          name: "items",
          properties: { value: [["a", "b"], ["c"]] }
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
        dataEdge("src", "value", "outer", "input_list"),
        dataEdge("outer", "output", "inner", "input_list"),
        dataEdge("inner", "output", "c", "input_item"),
        dataEdge("c", "output", "sink", "value")
      ],
      executors: { outer: foreachNode(), inner, c: collectNode() },
      captureFrom: { sink: ["value"] }
    });

    expect(result.status).toBe("completed");
    const envs = captured.get("sink")!.get("value")!;
    // One emit per outer iteration; each emit collapses inner:items but
    // still carries outer:items.
    expect(envs.length).toBeGreaterThanOrEqual(1);
    for (const env of envs) {
      assertRootCollapsed(env, "inner:items");
      expect(env.correlation_lineage["outer:items"]).toBeDefined();
    }
  });
});
