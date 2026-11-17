import type { CompileInput, LiveDescriptor } from "../../src/Types.js";

export function audioFixture(): CompileInput {
  const descriptors = new Map<string, LiveDescriptor>([
    ["tone", { kind: "dsp", kernel: "oscillator", stateVersion: 1, inputs: [], output: "audio", params: [
      { property: "frequency", default: 440 }, { property: "amplitude", default: 0.25 }
    ] }],
    ["gain", { kind: "dsp", kernel: "gain", stateVersion: 1, inputs: ["source"], output: "audio", params: [{ property: "gain", default: 0.5 }] }],
    ["mix", { kind: "dsp", kernel: "mix", stateVersion: 1, inputs: ["left", "right"], output: "audio", params: [{ property: "leftGain", default: 1 }, { property: "rightGain", default: 1 }] }],
    ["delay", { kind: "dsp", kernel: "delay", stateVersion: 1, inputs: ["source"], output: "audio", delayFrames: { property: "frames", default: 128 }, params: [{ property: "feedback", default: 0 }, { property: "wet", default: 1 }] }],
    ["audio-out", { kind: "audio-output", input: "audio", sink: "device" }]
  ]);
  return { descriptors, revision: 1, outputs: ["out"], session: { sampleRate: 48000, quantum: 128, channels: "stereo", width: 4, height: 4, seed: 17 },
    graph: { nodes: [{ id: "tone", type: "tone" }, { id: "gain", type: "gain" }, { id: "out", type: "audio-out" }, { id: "unused", type: "model" }], edges: [
      { source: "tone", sourceHandle: "audio", target: "gain", targetHandle: "source" },
      { source: "gain", sourceHandle: "audio", target: "out", targetHandle: "audio" }
    ] } };
}

export function audioFanoutFixture(): CompileInput {
  const input = audioFixture();
  return { ...input, graph: { nodes: [
    { id: "tone", type: "tone" }, { id: "gain", type: "gain" }, { id: "mix", type: "mix" }, { id: "tail", type: "gain" }, { id: "out", type: "audio-out" }
  ], edges: [
    { source: "tone", sourceHandle: "audio", target: "gain", targetHandle: "source" },
    { source: "tone", sourceHandle: "audio", target: "mix", targetHandle: "left" },
    { source: "gain", sourceHandle: "audio", target: "mix", targetHandle: "right" },
    { source: "mix", sourceHandle: "audio", target: "tail", targetHandle: "source" },
    { source: "tail", sourceHandle: "audio", target: "out", targetHandle: "audio" }
  ] } };
}

export function audioControlFixture(kind: "damp" | "time" | "constant" | "width" = "damp", shared = false): CompileInput {
  const input = shared ? audioFanoutFixture() : audioFixture(); const descriptors = new Map(input.descriptors);
  descriptors.set("damp-control", { kind: "control", op: "damp", stateVersion: 1, output: "value", inputs: [
    { property: "target", default: 0.75 }, { property: "tau", default: 0.2 }
  ] });
  descriptors.set("time-control", { kind: "control", op: "time.seconds", output: "value", inputs: [] });
  descriptors.set("constant-control", { kind: "control", op: "constant", output: "value", value: { property: "value", default: 0.25 } });
  descriptors.set("width-control", { kind: "control", op: "output.width", output: "value", inputs: [] });
  descriptors.set("add-control", { kind: "control", op: "add", output: "value", inputs: [
    { property: "left", default: 0 }, { property: "right", default: 0 }
  ] });
  const graph = { nodes: [...input.graph.nodes, { id: "control", type: `${kind}-control` }], edges: [...input.graph.edges,
    { source: "control", sourceHandle: "value", target: "gain", targetHandle: "gain" },
    ...(shared ? [{ source: "control", sourceHandle: "value", target: "tail", targetHandle: "gain" }] : [])
  ] };
  return { ...input, descriptors, graph };
}
