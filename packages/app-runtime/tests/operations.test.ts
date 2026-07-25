import { describe, expect, it } from "vitest";

import {
  implicitOperation,
  mergeVariables,
  outputVariableTargets,
  resolveOperationParams
} from "../src/operations.js";
import { applyEvents, createInstanceState } from "../src/state.js";
import type { OperationBinding } from "../src/document.js";

const state = applyEvents(createInstanceState(), [
  { type: "setInput", key: "main:in1", value: "typed" },
  { type: "setInput", key: "main:in2", value: "also typed" },
  { type: "setVariable", variableId: "tone", value: "formal" }
]);

const names: Record<string, string> = {
  in1: "prompt",
  in2: "context",
  in3: "doc"
};

const resolve = (operation: OperationBinding, inputNodeIds: string[]) =>
  resolveOperationParams({
    operation,
    state,
    inputNodeIds,
    inputName: (nodeId) => names[nodeId],
    resourceRef: (id) =>
      id === "r1" ? { kind: "storyboard", id: "sb-1", revision: 4 } : undefined
  });

describe("resolveOperationParams", () => {
  it("keys params by node name while bindings key by node id", () => {
    const op = implicitOperation("wf1");
    expect(resolve(op, ["in1", "in2"])).toEqual({
      prompt: "typed",
      context: "also typed"
    });
  });

  it("honors variable, constant, and resource mappings", () => {
    const op: OperationBinding = {
      ...implicitOperation("wf1"),
      inputs: {
        in1: { from: "variable", variableId: "tone" },
        in2: { from: "constant", value: 7 },
        in3: { from: "resource", resourceBindingId: "r1" }
      }
    };
    expect(resolve(op, ["in1", "in2", "in3"])).toEqual({
      prompt: "formal",
      context: 7,
      doc: { kind: "storyboard", id: "sb-1", revision: 4 }
    });
  });

  it("omits an input with no value rather than sending undefined", () => {
    const op: OperationBinding = {
      ...implicitOperation("wf1"),
      inputs: { in3: { from: "resource", resourceBindingId: "missing" } }
    };
    expect(resolve(op, ["in3"])).toEqual({});
  });

  it("skips a node the graph has no name for", () => {
    expect(resolve(implicitOperation("wf1"), ["ghost"])).toEqual({});
  });
});

describe("outputVariableTargets", () => {
  it("lists only the outputs that write app state", () => {
    const op: OperationBinding = {
      ...implicitOperation("wf1"),
      outputs: {
        out1: { to: "variable", variableId: "analysis" },
        out2: { to: "display" }
      }
    };
    expect(outputVariableTargets(op)).toEqual([
      { nodeId: "out1", variableId: "analysis" }
    ]);
  });
});

describe("mergeVariables", () => {
  it("adds undeclared SetVariable channels without shadowing declarations", () => {
    const declared = [
      { id: "v1", name: "tone", scope: "user" as const, persist: true }
    ];
    const merged = mergeVariables(declared, ["tone", "dark"]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ id: "v1", persist: true });
    expect(merged[1]).toMatchObject({ id: "dark", scope: "instance" });
  });
});
