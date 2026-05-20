/**
 * Lineage propagation algebra.
 *
 *   forward preserves
 *   single inherits invocation
 *   iteration extends with new root
 *   chunk repeats same lineage per logical item
 *   sibling iteration outputs share one minted token
 *
 * See docs/correlation-design.md §2-3 and tests/correlation/README.md.
 */

import { describe, expect, it } from "vitest";
import {
  runWorkflow,
  forwardOutput,
  iterationOutput,
  chunkOutput,
  singleOutput,
  dataEdge,
  seedSource,
  foreachNode,
  passthrough,
  forwardNode
} from "../_harness.js";
import {
  assertHasRoot,
  assertRootIndex,
  assertSameLineage,
  assertSiblingOutputsShareToken,
  indicesAt,
  valuesFrom
} from "../_assertions.js";
import type { NodeExecutor } from "../../../src/actor.js";
import type { NodeInputs, NodeOutputs } from "../../../src/io.js";

describe("propagation — single output inherits invocation lineage", () => {
  it("source → map → sink: lineage flows unchanged through a buffered map", async () => {
    const { result, captured } = await runWorkflow({
      jobId: "propagation-single",
      nodes: [
        {
          id: "src",
          type: "test.Seed",
          is_streaming_input: true,
          outputs: { value: "any" },
          output_correlation: {
            value: iterationOutput("items")
          }
        },
        {
          id: "map",
          type: "test.Map",
          outputs: { value: "any" },
          output_correlation: { value: forwardOutput("value") }
        },
        { id: "sink", type: "test.Sink", is_streaming_input: true }
      ],
      edges: [
        dataEdge("src", "value", "map", "value", "eSrc"),
        dataEdge("map", "value", "sink", "value", "eMap")
      ],
      executors: {
        src: seedSource([
          { value: "A", lineage: { "src:items": { index: 0 } } },
          { value: "B", lineage: { "src:items": { index: 1 } } }
        ]),
        map: passthrough()
      },
      captureFrom: { sink: ["value"] }
    });

    expect(result.status).toBe("completed");
    const envs = captured.get("sink")!.get("value")!;
    expect(valuesFrom(envs)).toEqual(["A", "B"]);
    assertRootIndex(envs[0], "src:items", 0);
    assertRootIndex(envs[1], "src:items", 1);
  });
});

describe("propagation — forward preserves lineage", () => {
  it("stream-mode forward copies the source envelope's lineage", async () => {
    const lineage = (i: number) => ({ "src:items": { index: i } });
    const { result, captured } = await runWorkflow({
      jobId: "propagation-forward",
      nodes: [
        {
          id: "src",
          type: "test.Seed",
          is_streaming_input: true,
          outputs: { value: "any" },
          output_correlation: { value: iterationOutput("items") }
        },
        {
          id: "fwd",
          type: "test.Forward",
          is_streaming_input: true,
          outputs: { value: "any" },
          output_correlation: { value: forwardOutput("value") }
        },
        { id: "sink", type: "test.Sink", is_streaming_input: true }
      ],
      edges: [
        dataEdge("src", "value", "fwd", "value", "eSrc"),
        dataEdge("fwd", "value", "sink", "value", "eFwd")
      ],
      executors: {
        src: seedSource([
          { value: "A", lineage: lineage(0) },
          { value: "B", lineage: lineage(1) }
        ]),
        fwd: forwardNode()
      },
      captureFrom: { sink: ["value"] }
    });

    expect(result.status).toBe("completed");
    const envs = captured.get("sink")!.get("value")!;
    expect(valuesFrom(envs)).toEqual(["A", "B"]);
    expect(indicesAt(envs, "src:items")).toEqual([0, 1]);
  });
});

describe("propagation — iteration extends lineage with new root", () => {
  it("ForEach mints fe:items tokens visible downstream", async () => {
    const { result, captured } = await runWorkflow({
      jobId: "propagation-iteration",
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
          outputs: { output: "any", index: "int" },
          output_correlation: {
            output: iterationOutput("items"),
            index: iterationOutput("items")
          }
        },
        { id: "sink", type: "test.Sink", is_streaming_input: true }
      ],
      edges: [
        dataEdge("src", "value", "fe", "input_list", "eSrc"),
        dataEdge("fe", "output", "sink", "value", "eFe")
      ],
      executors: { fe: foreachNode() },
      captureFrom: { sink: ["value"] }
    });

    expect(result.status).toBe("completed");
    const envs = captured.get("sink")!.get("value")!;
    expect(valuesFrom(envs)).toEqual(["a", "b", "c"]);
    expect(indicesAt(envs, "fe:items")).toEqual([0, 1, 2]);
  });
});

describe("propagation — sibling iteration outputs share one minted token", () => {
  it("ForEach.output and ForEach.index, same `items` group, share token per item", async () => {
    const { result, captured } = await runWorkflow({
      jobId: "propagation-siblings",
      nodes: [
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
          outputs: { output: "any", index: "int" },
          output_correlation: {
            output: iterationOutput("items"),
            index: iterationOutput("items")
          }
        },
        { id: "vals", type: "test.Sink", is_streaming_input: true },
        { id: "idxs", type: "test.Sink", is_streaming_input: true }
      ],
      edges: [
        dataEdge("src", "value", "fe", "input_list", "eSrc"),
        dataEdge("fe", "output", "vals", "value", "eVal"),
        dataEdge("fe", "index", "idxs", "value", "eIdx")
      ],
      executors: { fe: foreachNode() },
      captureFrom: { vals: ["value"], idxs: ["value"] }
    });

    expect(result.status).toBe("completed");
    const valEnvs = captured.get("vals")!.get("value")!;
    const idxEnvs = captured.get("idxs")!.get("value")!;
    expect(valuesFrom(valEnvs)).toEqual(["x", "y"]);
    expect(valuesFrom(idxEnvs)).toEqual([0, 1]);
    assertSiblingOutputsShareToken(
      { output: valEnvs, index: idxEnvs },
      "fe:items"
    );
  });
});

describe("propagation — chunk repeats lineage per logical item", () => {
  it("chunk-kind output keeps the same invocation lineage on every chunk", async () => {
    // A buffered node with a chunk output that emits multiple frames via
    // genProcess. Every chunk should carry the SAME invocation lineage —
    // chunk sequencing lives in metadata, not in correlation_lineage.
    const chunker: NodeExecutor = {
      async process() {
        return {};
      },
      async *genProcess() {
        yield { chunk: "h" };
        yield { chunk: "e" };
        yield { chunk: "l" };
        yield { chunk: "l" };
        yield { chunk: "o" };
      }
    };

    const { result, captured } = await runWorkflow({
      jobId: "propagation-chunk",
      nodes: [
        {
          id: "src",
          type: "test.Seed",
          is_streaming_input: true,
          outputs: { value: "any" },
          output_correlation: { value: iterationOutput("items") }
        },
        {
          id: "llm",
          type: "test.Chunker",
          is_streaming_output: true,
          outputs: { chunk: "string" },
          output_correlation: { chunk: chunkOutput("value") },
          propertyTypes: { value: "any" }
        },
        { id: "sink", type: "test.Sink", is_streaming_input: true }
      ],
      edges: [
        dataEdge("src", "value", "llm", "value", "eSrc"),
        dataEdge("llm", "chunk", "sink", "value", "eLlm")
      ],
      executors: {
        src: seedSource([
          { value: "in", lineage: { "src:items": { index: 7 } } }
        ]),
        llm: chunker
      },
      captureFrom: { sink: ["value"] }
    });

    expect(result.status).toBe("completed");
    const envs = captured.get("sink")!.get("value")!;
    expect(valuesFrom(envs)).toEqual(["h", "e", "l", "l", "o"]);
    // Every chunk inherits the invocation lineage — same root, same index.
    for (let i = 1; i < envs.length; i++) {
      assertSameLineage(envs[0], envs[i]);
    }
    assertRootIndex(envs[0], "src:items", 7);
  });
});

describe("propagation — source nodes have empty lineage", () => {
  it("a source with no inputs emits at empty scope", async () => {
    const { result, captured } = await runWorkflow({
      jobId: "propagation-source-empty",
      nodes: [
        {
          id: "src",
          type: "nodetool.input.IntegerInput",
          name: "n",
          properties: { value: 42 }
        },
        { id: "sink", type: "test.Sink", is_streaming_input: true }
      ],
      edges: [dataEdge("src", "value", "sink", "value", "e1")],
      executors: {},
      captureFrom: { sink: ["value"] }
    });

    expect(result.status).toBe("completed");
    const envs = captured.get("sink")!.get("value")!;
    expect(envs).toHaveLength(1);
    expect(envs[0].data).toBe(42);
    expect(envs[0].correlation_lineage).toEqual({});
  });
});
