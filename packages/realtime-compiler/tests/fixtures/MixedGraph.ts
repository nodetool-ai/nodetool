import type { CompileInput, LiveDescriptor } from "../../src/Types.js";
import { audioFixture } from "./AudioGraph.js";
import { fixture } from "./RenderGraph.js";

/**
 * The render fixture's damper and shader chain beside the audio fixture's tone and gain.
 * `level` is an analytic control that both domains read: the gain parameter and the invert amount.
 */
export function mixedFixture(level: "constant" | "time" | "damp" = "constant"): CompileInput {
  const render = fixture(); const audio = audioFixture();
  const descriptors = new Map<string, LiveDescriptor>([...render.descriptors, ...audio.descriptors]);
  descriptors.set("level-constant", { kind: "control", op: "constant", output: "value", value: { property: "value", default: 0.5 } });
  descriptors.set("level-time", { kind: "control", op: "time.seconds", output: "value", inputs: [] });
  descriptors.set("level-damp", { kind: "control", op: "damp", stateVersion: 1, output: "value", inputs: [
    { property: "target", default: 0.5 }, { property: "tau", default: 0.2 }
  ] });
  const nodes = [...render.graph.nodes, ...audio.graph.nodes.filter((node) => node.id !== "unused" && node.id !== "out")
    .map((node) => ({ ...node })), { id: "audio-out", type: "audio-out" }, { id: "level", type: `level-${level}` }];
  const edges = [...render.graph.edges,
    { source: "tone", sourceHandle: "audio", target: "gain", targetHandle: "source" },
    { source: "gain", sourceHandle: "audio", target: "audio-out", targetHandle: "audio" },
    { source: "level", sourceHandle: "value", target: "gain", targetHandle: "gain" },
    { source: "level", sourceHandle: "value", target: "invert", targetHandle: "amount" }
  ];
  return { ...render, descriptors, outputs: ["out", "audio-out"], graph: { nodes, edges } };
}
