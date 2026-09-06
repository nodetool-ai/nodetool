/**
 * The image flow's generate action (PRD § 10.3): N layers from one request.
 *
 * A set of variations is one request asked N times. Every layer gets the same
 * prompt, the same pixel size and the same model, and differs only in its seed
 * (criterion 4) — that is what makes the contact sheet a comparison rather than
 * N unrelated pictures.
 *
 * The stage is written to `done` before the first job is enqueued, the same
 * rule the storyboard flow follows (D3): a creator who closes the tab mid-batch
 * reopens on the editor with whatever landed, not back inside the flow.
 */

import { useCallback } from "react";

import { useSketchStore } from "../../components/sketch/state/useSketchStore";
import { useSketchSessionStore } from "../../stores/sketch/SketchSessionStore";
import { useDirectGenJob } from "./useDirectGenJob";

/** Highest seed asked for. Providers take a 32-bit unsigned seed. */
const MAX_SEED = 2_147_483_647;

export interface VariationRequest {
  prompt: string;
  provider: string;
  model: string;
  width: number;
  height: number;
  /** Aspect id for the providers that size by enum rather than by pixels. */
  aspectRatio?: string;
  /** How many variations to render. */
  count: number;
}

export interface GeneratedVariation {
  layerId: string;
  /** 1-based position in the contact sheet. */
  index: number;
  seed: number;
}

/**
 * Seeds for one batch: consecutive from a random base, so they are distinct by
 * construction and a batch is reproducible from its first seed.
 */
export const variationSeeds = (count: number): number[] => {
  const base = Math.floor(Math.random() * (MAX_SEED - count));
  return Array.from({ length: count }, (_, index) => base + index);
};

export interface GenerateVariationsResult {
  /**
   * Add N generated layers and start them. Returns the layers in contact-sheet
   * order. A refused start leaves its own layer's binding `failed`; the rest of
   * the batch still runs.
   */
  generateVariations: (
    request: VariationRequest
  ) => Promise<GeneratedVariation[]>;
}

export function useGenerateVariations(): GenerateVariationsResult {
  const { start } = useDirectGenJob();

  const generateVariations = useCallback(
    async (request: VariationRequest): Promise<GeneratedVariation[]> => {
      const count = Math.max(1, Math.trunc(request.count));
      const seeds = variationSeeds(count);
      const sketch = useSketchStore.getState();
      // D3: the terminal stage is persisted before anything is enqueued.
      sketch.setSetup({ stage: "done", variations: count });

      const variations: GeneratedVariation[] = seeds.map((seed, index) => {
        const layerId = useSketchStore
          .getState()
          .addLayer(`Variation ${index + 1}`);
        useSketchSessionStore.getState().upsertBinding({
          layerId,
          kind: "text-to-image",
          prompt: request.prompt,
          provider: request.provider,
          model: request.model,
          width: request.width,
          height: request.height,
          aspectRatio: request.aspectRatio,
          seed,
          sourceLayerId: null,
          status: "draft",
          versions: []
        });
        return { layerId, index: index + 1, seed };
      });

      // One refusal must not stop the batch: a layer that cannot start records
      // the reason on its own binding.
      await Promise.all(
        variations.map((variation) =>
          start(variation.layerId).catch(() => undefined)
        )
      );
      return variations;
    },
    [start]
  );

  return { generateVariations };
}

export default useGenerateVariations;
