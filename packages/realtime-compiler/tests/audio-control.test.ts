import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { compileRealtimeGraph, PLAN_SCHEMA } from "../src/index.js";
import type { CompileInput, ControlDescriptor } from "../src/index.js";
import { prepareGraph } from "../src/CompilerSupport.js";
import { createControlCompiler } from "../src/ControlCompiler.js";
import { audioControlFixture } from "./fixtures/AudioGraph.js";
import { fixture } from "./fixtures/RenderGraph.js";

const validate = new Ajv2020({ strict: true }).compile(PLAN_SCHEMA);
function success(input = audioControlFixture()) {
  const result = compileRealtimeGraph(input);
  if (result.status !== "ok") { throw new Error(JSON.stringify(result.diagnostics)); }
  expect(validate(result.plan), JSON.stringify(validate.errors)).toBe(true);
  return result;
}
function rejected(input: CompileInput, reason: string, node?: string) {
  expect(compileRealtimeGraph(input)).toMatchObject({ status: "error", diagnostics: [{ reason, ...(node ? { node } : {}) }] });
}
describe("audio control bindings", () => {
  it("stores one audio-domain damper and binds its scalar register", async () => {
    const input = audioControlFixture(); const result = success(input);
    await expect(JSON.stringify(result.plan, null, 2) + "\n").toMatchFileSnapshot("fixtures/audio-control-plan.json");
    const state = result.plan.control.stateful[0];
    expect(state).toMatchObject({ node: "control", op: "damp", domain: "audio", stateVersion: 1 });
    expect(result.plan.params.find((param) => param.node === "gain"))
      .toMatchObject({ value: 0.5, sync: "audio", audioControl: state.out });
    expect(result.plan.control.ops.every((op) => op.domain === "audio")).toBe(true);
    expect(result.stateKeys.find((key) => key.node === "control")?.kind).toBe("control");
    expect(success({ ...input, graph: { nodes: [...input.graph.nodes].reverse(), edges: [...input.graph.edges].reverse() } })).toEqual(result);
  });
  it("shares a stateful producer across parameters and preserves slots and state keys across edits", () => {
    const input = audioControlFixture("damp", true); const first = success(input);
    expect(first.plan.control.stateful).toHaveLength(1);
    const bindings = first.plan.params.filter((param) => param.audioControl !== undefined);
    expect(bindings).toHaveLength(2); expect(bindings[0].audioControl).toBe(bindings[1].audioControl);
    const edited = { ...input, allocation: first.allocation, graph: { ...input.graph,
      nodes: input.graph.nodes.map((node) => node.id === "control" ? { ...node, properties: { target: 0.5 } } : node) } };
    const second = success(edited);
    expect(second.allocation).toEqual(first.allocation); expect(second.stateKeys).toEqual(first.stateKeys);
    expect(second.plan.audio.sinks[0].subgraphHash).not.toBe(first.plan.audio.sinks[0].subgraphHash);
    const render = fixture(); const descriptors = new Map(render.descriptors);
    const damp = descriptors.get("damp"); if (damp?.kind !== "control") { throw new Error("Missing damper"); }
    const graph = { nodes: render.graph.nodes.map((node) => node.id === "damp" ? { ...node, id: "control" } : node),
      edges: render.graph.edges.map((edge) => edge.source === "damp" ? { ...edge, source: "control" } : edge) };
    const renderKey = success({ ...render, graph, descriptors }).stateKeys.find((key) => key.node === "control");
    expect(renderKey).toEqual(first.stateKeys.find((key) => key.node === "control"));
  });
  it("tracks additional control dependencies and dimension-reading sources", () => {
    const input = audioControlFixture("constant"); const first = success(input);
    const addDescriptor: ControlDescriptor = { kind: "control", op: "constant", output: "value", value: { property: "value", default: 440 } };
    const descriptors = new Map(input.descriptors); descriptors.set("extra", addDescriptor);
    const graph = { nodes: [...input.graph.nodes, { id: "aaa", type: "extra" }], edges: [...input.graph.edges,
      { source: "aaa", sourceHandle: "value", target: "tone", targetHandle: "frequency" }
    ] };
    const shifted = success({ ...input, descriptors, graph });
    expect(shifted.plan.params.find((param) => param.node === "gain")?.audioControl)
      .not.toBe(first.plan.params.find((param) => param.node === "gain")?.audioControl);
    expect(shifted.plan.audio.sinks[0].subgraphHash).not.toBe(first.plan.audio.sinks[0].subgraphHash);
    expect(success({ ...input, session: { ...input.session, width: 16 } }).plan.audio.sinks[0].subgraphHash)
      .toBe(first.plan.audio.sinks[0].subgraphHash);
    const width = audioControlFixture("width");
    expect(success({ ...width, session: { ...width.session, width: 16 } }).plan.audio.sinks[0].subgraphHash)
      .not.toBe(success(width).plan.audio.sinks[0].subgraphHash);
  });
  it("keeps a logical control hash equal under two valid register-allocation orders", () => {
    const base = audioControlFixture("constant");
    const graph = { nodes: [...base.graph.nodes.filter((node) => node.id !== "control"),
      { id: "a", type: "constant-control", properties: { value: 1 } },
      { id: "b", type: "constant-control", properties: { value: 2 } }, { id: "sum", type: "add-control" }
    ], edges: [...base.graph.edges.filter((edge) => edge.targetHandle !== "gain"),
      { source: "a", sourceHandle: "value", target: "sum", targetHandle: "left" },
      { source: "b", sourceHandle: "value", target: "sum", targetHandle: "right" },
      { source: "sum", sourceHandle: "value", target: "gain", targetHandle: "gain" }
    ] };
    const input = { ...base, graph }; const { nodes, incoming } = prepareGraph(input);
    const results = [];
    for (const order of [["a", "b", "sum"], ["b", "a", "sum"]]) {
      const compiler = createControlCompiler("audio", input, nodes, incoming);
      for (const id of order) {
        const node = nodes.get(id); const descriptor = node && input.descriptors.get(node.type);
        if (!node || descriptor?.kind !== "control") { throw new Error("Missing control fixture"); }
        compiler.lower(node, descriptor);
      }
      const sum = nodes.get("sum"), gain = nodes.get("gain");
      if (!sum || !gain) { throw new Error("Missing consumer fixture"); }
      results.push({ first: compiler.bind(sum, { property: "left", default: 0 }).index,
        hash: compiler.hash(compiler.bind(gain, { property: "gain", default: 0 }).index) });
    }
    expect(results[0].first).not.toBe(results[1].first);
    expect(results[0].hash).toBe(results[1].hash);
  });
  it("preserves full graph identities in control state metadata", () => {
    const input = audioControlFixture(); const id = "0123456789abcdef0123456789abcdef";
    const graph = { nodes: input.graph.nodes.map((node) => node.id === "control" ? { ...node, id } : node),
      edges: input.graph.edges.map((edge) => edge.source === "control" ? { ...edge, source: id } : edge) };
    expect(success({ ...input, graph }).stateKeys.map((key) => key.node)).toContain(id);
  });
  it("drops disconnected control work while keeping the parameter's reserved slot", () => {
    const input = audioControlFixture(); const first = success(input);
    const graph = { ...input.graph, edges: input.graph.edges.filter((edge) => edge.targetHandle !== "gain") };
    const second = success({ ...input, graph, allocation: first.allocation });
    expect(second.allocation).toEqual(first.allocation);
    expect(second.plan.control).toEqual({ registers: 0, ops: [], stateful: [] });
    expect(second.plan.params.find((param) => param.node === "gain")?.audioControl).toBeUndefined();
  });
  it("rejects vector controls, invalid versions, bad handles, control cycles and execution-control edges", () => {
    const input = audioControlFixture("constant");
    rejected({ ...input, graph: { ...input.graph, nodes: input.graph.nodes.map((node) => node.id === "control" ? { ...node, properties: { value: [1, 2] } } : node) } }, "control_width", "gain");
    rejected({ ...input, graph: { ...input.graph, edges: input.graph.edges.map((edge) => edge.target === "gain" && edge.targetHandle === "gain" ? { ...edge, sourceHandle: "bad" } : edge) } }, "kind", "gain");
    rejected({ ...input, graph: { ...input.graph, edges: input.graph.edges.map((edge) => edge.targetHandle === "gain" ? { ...edge, edge_type: "control" as const } : edge) } }, "unsupported", "gain");
    const damp = audioControlFixture(); const descriptors = new Map(damp.descriptors); const descriptor = descriptors.get("damp-control");
    if (descriptor?.kind !== "control") { throw new Error("Missing damper"); }
    descriptors.set("damp-control", { kind: "control", op: "damp", output: "value", inputs: [{ property: "target", default: 1 }, { property: "tau", default: 0.2 }], stateVersion: 2 });
    rejected({ ...damp, descriptors }, "state_version", "control");
    rejected({ ...damp, graph: { ...damp.graph, edges: [...damp.graph.edges,
      { source: "control", sourceHandle: "value", target: "control", targetHandle: "target" }
    ] } }, "cycle", "control");
  });
  it("rejects connected structural fields and non-control producers", () => {
    const input = audioControlFixture();
    const delay = { ...input, graph: { nodes: input.graph.nodes.map((node) => node.id === "gain" ? { ...node, type: "delay" } : node),
      edges: input.graph.edges.map((edge) => edge.targetHandle === "gain" ? { ...edge, targetHandle: "frames" } : edge) } };
    rejected(delay, "unsupported", "gain");
    rejected({ ...input, graph: { ...input.graph, nodes: input.graph.nodes.map((node) => node.id === "control" ? { ...node, type: "model" } : node) } }, "kind", "control");
  });
  it("lowers a long control chain and hashes dependencies iteratively", () => {
    const input = audioControlFixture("constant"); const nodes = [...input.graph.nodes]; const edges = input.graph.edges.filter((edge) => edge.targetHandle !== "gain");
    for (let index = 0; index < 12000; index++) {
      const id = `c${index}`; nodes.push({ id, type: "add-control" });
      edges.push({ source: index === 0 ? "control" : `c${index - 1}`, sourceHandle: "value", target: id, targetHandle: "left" });
    }
    edges.push({ source: "c11999", sourceHandle: "value", target: "gain", targetHandle: "gain" });
    const result = success({ ...input, graph: { nodes, edges } });
    expect(result.plan.control.ops.filter((op) => op.op === "add")).toHaveLength(12000);
    expect(result.plan.audio.buffers).toHaveLength(2);
  }, 15000);
});
