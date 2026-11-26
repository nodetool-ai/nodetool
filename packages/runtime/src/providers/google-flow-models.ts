/**
 * Google Flow's model catalog, captured from the live `flow.google.com` model
 * picker. Listing models must not depend on a live browser tab, so the
 * provider serves this catalog directly. Each entry carries the label text
 * Flow displays in its model dropdown so the UI driver can select it without
 * matching emojis or deprecation badges.
 */
import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import type { ImageModel, VideoModel } from "./types.js";

export const FLOW_IMAGE_RATIOS = ["16:9", "4:3", "1:1", "3:4", "9:16"] as const;
export const FLOW_VIDEO_RATIOS = ["16:9", "9:16"] as const;

export interface FlowImageModelSpec {
  readonly id: string;
  readonly name: string;
  /** Substring matched against Flow's `[role=menuitem]` text. */
  readonly menuLabel: string;
  readonly aspectRatios: readonly string[];
}

export interface FlowVideoModelSpec {
  readonly id: string;
  readonly name: string;
  /** Substring matched against Flow's `[role=menuitem]` text. */
  readonly menuLabel: string;
  readonly aspectRatios: readonly string[];
  readonly resolutions?: readonly string[];
  readonly durations: readonly number[];
  /** How the duration control renders in Flow's settings popover. */
  readonly durationControl: "radios" | "slider";
}

export const FLOW_IMAGE_SPECS: readonly FlowImageModelSpec[] = [
  {
    id: "nano-banana-2.1",
    name: "Google Flow Nano Banana 2.1",
    menuLabel: "Nano Banana 2.1",
    aspectRatios: FLOW_IMAGE_RATIOS
  },
  {
    id: "nano-banana-pro",
    name: "Google Flow Nano Banana Pro",
    menuLabel: "Nano Banana Pro",
    aspectRatios: FLOW_IMAGE_RATIOS
  },
  {
    id: "nano-banana-2-lite",
    name: "Google Flow Nano Banana 2 Lite",
    menuLabel: "Nano Banana 2 Lite",
    aspectRatios: FLOW_IMAGE_RATIOS
  }
];

export const FLOW_VIDEO_SPECS: readonly FlowVideoModelSpec[] = [
  {
    id: "omni-1.2-flash",
    name: "Google Flow Omni 1.2 Flash",
    menuLabel: "Omni 1.2 Flash",
    aspectRatios: FLOW_VIDEO_RATIOS,
    resolutions: ["360p", "720p"],
    durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    durationControl: "slider"
  },
  {
    id: "omni-1.1-flash",
    name: "Google Flow Omni 1.1 Flash",
    menuLabel: "Omni 1.1 Flash",
    aspectRatios: FLOW_VIDEO_RATIOS,
    resolutions: ["360p", "720p"],
    durations: [4, 6, 8, 10],
    durationControl: "radios"
  },
  {
    id: "veo-3.1-lite",
    name: "Google Flow Veo 3.1 Lite",
    menuLabel: "Veo 3.1 - Lite",
    aspectRatios: FLOW_VIDEO_RATIOS,
    durations: [4, 6, 8],
    durationControl: "radios"
  },
  {
    id: "veo-3.1-fast",
    name: "Google Flow Veo 3.1 Fast",
    menuLabel: "Veo 3.1 - Fast",
    aspectRatios: FLOW_VIDEO_RATIOS,
    durations: [4, 6, 8],
    durationControl: "radios"
  },
  {
    id: "veo-3.1-quality",
    name: "Google Flow Veo 3.1 Quality",
    menuLabel: "Veo 3.1 - Quality",
    aspectRatios: FLOW_VIDEO_RATIOS,
    durations: [4, 6, 8],
    durationControl: "radios"
  }
];

export const GOOGLE_FLOW_IMAGE_MODELS: readonly ImageModel[] = FLOW_IMAGE_SPECS.map((spec) => ({
  id: spec.id,
  name: spec.name,
  provider: PROVIDER_IDS.GOOGLE_FLOW,
  supportedTasks: ["text_to_image", "image_to_image"],
  aspectRatios: [...spec.aspectRatios]
}));

export const GOOGLE_FLOW_VIDEO_MODELS: readonly VideoModel[] = FLOW_VIDEO_SPECS.map((spec) => {
  const model: VideoModel = {
    id: spec.id,
    name: spec.name,
    provider: PROVIDER_IDS.GOOGLE_FLOW,
    supportedTasks: ["text_to_video", "image_to_video", "reference_to_video"],
    aspectRatios: [...spec.aspectRatios],
    durations: [...spec.durations]
  };
  if (spec.resolutions) {
    model.resolutions = [...spec.resolutions];
  }
  return model;
});
