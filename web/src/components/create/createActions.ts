/**
 * What a Create grid item can do beyond showing its result.
 *
 * Send to timeline reuses the asset browser's "Create timeline from video"
 * (`useEditVideoAsset`). There is no Send to storyboard: the only path that
 * attaches an asset to a shot is the storyboard agent tool, which needs a board
 * and a shot target, so the grid omits it rather than invent a picker.
 */
import {
  compilePresets,
  presetToWorkflow,
  type Preset,
  type PresetMode
} from "@nodetool-ai/presets";
import type { Graph } from "../../stores/ApiTypes";
import { presetCatalog } from "../storyboard/cameraOptions";
import type { CreateFeedItem } from "./createFeed";
import type { GenerationRequestSettings } from "../../stores/GenerationActivityStore";
import { batchSeeds } from "./createRequest";

/** The request a retake sends: the same settings and prompt, a fresh seed. */
export const retakeRequest = (
  item: CreateFeedItem
): (GenerationRequestSettings & { prompt: string; seed: number }) | null => {
  if (!item.request || item.prompt === null) {
    return null;
  }
  const { seed: _previousSeed, ...settings } = item.request;
  const [seed] = batchSeeds(1);
  const request = { ...settings, prompt: item.prompt, seed };
  if (item.presetIds.length > 0) {
    return { ...request, preset_ids: item.presetIds };
  }
  return request;
};

const PRESET_MODES: ReadonlySet<string> = new Set<PresetMode>([
  "video",
  "image_to_video",
  "reference_to_video",
  "image",
  "image_edit"
]);

interface WorkflowModel {
  provider: string;
  id: string;
}

/** The model and mode an item needs to become a workflow, or null. */
const workflowTarget = (
  item: CreateFeedItem
): { mode: PresetMode; model: WorkflowModel } | null => {
  const { request } = item;
  if (!request || item.presetIds.length === 0) {
    return null;
  }
  const { mode, provider, model } = request;
  if (
    typeof mode !== "string" ||
    !PRESET_MODES.has(mode) ||
    typeof provider !== "string" ||
    typeof model !== "string"
  ) {
    return null;
  }
  return { mode: mode as PresetMode, model: { provider, id: model } };
};

/**
 * Open as workflow is offered for a generation that carries presets: that is
 * the case `presetToWorkflow` builds a graph for. A plain generation has no
 * helper that builds one, so the action is hidden there.
 */
export const canOpenAsWorkflow = (item: CreateFeedItem): boolean =>
  workflowTarget(item) !== null;

/**
 * The graph for a generation's presets. One preset goes through
 * `presetToWorkflow` as is. A stack takes that graph's shape for the first
 * preset, then swaps in the prompt and parameters compiled for the whole
 * stack, so the ejected graph produces what the generation did.
 */
export const generationToWorkflowGraph = (item: CreateFeedItem): Graph => {
  const target = workflowTarget(item);
  if (!target) {
    throw new Error("This generation has no presets to build a workflow from.");
  }
  const presets = item.presetIds.map((id) => {
    const preset = presetCatalog.getPreset(id);
    if (!preset) {
      throw new Error(`The preset ${id} is not in the catalogue any more.`);
    }
    return preset;
  });
  const [first] = presets;
  const ejected = presetToWorkflow(first as Preset, {
    model: target.model,
    mode: target.mode
  });
  if (presets.length > 1) {
    const compiled = compilePresets(item.presetIds, {
      catalog: presetCatalog,
      modelId: target.model.id,
      mode: target.mode,
      prompt: "{{ prompt }}"
    });
    for (const node of ejected.nodes) {
      if (node.id === "template") {
        node.data = { ...node.data, string: compiled.prompt };
      } else if (node.id === "generate") {
        node.data = { ...node.data, ...compiled.params };
      }
    }
  }
  return {
    nodes: ejected.nodes.map(({ position, ...node }) => ({
      ...node,
      ui_properties: { position }
    })),
    edges: ejected.edges
  };
};
