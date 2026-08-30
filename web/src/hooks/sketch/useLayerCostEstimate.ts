/**
 * What generating one sketch layer costs, at list price.
 *
 * Reads the layer's own direct-generation binding — the model it picked and the
 * output size it will ask for. A workflow-bound layer is not priced here: its
 * cost is its graph's, which the inspector estimates with `useGraphCostEstimate`
 * off the fetched workflow.
 *
 * Null whenever no figure can be reached — see `estimateGenerationCost`.
 */

import { useMemo } from "react";
import type { LayerBindingKind } from "@nodetool-ai/image-editor";
import {
  estimateGenerationCost,
  type GenerationCostEstimate,
  type GenerationSpec
} from "../../utils/generationCostEstimate";

/**
 * The binding fields a direct-generation price is derived from. Structural so
 * a `LayerWorkflowBinding` satisfies it without a cast.
 */
export interface LayerCostFields {
  kind?: LayerBindingKind;
  provider?: string;
  model?: string;
  resolution?: string;
  aspectRatio?: string;
  width?: number;
  height?: number;
}

/** The generation a direct-gen binding describes, or null for a workflow. */
export function layerGenerationSpec(
  binding: LayerCostFields | undefined | null
): GenerationSpec | null {
  if (!binding?.model || !binding.kind || binding.kind === "workflow") {
    return null;
  }
  return {
    kind: "image",
    provider: binding.provider ?? null,
    model: binding.model,
    resolution: binding.resolution ?? null,
    aspectRatio: binding.aspectRatio ?? null,
    width: binding.width ?? null,
    height: binding.height ?? null
  };
}

export function useLayerCostEstimate(
  binding: LayerCostFields | undefined | null
): GenerationCostEstimate | null {
  const { kind, provider, model, resolution, aspectRatio, width, height } =
    binding ?? {};
  // Depend on the fields the price is derived from, not on the binding object —
  // every status change and version append replaces that object.
  return useMemo(() => {
    const spec = layerGenerationSpec({
      kind,
      provider,
      model,
      resolution,
      aspectRatio,
      width,
      height
    });
    return spec ? estimateGenerationCost(spec) : null;
  }, [kind, provider, model, resolution, aspectRatio, width, height]);
}

export default useLayerCostEstimate;
