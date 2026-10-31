import type { Edge } from "@nodetool-ai/protocol";
import { createCatalog } from "./catalog.js";
import { compilePresets } from "./compile.js";
import type { Preset, PresetMode } from "./schema.js";

export interface PresetWorkflowNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
  position: { x: number; y: number };
}

/** Saved-template graph shape, ready for the workflow creation API. */
export interface PresetWorkflowGraph {
  nodes: PresetWorkflowNode[];
  edges: Edge[];
}

export interface EjectOptions {
  model: { readonly provider: string; readonly id: string; readonly name?: string; readonly path?: string | null };
  mode: PresetMode;
  /** The host loads named graphs without introducing a runtime dependency. */
  resolveWorkflow?: (name: string) => PresetWorkflowGraph;
}

const GENERATORS = {
  video: "nodetool.video.TextToVideo",
  image_to_video: "nodetool.video.ImageToVideo",
  reference_to_video: "nodetool.video.ReferenceToVideo",
  image: "nodetool.image.TextToImage",
  image_edit: "nodetool.image.ImageToImage"
} as const;

/** Eject one preset into an editable graph using the shared server compiler. */
export function presetToWorkflow(preset: Preset, options: EjectOptions): PresetWorkflowGraph {
  const compiled = compilePresets([preset.id], {
    catalog: createCatalog([preset]), modelId: options.model.id,
    mode: options.mode, prompt: "{{ prompt }}"
  });
  if (preset.workflow) {
    if (!options.resolveWorkflow) {
      throw new Error(`A workflow resolver is required for ${preset.workflow}`);
    }
    return structuredClone(options.resolveWorkflow(preset.workflow));
  }
  const imageMode = options.mode === "image" || options.mode === "image_edit";
  const nodes: PresetWorkflowNode[] = [
    { id: "prompt", type: "nodetool.input.StringInput", data: { name: "prompt", value: "" }, position: { x: 80, y: 80 } },
    { id: "template", type: "nodetool.text.Template", data: { string: compiled.prompt }, position: { x: 380, y: 80 } },
    { id: "generate", type: GENERATORS[options.mode], data: {
      ...compiled.params,
      model: { ...options.model, type: imageMode ? "image_model" : "video_model", provider: options.model.provider, id: options.model.id, name: options.model.name ?? options.model.id }
    }, position: { x: 680, y: 80 } },
    { id: "output", type: "nodetool.output.Output", data: { name: "result" }, position: { x: 980, y: 80 } }
  ];
  const edges: Edge[] = [
    { id: "prompt-template", source: "prompt", sourceHandle: "output", target: "template", targetHandle: "prompt" },
    { id: "template-generate", source: "template", sourceHandle: "output", target: "generate", targetHandle: "prompt" },
    { id: "generate-output", source: "generate", sourceHandle: "output", target: "output", targetHandle: "value" }
  ];
  if (preset.inputs.includes("image") || options.mode === "image_to_video" || options.mode === "image_edit" || options.mode === "reference_to_video") {
    nodes.push({ id: "image", type: "nodetool.input.ImageInput", data: { name: "image" }, position: { x: 80, y: 320 } });
    if (options.mode !== "video" && options.mode !== "image") {
      edges.push({ id: "image-generate", source: "image", sourceHandle: "output", target: "generate", targetHandle: options.mode === "reference_to_video" ? "reference_images" : "image" });
    }
  }
  if (preset.inputs.includes("video")) {
    if (options.mode !== "reference_to_video") {
      throw new Error(`Video inputs require reference_to_video mode: ${preset.id}`);
    }
    nodes.push({ id: "video", type: "nodetool.input.VideoInput", data: { name: "video" }, position: { x: 80, y: 560 } });
    edges.push({ id: "video-generate", source: "video", sourceHandle: "output", target: "generate", targetHandle: "reference_videos" });
  }
  return { nodes, edges };
}
