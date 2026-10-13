import type { NodeClass, NodeRegistry } from "@nodetool-ai/node-sdk";
import { getNodeMetadata } from "@nodetool-ai/node-sdk";
import { OUTPUT_NODES } from "./nodes/output.js";
import { AUDIO_NODES } from "./nodes/audio.js";
import { REALTIME_AUDIO_NODES } from "./nodes/realtime-audio.js";
import { SYNTHESIS_NODES } from "./nodes/synthesis.js";
import { GAME_NODES as GAME_AUDIO_NODES } from "./nodes/game.js";
import { LIB_AUDIO_DSP_NODES } from "./nodes/lib-audio-dsp.js";
import { LIB_PEDALBOARD_EXTRA_NODES } from "./nodes/lib-audio-effects.js";

export * from "./nodes/audio.js";
export * from "./nodes/game.js";
export * from "./nodes/lib-audio-dsp.js";
export * from "./nodes/lib-audio-effects.js";
export * from "./nodes/output.js";
export * from "./nodes/realtime-audio.js";
export * from "./nodes/synthesis.js";

// Audio codec helpers — exposed so sibling node packages (e.g. video) can
// reuse the canonical encode/decode without duplicating the implementation.
export * from "./lib/audio-wav.js";
export * from "./lib/biquad.js";
export * from "./lib/cv.js";
export * from "./lib/synth-dsp.js";

export const ALL_AUDIO_NODES: readonly NodeClass[] = [
  ...OUTPUT_NODES,
  ...AUDIO_NODES,
  ...REALTIME_AUDIO_NODES,
  ...SYNTHESIS_NODES,
  ...GAME_AUDIO_NODES,
  ...LIB_AUDIO_DSP_NODES,
  ...LIB_PEDALBOARD_EXTRA_NODES,
];

export function registerAudioNodes(registry: NodeRegistry): void {
  for (const nodeClass of ALL_AUDIO_NODES) {
    if (nodeClass.nodeType === "nodetool.workflows.base_node.Preview") {
      registry.register(nodeClass, {
        metadata: {
          ...getNodeMetadata(nodeClass),
          title: "Preview",
          description: "Preview values inside the workflow graph",
          namespace: "nodetool.workflows.base_node",
          node_type: "nodetool.workflows.base_node.Preview",
          properties: [
            {
              name: "value",
              type: { type: "any", type_args: [] },
              default: null
            },
            { name: "name", type: { type: "str", type_args: [] }, default: "" }
          ],
          outputs: [{ name: "output", type: { type: "any", type_args: [] } }],
          inline_fields: ["value", "name"]
        }
      });
      continue;
    }
    registry.register(nodeClass);
  }
}
