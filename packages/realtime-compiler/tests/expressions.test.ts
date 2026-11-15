import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { compileRealtimeGraph, PLAN_SCHEMA } from "../src/index.js";
import type { AnalyticOperation, CompileInput, ControlExpression } from "../src/index.js";
import { expressionFixture, fixture } from "./fixtures/RenderGraph.js";

const validate = new Ajv2020({ strict: true }).compile(PLAN_SCHEMA);
const literal = (value: number | readonly number[]): ControlExpression => ({ kind: "literal", value });
function expressionInput(expression: ControlExpression): CompileInput {
  const input = fixture(); const descriptors = new Map(input.descriptors);
  const invert = descriptors.get("invert");
  if (invert?.kind !== "shader") { throw new Error("Missing invert fixture"); }
  descriptors.set("invert", { ...invert, uniforms: [{ field: "amount", expression }] });
  return { ...input, descriptors };
}
function success(input: CompileInput) {
  const result = compileRealtimeGraph(input);
  if (result.status !== "ok") { throw new Error(JSON.stringify(result.diagnostics)); }
  expect(validate(result.plan), JSON.stringify(validate.errors)).toBe(true);
  return result.plan;
}
function uniform(expression: ControlExpression) {
  const plan = success(expressionInput(expression));
  const register = plan.render.passes[1].uniforms[0];
  const instruction = plan.control.ops.find((op) => op.out === register);
  if (!instruction) { throw new Error("Missing expression result"); }
  return instruction;
}
function rejected(expression: ControlExpression, reason: string) {
  expect(compileRealtimeGraph(expressionInput(expression))).toMatchObject({
    status: "error", diagnostics: [{ node: "invert", reason }]
  });
}

describe("descriptor uniform expressions", () => {
  const cases: Array<[AnalyticOperation, number[], number]> = [
    ["add", [0.25, 0.5], 0.75], ["subtract", [0.75, 0.5], 0.25],
    ["multiply", [0.25, 2], 0.5], ["divide", [0.5, 2], 0.25],
    ["divide", [1, 0], 0], ["min", [0.75, 0.5], 0.5], ["max", [0.75, 0.5], 0.75],
    ["less", [0.5, 0.75], 1], ["equal", [0.5, 0.75], 0],
    ["remap", [2, 0, 4, 0, 1], 0.5], ["remap", [2, 1, 1, 0.25, 1], 0.25]
  ];
  it.each(cases)("folds %s with %j using executor semantics", (op, inputs, expected) => {
    expect(uniform({ kind: "operation", op, inputs: inputs.map(literal) }))
      .toMatchObject({ node: "@uniform:invert:amount", op: "constant", in: [], values: [expected] });
  });
  it("folds property values and broadcasts vectors without retaining intermediate instructions", () => {
    const expression: ControlExpression = { kind: "operation", op: "add", inputs: [
      { kind: "property", property: "mix", default: [0, 0.25, 0.5, 0.75] }, literal(0.25)
    ] };
    const input = expressionInput(expression);
    const graph = { ...input.graph, nodes: input.graph.nodes.map((node) => node.id === "invert" ? { ...node, properties: { mix: [0.25, 0.5, 0.75, 1] } } : node) };
    const plan = success({ ...input, graph });
    const instructions = plan.control.ops.filter((op) => op.node.includes("invert"));
    expect(instructions).toHaveLength(1);
    expect(instructions[0]).toMatchObject({ node: "@uniform:invert:amount", op: "constant", in: [], values: [0.5, 0.75, 1, 1.25] });
  });
  it("packs scalar expressions and lowers connected properties into stored IR", async () => {
    expect(uniform({ kind: "operation", op: "vec4", inputs: [literal(0), literal(0.25), literal(0.5), literal(1)] }).values)
      .toEqual([0, 0.25, 0.5, 1]);
    const input = expressionFixture(); const plan = success(input);
    await expect(JSON.stringify(plan, null, 2) + "\n").toMatchFileSnapshot("fixtures/render-expression-plan.json");
    expect(plan.control.ops.map((op) => op.op)).toContain("multiply");
    expect(plan.control.ops.map((op) => op.op)).not.toContain("add");
    expect(plan.control.ops.map((op) => op.node)).not.toContain("color");
    expect(success({ ...input, graph: { nodes: [...input.graph.nodes].reverse(), edges: [...input.graph.edges].reverse() } })).toEqual(plan);
  });
  it.each<AnalyticOperation>(["pow", "tanh", "time.seconds", "output.width"])("keeps %s in the runtime plan", (op) => {
    const inputs = op === "pow" ? [literal(2), literal(3)] : op === "tanh" ? [literal(0.5)] : [];
    expect(uniform({ kind: "operation", op, inputs }).op).toBe(op);
  });
  it("keeps overflowing arithmetic at runtime instead of emitting nonfinite literals", () => {
    const expression: ControlExpression = { kind: "operation", op: "multiply", inputs: [literal(1e308), literal(1e308)] };
    expect(uniform(expression).op).toBe("multiply");
    rejected(literal(Infinity), "control_value");
  });
  it("shares a connected property across expression references", () => {
    const input = expressionFixture(); const descriptors = new Map(input.descriptors);
    const solid = descriptors.get("solid");
    if (solid?.kind !== "shader") { throw new Error("Missing solid fixture"); }
    descriptors.set("solid", { ...solid, uniforms: [{ field: "color", expression: {
      kind: "operation", op: "add", inputs: [
        { kind: "property", property: "red", default: [0, 0, 0, 1] },
        { kind: "property", property: "red", default: 0 }
      ]
    } }] });
    const plan = success({ ...input, descriptors });
    const state = plan.control.stateful.find((op) => op.node === "damp");
    const add = plan.control.ops.find((op) => op.op === "add");
    expect(state).toBeDefined(); expect(add).toBeDefined();
    expect(add?.in).toEqual([state?.out, state?.out]);
  });
  it("rejects duplicate uniform fields and overlapping texture/property ports", () => {
    const input = expressionInput(literal(1)); const descriptors = new Map(input.descriptors);
    const invert = descriptors.get("invert");
    if (invert?.kind !== "shader") { throw new Error("Missing invert fixture"); }
    descriptors.set("invert", { ...invert, uniforms: [...invert.uniforms, ...invert.uniforms] });
    expect(compileRealtimeGraph({ ...input, descriptors })).toMatchObject({ status: "error", diagnostics: [{ node: "invert", reason: "descriptor" }] });
    rejected({ kind: "property", property: "source", default: 1 }, "descriptor");
  });
  it("rejects wrong arity, incompatible widths, expression cycles and oversized trees", () => {
    rejected({ kind: "operation", op: "add", inputs: [literal(1)] }, "control_arity");
    rejected({ kind: "operation", op: "add", inputs: [literal([1, 2]), literal([1, 2, 3])] }, "control_width");
    rejected({ kind: "operation", op: "vec2", inputs: [literal([1, 2]), literal(1)] }, "control_width");
    const inputs: ControlExpression[] = [];
    const cyclic: ControlExpression = { kind: "operation", op: "tanh", inputs }; inputs.push(cyclic);
    rejected(cyclic, "expression_cycle");
    let large: ControlExpression = literal(0);
    for (let index = 0; index < 10001; index++) { large = { kind: "operation", op: "tanh", inputs: [large] }; }
    rejected(large, "expression_limit");
  });
  it("folds a deep shared expression iteratively", () => {
    const one = literal(1); let expression = literal(0);
    for (let index = 0; index < 6000; index++) { expression = { kind: "operation", op: "add", inputs: [expression, one] }; }
    expect(uniform(expression).values).toEqual([6000]);
  });
});
