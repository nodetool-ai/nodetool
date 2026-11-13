import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { compileRealtimeGraph, PLAN_SCHEMA } from "../src/index.js";
import type { BatchPcm, CompileInput } from "../src/index.js";
import { pcmFixture, PCM_SOURCE_ID } from "./fixtures/PcmGraph.js";
import { audioControlFixture } from "./fixtures/AudioGraph.js";

const validate = new Ajv2020({ strict: true }).compile(PLAN_SCHEMA);
function success(input = pcmFixture()) {
  const result = compileRealtimeGraph(input);
  if (result.status !== "ok") { throw new Error(JSON.stringify(result.diagnostics)); }
  expect(validate(result.plan), JSON.stringify(validate.errors)).toBe(true);
  return result;
}
function contract(input: CompileInput, patch: Partial<BatchPcm>): CompileInput {
  const original = input.batchPcm?.[0]; if (!original) { throw new Error("Missing PCM contract"); }
  return { ...input, batchPcm: [{ ...original, ...patch }] };
}
function rejected(input: CompileInput, reason: string, node?: string) {
  expect(compileRealtimeGraph(input)).toMatchObject({ status: "error", diagnostics: [{ reason, ...(node ? { node } : {}) }] });
}
describe("prepared PCM and multiple audio sinks", () => {
  it("stores a sample-player plan with full graph identities and a stable buffer boundary", async () => {
    const input = pcmFixture(); const result = success(input);
    await expect(JSON.stringify(result.plan, null, 2) + "\n").toMatchFileSnapshot("fixtures/pcm-plan.json");
    expect(result.boundaries).toEqual([{ node: PCM_SOURCE_ID, output: "audio", slot: `@slot:${PCM_SOURCE_ID}:audio`, reason: "no_live_descriptor" }]);
    expect(result.plan.slots).toEqual([{ id: result.boundaries[0].slot, kind: "buffer", source: JSON.stringify([PCM_SOURCE_ID, "audio"]), channels: "stereo" }]);
    expect(result.plan.audio.nodes[0]).toMatchObject({ node: "player", kernel: "sample-player", bufferSlot: result.boundaries[0].slot, in: [] });
    expect(success({ ...input, revision: 2 }).plan.slots).toEqual(result.plan.slots);
    expect(success({ ...input, graph: { nodes: [...input.graph.nodes].reverse(), edges: [...input.graph.edges].reverse() } })).toEqual(result);
  });
  it("pins every sink producer through the quantum and sorts output identities", async () => {
    const input = pcmFixture(true); const result = success(input);
    await expect(JSON.stringify(result.plan, null, 2) + "\n").toMatchFileSnapshot("fixtures/pcm-multisink-plan.json");
    expect(result.plan.audio.sinks.map((sink) => [sink.node, sink.kind])).toEqual([["out-a", "device"], ["out-b", "record"], ["out-source", "tap"]]);
    expect(result.plan.audio.nodes.filter((node) => node.kernel === "sample-player")).toHaveLength(1);
    const buffers = result.plan.audio.sinks.map((sink) => sink.buffer);
    expect(new Set(buffers).size).toBe(3); expect(result.plan.audio.buffers).toHaveLength(3);
    expect(success({ ...input, outputs: [...input.outputs].reverse(), graph: { nodes: [...input.graph.nodes].reverse(), edges: [...input.graph.edges].reverse() } })).toEqual(result);
  });
  it("shares one prepared slot between independent sample players", () => {
    const input = pcmFixture(true);
    const graph = { nodes: [...input.graph.nodes, { id: "second", type: "player" }], edges: [
      ...input.graph.edges.map((edge) => edge.target === "gain-b" ? { ...edge, source: "second" } : edge),
      { source: PCM_SOURCE_ID, sourceHandle: "audio", target: "second", targetHandle: "clip" }
    ] };
    const result = success({ ...input, graph });
    const players = result.plan.audio.nodes.filter((node) => node.kernel === "sample-player");
    expect(players).toHaveLength(2); expect(players[0].bufferSlot).toBe(players[1].bufferSlot);
    expect(result.plan.slots).toHaveLength(1); expect(result.boundaries).toHaveLength(1);
    expect(result.stateKeys.find((key) => key.node === "player")?.key).not.toBe(result.stateKeys.find((key) => key.node === "second")?.key);
  });
  it("changes sample state identity for prepared content/length but preserves it for gain edits", () => {
    const input = pcmFixture(); const first = success(input);
    const changed = success(contract(input, { contentHash: "a".repeat(64) }));
    expect(changed.stateKeys.find((key) => key.node === "player")).not.toEqual(first.stateKeys.find((key) => key.node === "player"));
    expect(changed.plan.audio.sinks[0].subgraphHash).not.toBe(first.plan.audio.sinks[0].subgraphHash);
    expect(success(contract(input, { frames: 194 })).stateKeys).not.toEqual(first.stateKeys);
    const graph = { ...input.graph, nodes: input.graph.nodes.map((node) => node.id === "player" ? { ...node, properties: { gain: 0.25 } } : node) };
    const gain = success({ ...input, graph, allocation: first.allocation });
    expect(gain.stateKeys).toEqual(first.stateKeys); expect(gain.allocation).toEqual(first.allocation);
  });
  it("keeps an existing sink hash when an independent branch changes physical buffers and parameter slots", () => {
    const input = pcmFixture(); const first = success(input);
    const graph = { nodes: [...input.graph.nodes, { id: "aaa-tone", type: "tone" }, { id: "out-b", type: "audio-out" }], edges: [
      ...input.graph.edges, { source: "aaa-tone", sourceHandle: "audio", target: "out-b", targetHandle: "audio" }
    ] };
    const added = { ...input, graph, outputs: ["out-b", "out-a"], allocation: first.allocation };
    const second = success(added); const original = first.plan.audio.sinks[0]; const preserved = second.plan.audio.sinks[0];
    expect(preserved.buffer).not.toBe(original.buffer); expect(preserved.subgraphHash).toBe(original.subgraphHash);
    const edited = success({ ...added, graph: { ...graph, nodes: graph.nodes.map((node) => node.id === "aaa-tone" ? { ...node, properties: { frequency: 220 } } : node) } });
    expect(edited.plan.audio.sinks[0].subgraphHash).toBe(preserved.subgraphHash);
    expect(edited.plan.audio.sinks[1].subgraphHash).not.toBe(second.plan.audio.sinks[1].subgraphHash);
  });
  it("shares an audio control producer across sink regions", () => {
    const input = audioControlFixture("damp", true);
    const graph = { nodes: [...input.graph.nodes, { id: "out-direct", type: "audio-out" }], edges: [
      ...input.graph.edges, { source: "gain", sourceHandle: "audio", target: "out-direct", targetHandle: "audio" }
    ] };
    const result = success({ ...input, graph, outputs: ["out", "out-direct"] });
    expect(result.plan.control.stateful).toHaveLength(1); expect(result.plan.audio.sinks).toHaveLength(2);
  });
  it("rejects missing, duplicate, stale and malformed PCM contracts", () => {
    const input = pcmFixture(); const metadata = input.batchPcm?.[0]; if (!metadata) { throw new Error("Missing PCM fixture"); }
    rejected({ ...input, batchPcm: [] }, "boundary_contract", PCM_SOURCE_ID);
    rejected({ ...input, batchPcm: [metadata, metadata] }, "duplicate_slot", PCM_SOURCE_ID);
    rejected(contract(input, { sampleRate: 44100 }), "sample_rate", PCM_SOURCE_ID);
    rejected(contract(input, { channels: "mono" }), "channels", PCM_SOURCE_ID);
    rejected(contract(input, { frames: 0 }), "range", PCM_SOURCE_ID);
    rejected(contract(input, { frames: 1.5 }), "range", PCM_SOURCE_ID);
    rejected(contract(input, { contentHash: "a".repeat(12) }), "boundary_contract", PCM_SOURCE_ID);
  });
  it("rejects invalid PCM source kinds, missing input, slot collisions and duplicate outputs", () => {
    const input = pcmFixture();
    rejected({ ...input, graph: { ...input.graph, nodes: input.graph.nodes.map((node) => node.id === PCM_SOURCE_ID ? { ...node, type: "tone" } : node) } }, "kind", "player");
    rejected({ ...input, graph: { ...input.graph, edges: input.graph.edges.filter((edge) => edge.target !== "player") } }, "missing_input", "player");
    rejected({ ...input, graph: { ...input.graph, nodes: [...input.graph.nodes, { id: `@slot:${PCM_SOURCE_ID}:audio`, type: "unused" }] } }, "identity_collision", PCM_SOURCE_ID);
    rejected({ ...input, outputs: ["out-a", "out-a"] }, "outputs");
    rejected({ ...input, outputs: [] }, "outputs");
    rejected({ ...input, outputs: ["out-a", "player"] }, "outputs", "player");
    const descriptors = new Map(input.descriptors);
    descriptors.set("player", { kind: "dsp", kernel: "sample-player", stateVersion: 1, inputs: [], output: "audio", params: [{ property: "gain", default: 1 }] });
    rejected({ ...input, descriptors }, "buffer_slot", "player");
  });
  it("checks every PCM edge even when another player has cached the source slot", () => {
    const input = pcmFixture(true);
    const graph = { nodes: [...input.graph.nodes, { id: "second", type: "player" }], edges: [
      ...input.graph.edges.map((edge) => edge.target === "gain-b" ? { ...edge, source: "second" } : edge),
      { source: PCM_SOURCE_ID, sourceHandle: "audio", target: "second", targetHandle: "clip", edge_type: "control" as const }
    ] };
    rejected({ ...input, graph }, "kind", "second");
  });
});
