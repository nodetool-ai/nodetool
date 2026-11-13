import { createHash } from "node:crypto";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { compileRealtimeGraph, PLAN_SCHEMA } from "../src/index.js";
import type { CompileInput } from "../src/index.js";
import { audioFixture } from "./fixtures/AudioGraph.js";
import { fixture } from "./fixtures/RenderGraph.js";

const validate = new Ajv2020({ strict: true }).compile(PLAN_SCHEMA);
function success(input = audioFixture()) {
  const result = compileRealtimeGraph(input);
  if (result.status !== "ok") { throw new Error(JSON.stringify(result.diagnostics)); }
  expect(validate(result.plan), JSON.stringify(validate.errors)).toBe(true);
  return result;
}
function rejected(input: CompileInput, reason: string, node?: string) {
  const result = compileRealtimeGraph(input);
  expect(result).toMatchObject({ status: "error", diagnostics: [{ reason, ...(node ? { node } : {}) }] });
}
function withProperty(input: CompileInput, id: string, properties: Record<string, number>): CompileInput {
  return { ...input, graph: { ...input.graph, nodes: input.graph.nodes.map((node) => node.id === id ? { ...node, properties } : node) } };
}

describe("audio-only compiler", () => {
  it("lowers a stored audio plan and returns state keys and reserved parameter identities", async () => {
    const input = audioFixture(); const before = JSON.stringify(input.graph); const result = success(input);
    await expect(JSON.stringify(result.plan, null, 2) + "\n").toMatchFileSnapshot("fixtures/audio-plan.json");
    expect(result.plan.audio.nodes.map((node) => node.node)).toEqual(["tone", "gain"]);
    expect(result.plan.params.every((param) => param.sync === "audio")).toBe(true);
    expect(result.allocation.entries).toHaveLength(3);
    expect(result.stateKeys.find((entry) => entry.node === "tone")?.key).toBe(createHash("sha256")
      .update(JSON.stringify(["audio", "tone", "oscillator", 1, [null], 48000, 128, "stereo"])).digest("hex"));
    expect(JSON.stringify(input.graph)).toBe(before);
    expect(success({ ...input, graph: { nodes: [...input.graph.nodes].reverse(), edges: [...input.graph.edges].reverse() } })).toEqual(result);
  });
  it("preserves slots across topology/property edits, removal and reintroduction", () => {
    const input = audioFixture(); const first = success(input);
    const changed = success({ ...withProperty(input, "tone", { frequency: 220 }), allocation: first.allocation, revision: 2 });
    expect(changed.allocation).toEqual(first.allocation); expect(changed.stateKeys).toEqual(first.stateKeys);
    expect(changed.plan.audio.sinks[0].subgraphHash).not.toBe(first.plan.audio.sinks[0].subgraphHash);
    const removedGraph = { nodes: input.graph.nodes.filter((node) => node.id !== "gain"), edges: [
      { source: "tone", sourceHandle: "audio", target: "out", targetHandle: "audio" }
    ] };
    const removed = success({ ...input, graph: removedGraph, allocation: first.allocation });
    expect(removed.allocation).toEqual(first.allocation);
    expect(removed.plan.params).toHaveLength(2);
    expect(success({ ...input, allocation: removed.allocation }).allocation).toEqual(first.allocation);
    const insertedGraph = { nodes: [...input.graph.nodes, { id: "aaa", type: "gain" }], edges: [
      ...input.graph.edges.filter((edge) => edge.target !== "gain"),
      { source: "tone", sourceHandle: "audio", target: "aaa", targetHandle: "source" },
      { source: "aaa", sourceHandle: "audio", target: "gain", targetHandle: "source" }
    ] };
    const inserted = success({ ...input, graph: insertedGraph, allocation: first.allocation });
    expect(inserted.allocation.entries.slice(0, 3)).toEqual(first.allocation.entries);
    expect(inserted.allocation.nextSlot).toBe(4);
    expect(first.allocation.entries).toHaveLength(3);
  });
  it("keeps the logical path hash independent of sparse slot IDs and display dimensions", () => {
    const input = audioFixture(); const first = success(input);
    const allocation = { entries: first.allocation.entries.map((entry) => ({ ...entry, slot: entry.slot + 100 })), nextSlot: 103 };
    const shifted = success({ ...input, allocation, session: { ...input.session, width: 100, height: 90 }, revision: 9 });
    expect(shifted.plan.audio.sinks[0].subgraphHash).toBe(first.plan.audio.sinks[0].subgraphHash);
    expect(shifted.stateKeys).toEqual(first.stateKeys);
    expect(success({ ...input, session: { ...input.session, seed: 18 } }).plan.audio.sinks[0].subgraphHash).not.toBe(first.plan.audio.sinks[0].subgraphHash);
    expect(success({ ...input, session: { ...input.session, sampleRate: 44100 } }).stateKeys).not.toEqual(first.stateKeys);
    expect(success({ ...input, session: { ...input.session, channels: "mono" } }).stateKeys).not.toEqual(first.stateKeys);
  });
  it("does not overwrite a fan-out input at its last consumer and reuses dead buffers afterward", () => {
    const input = audioFixture(); const graph = { nodes: [
      { id: "tone", type: "tone" }, { id: "gain", type: "gain" }, { id: "mix", type: "mix" }, { id: "tail", type: "gain" }, { id: "out", type: "audio-out" }
    ], edges: [
      { source: "tone", sourceHandle: "audio", target: "gain", targetHandle: "source" },
      { source: "tone", sourceHandle: "audio", target: "mix", targetHandle: "left" },
      { source: "gain", sourceHandle: "audio", target: "mix", targetHandle: "right" },
      { source: "mix", sourceHandle: "audio", target: "tail", targetHandle: "source" },
      { source: "tail", sourceHandle: "audio", target: "out", targetHandle: "audio" }
    ] };
    const plan = success({ ...input, graph }).plan;
    const buffers = plan.audio.nodes.map((node) => node.out[0]);
    expect(new Set(buffers.slice(0, 3)).size).toBe(3);
    expect(buffers.slice(0, 2)).toContain(buffers[3]);
    expect(plan.audio.buffers).toHaveLength(3);
  });
  it("changes delay state keys only for structural/session changes and encodes smoothing", () => {
    const input = audioFixture(); const descriptors = new Map(input.descriptors);
    const delay = descriptors.get("delay"); if (delay?.kind !== "dsp") { throw new Error("Missing delay"); }
    descriptors.set("delay", { ...delay, params: [{ property: "feedback", default: 0, smoothing: { kind: "ramp" } },
      { property: "wet", default: 1, smoothing: { kind: "onePole", timeConstant: 0.2 } }] });
    const graph = { ...input.graph, nodes: input.graph.nodes.map((node) => node.id === "gain" ? { id: "gain", type: "delay" } : node) };
    const configured = { ...input, graph, descriptors }; const first = success(configured);
    expect(first.plan.audio.nodes[1].delayFrames).toBe(128);
    expect(first.plan.params.find((param) => param.field === "wet")).toMatchObject({ smooth: "onePole", timeConstant: 0.2 });
    expect(success(withProperty(configured, "gain", { wet: 0.5 })).stateKeys).toEqual(first.stateKeys);
    expect(success(withProperty(configured, "gain", { frames: 256 })).stateKeys).not.toEqual(first.stateKeys);
    rejected(withProperty(configured, "gain", { frames: 0 }), "range", "gain");
  });
  it("computes render-only control state keys independently of output dimensions and lane values", () => {
    const input = fixture(); const first = success(input);
    expect(first.stateKeys).toHaveLength(1);
    expect(success(withProperty(input, "damp", { target: 0.25 })).stateKeys).toEqual(first.stateKeys);
    expect(success({ ...input, session: { ...input.session, width: 90 } }).stateKeys).toEqual(first.stateKeys);
    expect(success({ ...input, session: { ...input.session, sampleRate: 44100 } }).stateKeys).not.toEqual(first.stateKeys);
  });
  it("rejects cycles, wrong output handles, layout mismatches and connected controls", () => {
    const input = audioFixture();
    rejected({ ...input, graph: { ...input.graph, edges: input.graph.edges.map((edge) => edge.target === "gain" ? { ...edge, source: "gain" } : edge) } }, "cycle");
    rejected({ ...input, graph: { ...input.graph, edges: input.graph.edges.map((edge) => edge.target === "gain" ? { ...edge, sourceHandle: "missing" } : edge) } }, "port", "gain");
    const descriptors = new Map(input.descriptors); const gain = descriptors.get("gain");
    if (gain?.kind !== "dsp") { throw new Error("Missing gain"); }
    descriptors.set("gain", { ...gain, channels: "mono" }); rejected({ ...input, descriptors }, "channels", "gain");
    rejected({ ...input, graph: { ...input.graph, edges: [...input.graph.edges, { source: "tone", sourceHandle: "audio", target: "gain", targetHandle: "gain" }] } }, "unsupported", "gain");
    rejected(withProperty(input, "gain", { gain: 1e39 }), "parameter", "gain");
    rejected(withProperty(input, "gain", { gain: NaN }), "control_value", "gain");
  });
  it("rejects corrupt allocation ledgers and slot exhaustion before returning a candidate", () => {
    const input = audioFixture(); const entry = { node: "gain", field: "gain", slot: 0 };
    rejected({ ...input, allocation: { entries: [entry, entry], nextSlot: 1 } }, "parameter_allocation");
    rejected({ ...input, allocation: { entries: [entry], nextSlot: 0 } }, "parameter_allocation");
    rejected({ ...input, allocation: { entries: [], nextSlot: 4294967296 } }, "limit");
  });
  it("rejects malformed DSP contracts, smoothing and unsupported graph boundaries", () => {
    const input = audioFixture(); const gain = input.descriptors.get("gain");
    if (gain?.kind !== "dsp") { throw new Error("Missing gain"); }
    for (const [descriptor, reason] of [
      [{ ...gain, params: [] }, "descriptor"], [{ ...gain, stateVersion: 2 }, "state_version"],
      [{ ...gain, kernel: "delay" as const, params: [{ property: "feedback", default: 0 }, { property: "wet", default: 1 }] }, "delay"],
      [{ ...gain, params: [{ property: "gain", default: 1, smoothing: { kind: "onePole" as const, timeConstant: 0 } }] }, "parameter"]
    ] as const) {
      const descriptors = new Map(input.descriptors); descriptors.set("gain", descriptor);
      rejected({ ...input, descriptors }, reason, "gain");
    }
    rejected({ ...input, graph: { ...input.graph, nodes: input.graph.nodes.map((node) => node.id === "tone" ? { ...node, type: "model" } : node) } }, "unsupported", "tone");
    rejected({ ...input, graph: { ...input.graph, edges: input.graph.edges.map((edge) => ({ ...edge, edge_type: "control" as const })) } }, "unsupported");
  });
  it("lowers a large chain with bounded live buffers and iterative hashes", () => {
    const input = audioFixture(); const nodes = [{ id: "tone", type: "tone" }]; const edges = [];
    for (let index = 0; index < 12000; index++) {
      const id = `g${index}`; nodes.push({ id, type: "gain" });
      edges.push({ source: index === 0 ? "tone" : `g${index - 1}`, sourceHandle: "audio", target: id, targetHandle: "source" });
    }
    nodes.push({ id: "out", type: "audio-out" }); edges.push({ source: "g11999", sourceHandle: "audio", target: "out", targetHandle: "audio" });
    const result = success({ ...input, graph: { nodes, edges } });
    expect(result.plan.audio.nodes).toHaveLength(12001); expect(result.plan.audio.buffers).toHaveLength(2);
  }, 15000);
});
