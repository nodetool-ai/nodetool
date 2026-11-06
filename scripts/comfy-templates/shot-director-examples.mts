#!/usr/bin/env -S npx tsx
// Writes each "Shot Director" example as a native Comfy workflow from the graph
// its Storyboard clip model pins. Run after changing a pinned graph:
//   NODE_OPTIONS=--conditions=nodetool-dev npx tsx scripts/comfy-templates/shot-director-examples.mts
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COMFY_RUN_MODE, comfyPromptToGraph } from "@nodetool-ai/protocol";
import {
  COMFY_LTX23_I2V_MODEL_ID,
  COMFY_WAN22_I2V_A14B_MODEL_ID,
  COMFY_WAN22_TI2V_MODEL_ID,
  comfyWorkflowModel
} from "../../packages/runtime/src/providers/comfy-workflow-models.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const examplesDir = join(root, "packages/base-nodes/nodetool/examples/nodetool-base");
const sockets: Record<string, string[]> = JSON.parse(
  await readFile(join(root, "packages/runtime/tests/fixtures/comfy-templates/shot-director-sockets.json"), "utf8")
);
const movesPath = join(root, "scripts/comfy-challenge/camera-moves.json");
const moves: Record<string, Record<string, { prompt: string }>> = JSON.parse(await readFile(movesPath, "utf8"));

const EXAMPLES = [
  { name: "Shot Director", modelId: COMFY_WAN22_TI2V_MODEL_ID, label: "Wan 2.2 TI2V 5B" },
  { name: "Shot Director (Wan 2.2 14B)", modelId: COMFY_WAN22_I2V_A14B_MODEL_ID, label: "Wan 2.2 I2V A14B with 4-step lightx2v" },
  { name: "Shot Director (LTX-2.3)", modelId: COMFY_LTX23_I2V_MODEL_ID, label: "LTX-2.3 with audio" }
];

for (const { name, modelId, label } of EXAMPLES) {
  const model = comfyWorkflowModel(modelId);
  if (!model) throw new Error(`Unknown model ${modelId}`);
  const graph = comfyPromptToGraph(model.graph, (cls) => {
    const names = sockets[cls];
    if (!names) throw new Error(`${name}: no output sockets for ${cls}`);
    return names;
  });
  const path = join(examplesDir, `${name}.json`);
  const previous = JSON.parse(await readFile(path, "utf8"));
  const description = `Direct a cinematic take from one still as a native ComfyUI graph on Comfy Cloud (${label}, open weights). The same graph runs behind the Storyboard clip model "${model.name}".`;
  const moveList = Object.entries(moves[name]).map(([move, preset]) => `- **${move}:** ${preset.prompt}`).join("\n");
  graph.nodes.unshift({
    id: "intro",
    type: "nodetool.workflows.base_node.Comment",
    data: {
      comment: `# ${name}\n\n${description}\n\n**How it works:** Run submits this graph to Comfy Cloud and saves the take. Set the still on the Load Image node and describe the shot in the prompt.\n\n**Camera moves:** Add one of these clauses to the end of the prompt.\n\n${moveList}`
    },
    ui_properties: { position: { x: 0, y: -640 }, width: 600 }
  } as (typeof graph.nodes)[number]);
  const { input_schema: _input, output_schema: _output, ...kept } = previous;
  await writeFile(path, `${JSON.stringify({ ...kept, description, run_mode: COMFY_RUN_MODE, graph }, null, 2)}\n`);
}
