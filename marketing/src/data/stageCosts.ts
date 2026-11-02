/**
 * The two prices behind "cheap stages first": one storyboard still against
 * one short clip of the same look, both on Kie.ai. Read from the calculator's
 * generated catalog so the copy moves when the catalog does. A model that
 * drops out of the catalog fails the build instead of printing a stale price.
 */
import {
  CALCULATOR_MODELS,
  PRICING_ATTRIBUTION,
  type CalculatorModel,
} from "./calculatorPricing.generated";

function find(modality: "image" | "video", id: string): CalculatorModel {
  const model = CALCULATOR_MODELS[modality].find((m) => m.id === id);
  if (!model) {
    throw new Error(`stageCosts: ${id} is missing from calculatorPricing.generated.ts`);
  }
  return model;
}

const still = find("image", "kie:seedream-5-lite:image");
const clip = find("video", "kie:seedance-2:video");

/** Seconds in the example clip. */
export const CLIP_SECONDS = 5;

/** Half-cent rounds up; the epsilon keeps 1.025 from reading as 1.02. */
const usd = (n: number) => `$${(Math.round((n + 1e-9) * 100) / 100).toFixed(2)}`;

export const STAGE_COSTS = {
  stillModel: still.name,
  stillPrice: usd(still.unitPrice),
  clipModel: clip.name,
  clipPrice: usd(clip.unitPrice * CLIP_SECONDS),
  /** Five clips, the length of the /node-based-workflows example. */
  fiveClipPrice: usd(clip.unitPrice * CLIP_SECONDS * 5),
  attribution: `Kie.ai list prices. ${PRICING_ATTRIBUTION}.`,
} as const;
