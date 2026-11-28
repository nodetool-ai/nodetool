import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { compileRealtimeGraph, PLAN_SCHEMA } from "../src/index.js";
import type { CompileInput } from "../src/index.js";
import { mixedFixture } from "./fixtures/MixedGraph.js";
import { texture } from "./fixtures/RenderGraph.js";

const validate = new Ajv2020({ strict: true }).compile(PLAN_SCHEMA);
function success(input = mixedFixture()) {
  const result = compileRealtimeGraph(input);
  if (result.status !== "ok") { throw new Error(JSON.stringify(result.diagnostics)); }
  expect(validate(result.plan), JSON.stringify(validate.errors)).toBe(true);
  return result;
}
function rejected(input: CompileInput, reason: string, node?: string) {
  expect(compileRealtimeGraph(input)).toMatchObject({ status: "error", diagnostics: [{ reason, ...(node ? { node } : {}) }] });
}
function only(input: CompileInput, outputs: string[]) {
  return success({ ...input, outputs });
}
function withProperty(input: CompileInput, id: string, properties: Record<string, unknown>): CompileInput {
  return { ...input, graph: { ...input.graph, nodes: input.graph.nodes.map((node) => node.id === id ? { ...node, properties } : node) } };
}

describe("mixed audio/render plans", () => {
  it("stores one plan with a render region, an audio region and an analytic control in both domains", async () => {
    const input = mixedFixture(); const result = success(input);
    await expect(JSON.stringify(result.plan, null, 2) + "\n").toMatchFileSnapshot("fixtures/mixed-plan.json");
    const level = result.plan.control.ops.filter((op) => op.node === "level");
    expect(level.map((op) => op.domain).sort()).toEqual(["audio", "render"]);
    expect(level.every((op) => op.op === "constant" && op.values[0] === 0.5)).toBe(true);
    const audioLevel = level.find((op) => op.domain === "audio");
    expect(result.plan.params.find((param) => param.node === "gain")).toMatchObject({ audioControl: audioLevel?.out, sync: "audio" });
    expect(result.plan.control.stateful).toEqual([expect.objectContaining({ node: "damp", domain: "render" })]);
    expect(result.plan.render.passes.map((pass) => pass.node)).toEqual(["solid", "invert"]);
    expect(result.plan.audio.sinks.map((sink) => sink.node)).toEqual(["audio-out"]);
    expect(result.stateKeys.map((key) => key.node).sort()).toEqual(["damp", "gain", "tone"]);
  });
  it("matches the single-domain compilations of each region", () => {
    const input = mixedFixture(); const mixed = success(input);
    const render = only(input, ["out"]); const audio = only(input, ["audio-out"]);
    expect(mixed.plan.render).toEqual(render.plan.render);
    expect(mixed.plan.audio).toEqual(audio.plan.audio);
    expect(mixed.plan.params).toEqual(audio.plan.params);
    expect(mixed.plan.control.ops.filter((op) => op.domain === "render")).toEqual(render.plan.control.ops);
    expect(mixed.plan.control.ops.filter((op) => op.domain === "audio")).toEqual(audio.plan.control.ops);
    expect(mixed.plan.control.registers).toBe(Math.max(render.plan.control.registers, audio.plan.control.registers));
  });
  it("is invariant to node, edge and output ordering", () => {
    const input = mixedFixture(); const first = success(input);
    const shuffled = { ...input, outputs: [...input.outputs].reverse(),
      graph: { nodes: [...input.graph.nodes].reverse(), edges: [...input.graph.edges].reverse() } };
    expect(success(shuffled)).toEqual(first);
  });
  it("keeps the audio region's identity when only the render region changes", () => {
    const input = mixedFixture(); const first = success(input);
    const edited = success({ ...withProperty(input, "color", { g: 1 }), allocation: first.allocation });
    expect(edited.plan.control.ops).not.toEqual(first.plan.control.ops);
    expect(edited.plan.control.ops.filter((op) => op.domain === "audio")).toEqual(first.plan.control.ops.filter((op) => op.domain === "audio"));
    expect(edited.plan.audio).toEqual(first.plan.audio);
    expect(edited.plan.params).toEqual(first.plan.params);
    expect(edited.allocation).toEqual(first.allocation); expect(edited.stateKeys).toEqual(first.stateKeys);
    const shared = success({ ...withProperty(input, "level", { value: 0.25 }), allocation: first.allocation });
    expect(shared.plan.audio.sinks[0].subgraphHash).not.toBe(first.plan.audio.sinks[0].subgraphHash);
    expect(shared.plan.control.ops.filter((op) => op.node === "level").map((op) => op.values)).toEqual([[0.25], [0.25]]);
    expect(shared.allocation).toEqual(first.allocation); expect(shared.stateKeys).toEqual(first.stateKeys);
  });
  it("places a time source in both domains", () => {
    const result = success(mixedFixture("time"));
    expect(result.plan.control.ops.filter((op) => op.node === "level").map((op) => [op.op, op.domain]).sort())
      .toEqual([["time.seconds", "audio"], ["time.seconds", "render"]]);
  });
  it("places a stateful control in the one domain that reads it", () => {
    const input = mixedFixture("damp");
    const audioOnly = { ...input, graph: { ...input.graph, edges: input.graph.edges.filter((edge) => !(edge.source === "level" && edge.target === "invert")) } };
    expect(success(audioOnly).plan.control.stateful.map((op) => [op.node, op.domain]).sort())
      .toEqual([["damp", "render"], ["level", "audio"]]);
    const renderOnly = { ...input, graph: { ...input.graph, edges: input.graph.edges.filter((edge) => !(edge.source === "level" && edge.target === "gain")) } };
    expect(success(renderOnly).plan.control.stateful.map((op) => [op.node, op.domain]).sort())
      .toEqual([["damp", "render"], ["level", "render"]]);
  });
  it("rejects a stateful control that both domains read, directly or through an analytic control", () => {
    rejected(mixedFixture("damp"), "stateful_domain", "level");
    const input = mixedFixture(); const descriptors = new Map(input.descriptors);
    descriptors.set("scale", { kind: "control", op: "multiply", output: "value", inputs: [{ property: "left", default: 1 }, { property: "right", default: 1 }] });
    const graph = { nodes: [...input.graph.nodes, { id: "scale", type: "scale" }], edges: [
      ...input.graph.edges.filter((edge) => edge.source !== "level"),
      { source: "damp", sourceHandle: "value", target: "scale", targetHandle: "left" },
      { source: "scale", sourceHandle: "value", target: "gain", targetHandle: "gain" },
      { source: "scale", sourceHandle: "value", target: "invert", targetHandle: "amount" }
    ] };
    rejected({ ...input, descriptors, graph }, "stateful_domain", "damp");
  });
  it("rejects audio signals in the render region, two render outputs and colliding boundary slots", () => {
    const input = mixedFixture();
    rejected({ ...input, graph: { ...input.graph, edges: [...input.graph.edges.filter((edge) => edge.target !== "invert" || edge.targetHandle !== "source"),
      { source: "gain", sourceHandle: "audio", target: "invert", targetHandle: "source" }] } }, "unsupported", "gain");
    rejected({ ...input, outputs: ["out", "audio-out", "out2"], graph: { ...input.graph, nodes: [...input.graph.nodes, { id: "out2", type: "out" }],
      edges: [...input.graph.edges, { source: "solid", sourceHandle: "image", target: "out2", targetHandle: "image" }] } }, "outputs");
    const descriptors = new Map(input.descriptors);
    descriptors.set("player", { kind: "dsp", kernel: "sample-player", stateVersion: 1, inputs: [], output: "audio", bufferInput: "buffer", params: [{ property: "gain", default: 1 }] });
    const graph = { nodes: [...input.graph.nodes, { id: "media", type: "model" }, { id: "player", type: "player" }, { id: "audio2", type: "audio-out" }], edges: [
      ...input.graph.edges.filter((edge) => edge.target !== "solid" && edge.target !== "invert" || edge.targetHandle === "amount"),
      { source: "media", sourceHandle: "value", target: "invert", targetHandle: "source" },
      { source: "media", sourceHandle: "value", target: "player", targetHandle: "buffer" },
      { source: "player", sourceHandle: "audio", target: "audio2", targetHandle: "audio" }
    ] };
    rejected({ ...input, descriptors, graph, outputs: ["out", "audio-out", "audio2"],
      batchTextures: [{ node: "media", output: "value", texture }],
      batchPcm: [{ node: "media", output: "value", sampleRate: 48000, channels: "stereo", frames: 128, contentHash: "0".repeat(64) }] }, "identity_collision", "media");
  });
});
