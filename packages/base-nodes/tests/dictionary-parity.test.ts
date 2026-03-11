import { describe, expect, it } from "vitest";
import { makeRegistry, makeRunner } from "./e2e/helpers.js";
import type { Edge, NodeDescriptor } from "@nodetool/protocol";
import {
  ArgMaxNode,
  CombineDictionaryNode,
  ConstantDictNode,
  ConstantStringNode,
  FilterDictionaryNode,
  GetValueNode,
  MakeDictionaryNode,
  OutputNode,
  ParseJSONNode,
  ReduceDictionariesNode,
  RemoveDictionaryKeyNode,
  ToJSONNode,
  ToYAMLNode,
  UpdateDictionaryNode,
  ZipDictionaryNode,
} from "../src/index.js";

async function run<T extends { process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> }>(
  NodeClass: new () => T,
  inputs: Record<string, unknown>,
) {
  return new NodeClass().process(inputs);
}

async function runWorkflow(nodes: NodeDescriptor[], edges: Edge[]) {
  return makeRunner(makeRegistry()).run(
    { job_id: `dictionary-parity-${Date.now()}` },
    { nodes, edges },
  );
}

function constantDictNode(id: string, value: Record<string, unknown>): NodeDescriptor {
  return { id, type: ConstantDictNode.nodeType, properties: { value } };
}

function outputValue(
  result: Awaited<ReturnType<typeof runWorkflow>>,
  name: string,
): unknown {
  return result.outputs[name]?.[0];
}

describe("dictionary parity: core transforms", () => {
  it("matches get, update, remove, parse, zip, combine, and filter behavior", async () => {
    await expect(
      run(GetValueNode, { dictionary: { a: 1, b: 2, c: 3 }, key: "a" }),
    ).resolves.toEqual({ output: 1 });

    await expect(
      run(GetValueNode, { dictionary: { a: 1 }, key: "missing", default: "default_value" }),
    ).resolves.toEqual({ output: "default_value" });

    await expect(
      run(UpdateDictionaryNode, { dictionary: { a: 1, b: 2, c: 3 }, new_pairs: { a: 10 } }),
    ).resolves.toEqual({ output: { a: 10, b: 2, c: 3 } });

    await expect(
      run(RemoveDictionaryKeyNode, { dictionary: { a: 1, b: 2, c: 3 }, key: "a" }),
    ).resolves.toEqual({ output: { b: 2, c: 3 } });

    await expect(
      run(RemoveDictionaryKeyNode, { dictionary: { a: 1, b: 2, c: 3 }, key: "z" }),
    ).resolves.toEqual({ output: { a: 1, b: 2, c: 3 } });

    await expect(
      run(ParseJSONNode, { json_string: '{"a":1,"b":2,"c":3}' }),
    ).resolves.toEqual({ output: { a: 1, b: 2, c: 3 } });

    await expect(
      run(ParseJSONNode, { json_string: "[1,2,3]" }),
    ).rejects.toThrow("Input JSON is not a dictionary");

    await expect(
      run(ZipDictionaryNode, { keys: ["a", "b", "c"], values: [1, 2, 3] }),
    ).resolves.toEqual({ output: { a: 1, b: 2, c: 3 } });

    await expect(
      run(ZipDictionaryNode, { keys: ["a", "b"], values: [1, 2, 3] }),
    ).resolves.toEqual({ output: { a: 1, b: 2 } });

    await expect(
      run(CombineDictionaryNode, { dict_a: { a: 1 }, dict_b: { a: 2, b: 2 } }),
    ).resolves.toEqual({ output: { a: 2, b: 2 } });

    await expect(
      run(FilterDictionaryNode, { dictionary: { a: 1, b: 2, c: 3 }, keys: ["a", "b"] }),
    ).resolves.toEqual({ output: { a: 1, b: 2 } });

    await expect(
      run(FilterDictionaryNode, { dictionary: { a: 1, b: 2, c: 3 }, keys: ["x", "y"] }),
    ).resolves.toEqual({ output: {} });
  });

  it("matches reduce-dictionaries conflict and shape behavior", async () => {
    await expect(
      run(ReduceDictionariesNode, {
        dictionaries: [
          { id: 1, value: "a" },
          { id: 2, value: "b" },
          { id: 3, value: "c" },
        ],
        key_field: "id",
        value_field: "value",
      }),
    ).resolves.toEqual({ output: { 1: "a", 2: "b", 3: "c" } });

    await expect(
      run(ReduceDictionariesNode, {
        dictionaries: [
          { id: 1, name: "Alice", age: 30 },
          { id: 2, name: "Bob", age: 25 },
        ],
        key_field: "id",
        value_field: "",
      }),
    ).resolves.toEqual({
      output: {
        1: { name: "Alice", age: 30 },
        2: { name: "Bob", age: 25 },
      },
    });

    await expect(
      run(ReduceDictionariesNode, {
        dictionaries: [
          { id: 1, value: "first" },
          { id: 1, value: "second" },
        ],
        key_field: "id",
        value_field: "value",
        conflict_resolution: "last",
      }),
    ).resolves.toEqual({ output: { 1: "second" } });

    await expect(
      run(ReduceDictionariesNode, {
        dictionaries: [
          { id: 1, value: "first" },
          { id: 1, value: "second" },
        ],
        key_field: "id",
        value_field: "value",
        conflict_resolution: "error",
      }),
    ).rejects.toThrow("Duplicate key found: 1");

    await expect(
      run(ReduceDictionariesNode, {
        dictionaries: [{ name: "Alice" }],
        key_field: "id",
        value_field: "name",
      }),
    ).rejects.toThrow("Key field 'id' not found in dictionary");

    await expect(
      run(ReduceDictionariesNode, {
        dictionaries: [{ id: 1, name: "Alice" }],
        key_field: "id",
        value_field: "value",
      }),
    ).rejects.toThrow("Value field 'value' not found in dictionary");
  });

  it("matches argmax, make-dictionary, and serializers", async () => {
    await expect(
      run(ArgMaxNode, { scores: { cat: 0.7, dog: 0.2, bird: 0.1 } }),
    ).resolves.toEqual({ output: "cat" });

    await expect(
      run(ArgMaxNode, { scores: { a: -5, b: -1, c: -10 } }),
    ).resolves.toEqual({ output: "b" });

    await expect(
      run(ArgMaxNode, { scores: { a: 0.5, b: 0.3, c: 0.5 } }),
    ).resolves.toEqual({ output: "a" });

    await expect(
      run(ArgMaxNode, { scores: {} }),
    ).rejects.toThrow("Input dictionary cannot be empty");

    const makeResult = await new MakeDictionaryNode().process({ key1: "value1", key2: 42 });
    expect(makeResult).toEqual({ output: { key1: "value1", key2: 42 } });
    await expect(new MakeDictionaryNode().process({})).resolves.toEqual({ output: {} });

    await expect(
      run(ToJSONNode, { dictionary: { synergy: 10, disruption: 8 } }),
    ).resolves.toEqual({ output: '{"synergy":10,"disruption":8}' });

    const yaml = await run(ToYAMLNode, {
      dictionary: { name: "Whiskers", attitude: "aloof", nap_hours: 18 },
    });
    expect(yaml.output).toContain("name:");
    expect(yaml.output).toContain("attitude:");
    expect(yaml.output).toContain("nap_hours:");
  });
});

describe("dictionary parity: workflow graphs", () => {
  it("zips names to gifts and looks up Carol's gift", async () => {
    const result = await runWorkflow(
      [
        {
          id: "zip",
          type: ZipDictionaryNode.nodeType,
          properties: {
            keys: ["Alice", "Bob", "Carol", "Dave"],
            values: ["Scarf", "Mug", "Book", "Socks"],
          },
        },
        {
          id: "get",
          type: GetValueNode.nodeType,
          properties: { key: "Carol" },
        },
        { id: "out", type: OutputNode.nodeType, name: "r" },
      ],
      [
        { source: "zip", sourceHandle: "output", target: "get", targetHandle: "dictionary" },
        { source: "get", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );

    expect(outputValue(result, "r")).toBe("Book");
  });

  it("combines and updates inventories while preserving non-overridden values", async () => {
    const result = await runWorkflow(
      [
        constantDictNode("base", { size: "medium", milk: "whole", sugar: 2 }),
        constantDictNode("custom", { size: "large", milk: "oat" }),
        { id: "update", type: UpdateDictionaryNode.nodeType },
        { id: "size", type: GetValueNode.nodeType, properties: { key: "size" } },
        { id: "milk", type: GetValueNode.nodeType, properties: { key: "milk" } },
        { id: "sugar", type: GetValueNode.nodeType, properties: { key: "sugar" } },
        { id: "out_size", type: OutputNode.nodeType, name: "size" },
        { id: "out_milk", type: OutputNode.nodeType, name: "milk" },
        { id: "out_sugar", type: OutputNode.nodeType, name: "sugar" },
      ],
      [
        { source: "base", sourceHandle: "output", target: "update", targetHandle: "dictionary" },
        { source: "custom", sourceHandle: "output", target: "update", targetHandle: "new_pairs" },
        { source: "update", sourceHandle: "output", target: "size", targetHandle: "dictionary" },
        { source: "update", sourceHandle: "output", target: "milk", targetHandle: "dictionary" },
        { source: "update", sourceHandle: "output", target: "sugar", targetHandle: "dictionary" },
        { source: "size", sourceHandle: "output", target: "out_size", targetHandle: "value" },
        { source: "milk", sourceHandle: "output", target: "out_milk", targetHandle: "value" },
        { source: "sugar", sourceHandle: "output", target: "out_sugar", targetHandle: "value" },
      ],
    );

    expect(outputValue(result, "size")).toBe("large");
    expect(outputValue(result, "milk")).toBe("oat");
    expect(outputValue(result, "sugar")).toBe(2);
  });

  it("round-trips parsed JSON into a value lookup", async () => {
    const result = await runWorkflow(
      [
        {
          id: "json",
          type: ConstantStringNode.nodeType,
          properties: { value: '{"protein":25,"fat":10}' },
        },
        { id: "parse", type: ParseJSONNode.nodeType },
        { id: "get", type: GetValueNode.nodeType, properties: { key: "protein" } },
        { id: "out", type: OutputNode.nodeType, name: "protein" },
      ],
      [
        { source: "json", sourceHandle: "output", target: "parse", targetHandle: "json_string" },
        { source: "parse", sourceHandle: "output", target: "get", targetHandle: "dictionary" },
        { source: "get", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );

    expect(outputValue(result, "protein")).toBe(25);
  });

  it("serializes dictionary workflows to JSON and YAML with stable key presence", async () => {
    const jsonResult = await runWorkflow(
      [
        constantDictNode("profile", { synergy: 10, disruption: 8, pivot: 6 }),
        { id: "json", type: ToJSONNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "r" },
      ],
      [
        { source: "profile", sourceHandle: "output", target: "json", targetHandle: "dictionary" },
        { source: "json", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );

    const yamlResult = await runWorkflow(
      [
        constantDictNode("profile", { name: "Whiskers", attitude: "aloof", nap_hours: 18 }),
        { id: "yaml", type: ToYAMLNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "r" },
      ],
      [
        { source: "profile", sourceHandle: "output", target: "yaml", targetHandle: "dictionary" },
        { source: "yaml", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );

    expect(outputValue(jsonResult, "r")).toContain("synergy");
    expect(outputValue(jsonResult, "r")).toContain("disruption");
    expect(outputValue(yamlResult, "r")).toContain("name:");
    expect(outputValue(yamlResult, "r")).toContain("attitude:");
    expect(outputValue(yamlResult, "r")).toContain("nap_hours:");
  });
});
