/**
 * What the composer's current media mode would cost to run once.
 *
 * The same lookup the editor's cost panel and the server's pre-run budget gate
 * use (`getModelUnitPrice` in `@nodetool-ai/model-pricing`), fed from the media
 * params instead of a node's properties: the duration, the resolution rung and
 * the number of variations the user picked. A per-second video model therefore
 * prices the clip that is about to be generated, not one second of it.
 *
 * `referenceImages` is deliberately never set: the composer sends the one input
 * an edit or image-to-video endpoint is for, and that endpoint's own price
 * covers it. The catalogs' reference-image surcharge bills *extra* references,
 * which this composer cannot attach.
 *
 * Returns null whenever a figure would be invented — no model picked, no
 * catalog entry, or a catalog that refuses to extrapolate (a rung the provider
 * does not publish, a unit with no fixed value per run). A composer that shows
 * nothing is better than one that shows a number the run will not match.
 */

import { useMemo } from "react";
import { formatUsd, getModelUnitPrice } from "@nodetool-ai/model-pricing";
import type { ModelPriceParams } from "@nodetool-ai/node-sdk/cost-estimate";
import useMediaGenerationStore, {
  resolveImageSize
} from "../../../stores/MediaGenerationStore";
import type { MediaMode } from "../../../stores/MediaGenerationStore";

export interface MediaCostEstimate {
  /** The whole run, fan-out included: "$0.42". */
  label: string;
  total: number;
  /** How many outputs the price covers. */
  quantity: number;
  /** How the figure was reached: "10 s × $0.14/s at 1080p". */
  breakdown?: string;
  /** What the catalog filled in because the composer states nothing about it. */
  assumptions?: string[];
  /** Known-missing costs — the figure is then a lower bound. */
  warnings?: string[];
}

/** A model selection carrying enough to price it. */
interface PriceableModel {
  id?: string | null;
  provider?: string | null;
}

/** The megapixels an image mode is about to produce. */
function megapixelsFor(resolution: "1K" | "2K" | "4K", aspectRatio: string) {
  const { width, height } = resolveImageSize(resolution, aspectRatio);
  return Math.round(((width * height) / 1_000_000) * 100) / 100;
}

export function useMediaCostEstimate(mode: MediaMode): MediaCostEstimate | null {
  const image = useMediaGenerationStore((s) => s.image);
  const imageEdit = useMediaGenerationStore((s) => s.imageEdit);
  const video = useMediaGenerationStore((s) => s.video);
  const imageToVideo = useMediaGenerationStore((s) => s.imageToVideo);
  const audio = useMediaGenerationStore((s) => s.audio);

  return useMemo(() => {
    const job = ((): {
      model: PriceableModel | null;
      params: ModelPriceParams;
      quantity: number;
    } | null => {
      if (mode === "image") {
        return {
          model: image.model,
          params: {
            resolution: image.resolution,
            megapixels: megapixelsFor(image.resolution, image.aspectRatio)
          },
          quantity: image.variations
        };
      }
      if (mode === "image_edit") {
        return {
          model: imageEdit.model,
          params: {
            resolution: imageEdit.resolution,
            megapixels: megapixelsFor(
              imageEdit.resolution,
              imageEdit.aspectRatio
            )
          },
          quantity: imageEdit.variations
        };
      }
      if (mode === "video") {
        return {
          model: video.model,
          params: {
            resolution: video.resolution,
            seconds: video.duration
          },
          quantity: 1
        };
      }
      if (mode === "image_to_video") {
        return {
          model: imageToVideo.model,
          params: {
            resolution: imageToVideo.resolution,
            seconds: imageToVideo.duration
          },
          quantity: 1
        };
      }
      if (mode === "audio") {
        return { model: audio.model, params: {}, quantity: 1 };
      }
      return null;
    })();

    if (!job?.model?.id) {
      return null;
    }
    const price = getModelUnitPrice(
      { id: job.model.id, provider: job.model.provider ?? null },
      job.params
    );
    if (!price || price.declined || !Number.isFinite(price.unit_price)) {
      return null;
    }
    const total = price.unit_price * job.quantity;
    if (!(total > 0)) {
      return null;
    }
    return {
      label: formatUsd(total),
      total,
      quantity: job.quantity,
      breakdown: price.breakdown,
      assumptions: price.assumptions,
      warnings: price.warnings
    };
  }, [mode, image, imageEdit, video, imageToVideo, audio]);
}

export default useMediaCostEstimate;
