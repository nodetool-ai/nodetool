import type { Edge, RenderInputs } from "@nodetool-ai/protocol";
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
  image_edit: "nodetool.image.ImageToImage",
  video_edit: "nodetool.video.VideoToVideo"
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
  if (preset.inputs.includes("video") || options.mode === "video_edit") {
    if (options.mode !== "reference_to_video" && options.mode !== "video_edit") {
      throw new Error(`Video inputs require reference_to_video or video_edit mode: ${preset.id}`);
    }
    nodes.push({ id: "video", type: "nodetool.input.VideoInput", data: { name: "video" }, position: { x: 80, y: 560 } });
    edges.push({ id: "video-generate", source: "video", sourceHandle: "output", target: "generate", targetHandle: options.mode === "video_edit" ? "video" : "reference_videos" });
  }
  return { nodes, edges };
}

/** Build from submission-time inputs, without recompiling a mutable catalogue. */
export function renderedWorkflow(
  options: EjectOptions,
  prompt: string,
  params: Record<string, unknown> = {}
): PresetWorkflowGraph {
  const preset: Preset = {
    id: "look.render",
    version: 1,
    kind: "look",
    name: "Render",
    description: "Recorded render",
    tags: [],
    modes: [options.mode],
    inputs: [],
    stackable: true,
    conflicts: [],
    aliases: [],
    prompt: { default: "" },
    params: {}
  };
  const graph = presetToWorkflow(preset, options);
  const input = graph.nodes.find((node) => node.id === "prompt");
  if (input) input.data.value = prompt;
  const template = graph.nodes.find((node) => node.id === "template");
  if (template) template.data.string = "{{ prompt }}";
  const generator = graph.nodes.find((node) => node.id === "generate");
  if (generator) generator.data = { ...generator.data, ...params };
  graph.nodes = graph.nodes.filter(
    (node) => node.id !== "image" && node.id !== "video"
  );
  graph.edges = graph.edges.filter(
    (edge) => edge.source !== "image" && edge.source !== "video"
  );
  return graph;
}

/** Legacy hashes cannot recover the wording or the inputs a provider received. */
export function storyboardRenderToWorkflow(
  record: RenderInputs | undefined
): PresetWorkflowGraph {
  if (!record?.generation) {
    throw new Error(
      "The exact inputs for this older render were not recorded. Render a new take to open it as a workflow."
    );
  }
  const { mode, provider, prompt, params } = record.generation;
  return renderedWorkflow(
    { model: { provider, id: record.model }, mode },
    prompt,
    params
  );
}

export interface LipsyncWorkflowInputs {
  text: string;
  sourceAssetId: string;
  speech: { provider: string; model: string; voice: string; speed?: number };
  video: { provider: string; model: string };
}

/** The same speech-first route as the Lipsync studio, with editable inputs. */
export function lipsyncToWorkflow(
  input: LipsyncWorkflowInputs
): PresetWorkflowGraph {
  return {
    nodes: [
      {
        id: "text",
        type: "nodetool.input.StringInput",
        data: { name: "text", value: input.text },
        position: { x: 80, y: 80 }
      },
      {
        id: "image",
        type: "nodetool.input.ImageInput",
        data: {
          name: "image",
          value: { type: "image", asset_id: input.sourceAssetId }
        },
        position: { x: 80, y: 320 }
      },
      {
        id: "speech",
        type: "nodetool.audio.TextToSpeech",
        data: {
          model: {
            type: "tts_model",
            provider: input.speech.provider,
            id: input.speech.model,
            name: input.speech.model,
            selected_voice: input.speech.voice,
            capabilities: ["preset_voice"]
          },
          speed: input.speech.speed ?? 1
        },
        position: { x: 380, y: 80 }
      },
      {
        id: "lipsync",
        type: "nodetool.video.LipSync",
        data: {
          model: {
            type: "video_model",
            provider: input.video.provider,
            id: input.video.model,
            name: input.video.model
          }
        },
        position: { x: 680, y: 80 }
      },
      {
        id: "output",
        type: "nodetool.output.Output",
        data: { name: "result" },
        position: { x: 980, y: 80 }
      }
    ],
    edges: [
      {
        id: "text-speech",
        source: "text",
        sourceHandle: "output",
        target: "speech",
        targetHandle: "text"
      },
      {
        id: "speech-lipsync",
        source: "speech",
        sourceHandle: "audio",
        target: "lipsync",
        targetHandle: "audio"
      },
      {
        id: "image-lipsync",
        source: "image",
        sourceHandle: "output",
        target: "lipsync",
        targetHandle: "image"
      },
      {
        id: "lipsync-output",
        source: "lipsync",
        sourceHandle: "output",
        target: "output",
        targetHandle: "value"
      }
    ]
  };
}
