import type { GraphData } from "@nodetool-ai/protocol";
import type { CompileInput, LiveDescriptor, TextureContract } from "../../src/Types.js";

export const texture: TextureContract = { format: "rgba8unorm", colorSpace: "srgb", alpha: "premultiplied", size: { kind: "session" } };
export function fixture(): CompileInput {
  const descriptors = new Map<string, LiveDescriptor>([
    ["constant", { kind: "control", op: "constant", output: "value", value: { property: "value", default: 1 } }],
    ["damp", { kind: "control", op: "damp", output: "value", stateVersion: 1, inputs: [{ property: "target", default: 0.75 }, { property: "tau", default: 0.2 }] }],
    ["color", { kind: "control", op: "vec4", output: "value", inputs: [{ property: "r", default: 0 }, { property: "g", default: 0 }, { property: "b", default: 0 }, { property: "a", default: 1 }] }],
    ["solid", { kind: "shader", module: "sources.solid@1", output: "image", textureInputs: {}, uniforms: [{ property: "color", default: [1, 0, 0, 1] }], texture, retention: "retained" }],
    ["invert", { kind: "shader", module: "color.invert@1", output: "image", textureInputs: { source: { alpha: "premultiplied", colorSpace: "srgb" } }, uniforms: [{ property: "amount", default: 1 }], texture, retention: "retained" }],
    ["out", { kind: "render-output", input: "image", colorSpace: "srgb" }]
  ]);
  const graph: GraphData = {
    nodes: [
      { id: "damp", type: "damp" }, { id: "color", type: "color" }, { id: "solid", type: "solid" },
      { id: "invert", type: "invert" }, { id: "out", type: "out" }, { id: "unused", type: "model" }
    ],
    edges: [
      { source: "damp", sourceHandle: "value", target: "color", targetHandle: "r" },
      { source: "color", sourceHandle: "value", target: "solid", targetHandle: "color" },
      { source: "solid", sourceHandle: "image", target: "invert", targetHandle: "source" },
      { source: "invert", sourceHandle: "image", target: "out", targetHandle: "image" }
    ]
  };
  return { graph, descriptors, outputs: ["out"], revision: 1, session: { sampleRate: 48000, quantum: 128, channels: "stereo", width: 4, height: 4, seed: 17 } };
}
