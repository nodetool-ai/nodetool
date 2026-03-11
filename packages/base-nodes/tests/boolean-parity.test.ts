import { describe, expect, it } from "vitest";
import { makeRegistry, makeRunner } from "./e2e/helpers.js";
import type { Edge, NodeDescriptor } from "@nodetool/protocol";
import {
  AllNode,
  CompareNode,
  ConditionalSwitchNode,
  ConstantBoolNode,
  ConstantFloatNode,
  ConstantIntegerNode,
  ConstantListNode,
  ConstantStringNode,
  FormatTextNode,
  IsInNode,
  IsNoneNode,
  LogicalOperatorNode,
  NotNode,
  OutputNode,
  SomeNode,
  ToUppercaseNode,
} from "../src/index.js";

async function runWorkflow(nodes: NodeDescriptor[], edges: Edge[]) {
  return makeRunner(makeRegistry()).run(
    { job_id: `boolean-parity-${Date.now()}` },
    { nodes, edges },
  );
}

function constantNode(
  id: string,
  type: string,
  value: unknown,
): NodeDescriptor {
  return { id, type, properties: { value } };
}

function outputValue(
  result: Awaited<ReturnType<typeof runWorkflow>>,
  name: string,
): unknown {
  return result.outputs[name]?.[0];
}

describe("boolean parity: conditional routing", () => {
  it("classifies a slow speed as green and a fast speed as not-green", async () => {
    const green = await runWorkflow(
      [
        constantNode("spd", ConstantIntegerNode.nodeType, 25),
        {
          id: "ok",
          type: CompareNode.nodeType,
          properties: { b: 30, comparison: "<=" },
        },
        {
          id: "colour",
          type: ConditionalSwitchNode.nodeType,
          properties: { if_true: "green", if_false: "not-green" },
        },
        { id: "out", type: OutputNode.nodeType, name: "light" },
      ],
      [
        { source: "spd", sourceHandle: "output", target: "ok", targetHandle: "a" },
        { source: "ok", sourceHandle: "output", target: "colour", targetHandle: "condition" },
        { source: "colour", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );

    const notGreen = await runWorkflow(
      [
        constantNode("spd", ConstantIntegerNode.nodeType, 80),
        {
          id: "ok",
          type: CompareNode.nodeType,
          properties: { b: 30, comparison: "<=" },
        },
        {
          id: "colour",
          type: ConditionalSwitchNode.nodeType,
          properties: { if_true: "green", if_false: "not-green" },
        },
        { id: "out", type: OutputNode.nodeType, name: "light" },
      ],
      [
        { source: "spd", sourceHandle: "output", target: "ok", targetHandle: "a" },
        { source: "ok", sourceHandle: "output", target: "colour", targetHandle: "condition" },
        { source: "colour", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );

    expect(outputValue(green, "light")).toBe("green");
    expect(outputValue(notGreen, "light")).toBe("not-green");
  });

  it("implements a compound range gate using compare plus logical and", async () => {
    const normal = await runWorkflow(
      [
        constantNode("temp", ConstantFloatNode.nodeType, 36.8),
        { id: "above", type: CompareNode.nodeType, properties: { b: 36.0, comparison: ">=" } },
        { id: "below", type: CompareNode.nodeType, properties: { b: 37.5, comparison: "<=" } },
        { id: "normal", type: LogicalOperatorNode.nodeType, properties: { operation: "and" } },
        {
          id: "dx",
          type: ConditionalSwitchNode.nodeType,
          properties: { if_true: "normal", if_false: "abnormal" },
        },
        { id: "out", type: OutputNode.nodeType, name: "diagnosis" },
      ],
      [
        { source: "temp", sourceHandle: "output", target: "above", targetHandle: "a" },
        { source: "temp", sourceHandle: "output", target: "below", targetHandle: "a" },
        { source: "above", sourceHandle: "output", target: "normal", targetHandle: "a" },
        { source: "below", sourceHandle: "output", target: "normal", targetHandle: "b" },
        { source: "normal", sourceHandle: "output", target: "dx", targetHandle: "condition" },
        { source: "dx", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );

    const abnormal = await runWorkflow(
      [
        constantNode("temp", ConstantFloatNode.nodeType, 39.1),
        { id: "above", type: CompareNode.nodeType, properties: { b: 36.0, comparison: ">=" } },
        { id: "below", type: CompareNode.nodeType, properties: { b: 37.5, comparison: "<=" } },
        { id: "normal", type: LogicalOperatorNode.nodeType, properties: { operation: "and" } },
        {
          id: "dx",
          type: ConditionalSwitchNode.nodeType,
          properties: { if_true: "normal", if_false: "abnormal" },
        },
        { id: "out", type: OutputNode.nodeType, name: "diagnosis" },
      ],
      [
        { source: "temp", sourceHandle: "output", target: "above", targetHandle: "a" },
        { source: "temp", sourceHandle: "output", target: "below", targetHandle: "a" },
        { source: "above", sourceHandle: "output", target: "normal", targetHandle: "a" },
        { source: "below", sourceHandle: "output", target: "normal", targetHandle: "b" },
        { source: "normal", sourceHandle: "output", target: "dx", targetHandle: "condition" },
        { source: "dx", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );

    expect(outputValue(normal, "diagnosis")).toBe("normal");
    expect(outputValue(abnormal, "diagnosis")).toBe("abnormal");
  });
});

describe("boolean parity: logical operators", () => {
  it("mirrors not and double-negation workflow behavior", async () => {
    const inverted = await runWorkflow(
      [
        constantNode("flag", ConstantBoolNode.nodeType, true),
        { id: "not", type: NotNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "inv" },
      ],
      [
        { source: "flag", sourceHandle: "output", target: "not", targetHandle: "value" },
        { source: "not", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );

    const doubleNegation = await runWorkflow(
      [
        constantNode("flag", ConstantBoolNode.nodeType, false),
        { id: "not1", type: NotNode.nodeType },
        { id: "not2", type: NotNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "same" },
      ],
      [
        { source: "flag", sourceHandle: "output", target: "not1", targetHandle: "value" },
        { source: "not1", sourceHandle: "output", target: "not2", targetHandle: "value" },
        { source: "not2", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );

    expect(outputValue(inverted, "inv")).toBe(false);
    expect(outputValue(doubleNegation, "same")).toBe(false);
  });

  it("matches xor and nand truth-table cases from the Python workflow tests", async () => {
    const xor = await runWorkflow(
      [
        constantNode("a", ConstantBoolNode.nodeType, true),
        constantNode("b", ConstantBoolNode.nodeType, false),
        { id: "xor", type: LogicalOperatorNode.nodeType, properties: { operation: "xor" } },
        { id: "out", type: OutputNode.nodeType, name: "xor" },
      ],
      [
        { source: "a", sourceHandle: "output", target: "xor", targetHandle: "a" },
        { source: "b", sourceHandle: "output", target: "xor", targetHandle: "b" },
        { source: "xor", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );

    const xorBothTrue = await runWorkflow(
      [
        constantNode("a", ConstantBoolNode.nodeType, true),
        constantNode("b", ConstantBoolNode.nodeType, true),
        { id: "xor", type: LogicalOperatorNode.nodeType, properties: { operation: "xor" } },
        { id: "out", type: OutputNode.nodeType, name: "xor" },
      ],
      [
        { source: "a", sourceHandle: "output", target: "xor", targetHandle: "a" },
        { source: "b", sourceHandle: "output", target: "xor", targetHandle: "b" },
        { source: "xor", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );

    const nand = await runWorkflow(
      [
        constantNode("a", ConstantBoolNode.nodeType, true),
        constantNode("b", ConstantBoolNode.nodeType, true),
        { id: "nand", type: LogicalOperatorNode.nodeType, properties: { operation: "nand" } },
        { id: "out", type: OutputNode.nodeType, name: "nand" },
      ],
      [
        { source: "a", sourceHandle: "output", target: "nand", targetHandle: "a" },
        { source: "b", sourceHandle: "output", target: "nand", targetHandle: "b" },
        { source: "nand", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );

    const nandOneFalse = await runWorkflow(
      [
        constantNode("a", ConstantBoolNode.nodeType, true),
        constantNode("b", ConstantBoolNode.nodeType, false),
        { id: "nand", type: LogicalOperatorNode.nodeType, properties: { operation: "nand" } },
        { id: "out", type: OutputNode.nodeType, name: "nand" },
      ],
      [
        { source: "a", sourceHandle: "output", target: "nand", targetHandle: "a" },
        { source: "b", sourceHandle: "output", target: "nand", targetHandle: "b" },
        { source: "nand", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );

    expect(outputValue(xor, "xor")).toBe(true);
    expect(outputValue(xorBothTrue, "xor")).toBe(false);
    expect(outputValue(nand, "nand")).toBe(false);
    expect(outputValue(nandOneFalse, "nand")).toBe(true);
  });
});

describe("boolean parity: helper nodes", () => {
  it("matches Python graph behavior for membership, nullability, and quantifiers", async () => {
    const isInFound = await runWorkflow(
      [
        constantNode("val", ConstantStringNode.nodeType, "banana"),
        constantNode("opts", ConstantListNode.nodeType, ["apple", "banana", "cherry"]),
        { id: "check", type: IsInNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "r" },
      ],
      [
        { source: "val", sourceHandle: "output", target: "check", targetHandle: "value" },
        { source: "opts", sourceHandle: "output", target: "check", targetHandle: "options" },
        { source: "check", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );

    const isInMissing = await runWorkflow(
      [
        constantNode("val", ConstantStringNode.nodeType, "fig"),
        constantNode("opts", ConstantListNode.nodeType, ["apple", "banana"]),
        { id: "check", type: IsInNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "r" },
      ],
      [
        { source: "val", sourceHandle: "output", target: "check", targetHandle: "value" },
        { source: "opts", sourceHandle: "output", target: "check", targetHandle: "options" },
        { source: "check", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );

    const isNoneWithNone = await runWorkflow(
      [
        { id: "check", type: IsNoneNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "r" },
      ],
      [
        { source: "check", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );

    const isNoneWithValue = await runWorkflow(
      [
        constantNode("val", ConstantIntegerNode.nodeType, 42),
        { id: "check", type: IsNoneNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "r" },
      ],
      [
        { source: "val", sourceHandle: "output", target: "check", targetHandle: "value" },
        { source: "check", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );

    const allTrue = await runWorkflow(
      [
        constantNode("vals", ConstantListNode.nodeType, [true, true, true]),
        { id: "check", type: AllNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "r" },
      ],
      [
        { source: "vals", sourceHandle: "output", target: "check", targetHandle: "values" },
        { source: "check", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );

    const allWithFalse = await runWorkflow(
      [
        constantNode("vals", ConstantListNode.nodeType, [true, false, true]),
        { id: "check", type: AllNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "r" },
      ],
      [
        { source: "vals", sourceHandle: "output", target: "check", targetHandle: "values" },
        { source: "check", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );

    const someWithOneTrue = await runWorkflow(
      [
        constantNode("vals", ConstantListNode.nodeType, [false, true, false]),
        { id: "check", type: SomeNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "r" },
      ],
      [
        { source: "vals", sourceHandle: "output", target: "check", targetHandle: "values" },
        { source: "check", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );

    const someAllFalse = await runWorkflow(
      [
        constantNode("vals", ConstantListNode.nodeType, [false, false]),
        { id: "check", type: SomeNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "r" },
      ],
      [
        { source: "vals", sourceHandle: "output", target: "check", targetHandle: "values" },
        { source: "check", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );

    expect(outputValue(isInFound, "r")).toBe(true);
    expect(outputValue(isInMissing, "r")).toBe(false);
    expect(outputValue(isNoneWithNone, "r")).toBe(true);
    expect(outputValue(isNoneWithValue, "r")).toBe(false);
    expect(outputValue(allTrue, "r")).toBe(true);
    expect(outputValue(allWithFalse, "r")).toBe(false);
    expect(outputValue(someWithOneTrue, "r")).toBe(true);
    expect(outputValue(someAllFalse, "r")).toBe(false);
  });
});

describe("boolean parity: chained output formatting", () => {
  it("matches the compare-to-label-to-report workflow", async () => {
    const result = await runWorkflow(
      [
        constantNode("score", ConstantIntegerNode.nodeType, 88),
        { id: "above", type: CompareNode.nodeType, properties: { b: 70, comparison: ">=" } },
        {
          id: "label",
          type: ConditionalSwitchNode.nodeType,
          properties: { if_true: "PASS", if_false: "FAIL" },
        },
        {
          id: "msg",
          type: FormatTextNode.nodeType,
          properties: { template: "Result: {{ status }}" },
        },
        { id: "out", type: OutputNode.nodeType, name: "report" },
      ],
      [
        { source: "score", sourceHandle: "output", target: "above", targetHandle: "a" },
        { source: "above", sourceHandle: "output", target: "label", targetHandle: "condition" },
        { source: "label", sourceHandle: "output", target: "msg", targetHandle: "status" },
        { source: "msg", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );

    expect(outputValue(result, "report")).toBe("Result: PASS");
  });

  it("matches the conditional greeting composition workflow", async () => {
    const vip = await runWorkflow(
      [
        constantNode("vip", ConstantBoolNode.nodeType, true),
        {
          id: "greeting",
          type: ConditionalSwitchNode.nodeType,
          properties: {
            if_true: "Welcome back, VIP!",
            if_false: "Hello, guest.",
          },
        },
        { id: "upper", type: ToUppercaseNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "msg" },
      ],
      [
        { source: "vip", sourceHandle: "output", target: "greeting", targetHandle: "condition" },
        { source: "greeting", sourceHandle: "output", target: "upper", targetHandle: "text" },
        { source: "upper", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );

    const guest = await runWorkflow(
      [
        constantNode("vip", ConstantBoolNode.nodeType, false),
        {
          id: "greeting",
          type: ConditionalSwitchNode.nodeType,
          properties: {
            if_true: "Welcome back, VIP!",
            if_false: "Hello, guest.",
          },
        },
        { id: "upper", type: ToUppercaseNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "msg" },
      ],
      [
        { source: "vip", sourceHandle: "output", target: "greeting", targetHandle: "condition" },
        { source: "greeting", sourceHandle: "output", target: "upper", targetHandle: "text" },
        { source: "upper", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );

    expect(outputValue(vip, "msg")).toBe("WELCOME BACK, VIP!");
    expect(outputValue(guest, "msg")).toBe("HELLO, GUEST.");
  });
});
