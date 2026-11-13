import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { compileRealtimeGraph, PLAN_SCHEMA } from "../src/index.js";
import type { CompileInput, LiveDescriptor } from "../src/index.js";
import { fixture, texture } from "./fixtures/RenderGraph.js";

const validate = new Ajv2020({ strict: true }).compile(PLAN_SCHEMA);
function success(input = fixture()) {
  const result = compileRealtimeGraph(input);
  if (result.status !== "ok") { throw new Error(JSON.stringify(result.diagnostics)); }
  expect(validate(result.plan), JSON.stringify(validate.errors)).toBe(true);
  return result;
}
function rejected(input: CompileInput, reason: string, node?: string) {
  const result = compileRealtimeGraph(input);
  expect(result.status).toBe("error");
  if (result.status === "error") {
    expect(result.diagnostics[0].reason).toBe(reason);
    if (node) { expect(result.diagnostics[0].node).toBe(node); }
  }
}
describe("render/control compiler", () => {
  it("consumes the canonical schema and rejects invalid schema output", () => {
    expect(PLAN_SCHEMA).toEqual(JSON.parse(readFileSync(new URL("../../../native/realtime/schema/plan-v1.schema.json", import.meta.url), "utf8")));
    expect(validate({ ...success().plan, schemaVersion: 999 })).toBe(false);
  });
  it("compiles the stored render snapshot without mutating its graph", async () => {
    const input = fixture(); const before = JSON.stringify(input.graph);
    const result = success(input);
    await expect(JSON.stringify(result.plan, null, 2) + "\n").toMatchFileSnapshot("fixtures/render-plan.json");
    expect(result.boundaries).toEqual([]); expect(result.warnings).toEqual([]);
    expect(result.plan.render.passes.map((pass) => pass.node)).toEqual(["solid", "invert"]);
    expect(result.plan.control.stateful.map((op) => [op.node, op.op, op.stateVersion])).toEqual([["damp", "damp", 1]]);
    expect(JSON.stringify(input.graph)).toBe(before);
  });
  it("is invariant to node/edge ordering and preserves state identity across property edits", () => {
    const input = fixture(); const first = success(input);
    const shuffled = { ...input, graph: { nodes: [...input.graph.nodes].reverse(), edges: [...input.graph.edges].reverse() } };
    expect(success(shuffled).plan).toEqual(first.plan);
    const changed = { ...input, revision: 2, graph: { ...input.graph, nodes: input.graph.nodes.map((node) => node.id === "damp" ? { ...node, properties: { target: 0.5 } } : node) } };
    expect(success(changed).plan.control.stateful).toEqual(first.plan.control.stateful);
    expect(success(changed).plan.control.ops).not.toEqual(first.plan.control.ops);
  });
  it("cuts an opaque batch texture into a stable explicitly typed slot", () => {
    const input = fixture(); const source = "0123456789abcdef0123456789abcdef";
    const graph = { nodes: [{ id: source, type: "model" }, { id: "invert", type: "invert" }, { id: "out", type: "out" }], edges: [
      { source, sourceHandle: "image", target: "invert", targetHandle: "source" },
      { source: "invert", sourceHandle: "image", target: "out", targetHandle: "image" }
    ] };
    const batch = { ...input, graph, batchTextures: [{ node: source, output: "image", texture }] };
    const result = success(batch);
    expect(result.boundaries).toEqual([{ node: source, output: "image", slot: `@slot:${source}:image`, reason: "no_live_descriptor" }]);
    expect(success({ ...batch, revision: 2 }).plan.slots).toEqual(result.plan.slots);
    rejected({ ...batch, batchTextures: [] }, "boundary_contract", source);
    rejected({ ...batch, batchTextures: [{ node: source, output: "image", texture: { ...texture, size: { kind: "input", input: "source", scale: 1 } } }] }, "boundary_contract", source);
    rejected({ ...batch, batchTextures: [{ node: source, output: "image", texture: { ...texture, alpha: "straight" } }] }, "alpha_conversion_required", "invert");
    const warning = success({ ...batch, batchTextures: [{ node: source, output: "image", texture: { ...texture, colorSpace: "linear" } }] });
    expect(warning.warnings).toEqual([{ node: "invert", reason: "color_space", detail: "source" }]);
  });
  it("rejects missing roots, duplicate nodes, dangling/multiple edges and bad ports", () => {
    const input = fixture();
    rejected({ ...input, outputs: [] }, "outputs");
    rejected({ ...input, graph: { ...input.graph, nodes: [...input.graph.nodes, input.graph.nodes[0]] } }, "duplicate_node", "damp");
    rejected({ ...input, graph: { ...input.graph, edges: [...input.graph.edges, { source: "missing", sourceHandle: "x", target: "solid", targetHandle: "x" }] } }, "missing_node", "solid");
    rejected({ ...input, graph: { ...input.graph, edges: [...input.graph.edges, input.graph.edges[0]] } }, "multiple_inputs", "color");
    rejected({ ...input, graph: { ...input.graph, edges: input.graph.edges.map((edge) => edge.target === "solid" ? { ...edge, targetHandle: "unknown" } : edge) } }, "port", "solid");
  });
  it("rejects wrong kinds, cycles, invalid values and unsupported state placement", () => {
    const input = fixture();
    rejected({ ...input, graph: { ...input.graph, edges: input.graph.edges.map((edge) => edge.target === "invert" ? { ...edge, source: "damp", sourceHandle: "value" } : edge) } }, "kind", "invert");
    rejected({ ...input, graph: { ...input.graph, edges: [...input.graph.edges, { source: "color", sourceHandle: "value", target: "damp", targetHandle: "target" }] } }, "cycle");
    rejected({ ...input, graph: { ...input.graph, nodes: input.graph.nodes.map((node) => node.id === "damp" ? { ...node, properties: { tau: NaN } } : node) } }, "control_value", "damp");
    const descriptors = new Map(input.descriptors); descriptors.set("damp", { kind: "control", op: "damp", output: "value", stateVersion: 0, inputs: [{ property: "x", default: 1 }, { property: "y", default: 1 }] });
    rejected({ ...input, descriptors }, "range", "damp");
  });
  it("walks and orders a large live chain without recursion or repeated scans", () => {
    const input = fixture(); const nodes = [{ id: "source", type: "solid" }]; const edges = [];
    for (let index = 0; index < 12000; index++) {
      const id = `p${String(index).padStart(5, "0")}`;
      nodes.push({ id, type: "invert" });
      edges.push({ source: index === 0 ? "source" : `p${String(index - 1).padStart(5, "0")}`, sourceHandle: "image", target: id, targetHandle: "source" });
    }
    nodes.push({ id: "out", type: "out" }); edges.push({ source: "p11999", sourceHandle: "image", target: "out", targetHandle: "image" });
    expect(success({ ...input, graph: { nodes, edges } }).plan.render.passes).toHaveLength(12001);
  }, 15000);
  it("copies descriptor contracts rather than retaining mutable host objects", () => {
    const input = fixture(); const mutable = { ...texture, size: { kind: "session" as const } };
    const descriptors = new Map<string, LiveDescriptor>(input.descriptors);
    const solid = descriptors.get("solid");
    if (solid?.kind !== "shader") { throw new Error("Missing solid fixture"); }
    descriptors.set("solid", { ...solid, texture: mutable });
    const result = success({ ...input, descriptors }); mutable.colorSpace = "linear";
    expect(result.plan.render.passes[0].output.colorSpace).toBe("srgb");
  });
  it("preserves texture input names that match object prototype properties", () => {
    const input = fixture(); const descriptors = new Map(input.descriptors);
    const invert = descriptors.get("invert");
    if (invert?.kind !== "shader") { throw new Error("Missing invert fixture"); }
    descriptors.set("invert", { ...invert, textureInputs: Object.fromEntries([["__proto__", { alpha: "premultiplied", colorSpace: "srgb" }]]) });
    const graph = { ...input.graph, edges: input.graph.edges.map((edge) => edge.target === "invert" ? { ...edge, targetHandle: "__proto__" } : edge) };
    expect(success({ ...input, descriptors, graph }).plan.render.passes[1].inputs)
      .toEqual(Object.fromEntries([["__proto__", "solid"]]));
  });
});
