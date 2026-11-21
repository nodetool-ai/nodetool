import type { ReactNode } from "react";
import { directedCampaignKitSteps } from "./DirectedCampaignKitSteps";
import { impossibleProductWorldsSteps } from "./ImpossibleProductWorldsSteps";
import { multilingualVideoSteps } from "./MultilingualVideoSteps";
import { productCatalogueSteps } from "./ProductCatalogueSteps";
import { productCommercialSteps } from "./ProductCommercialSteps";
import { storyboardTrailerSteps } from "./StoryboardTrailerSteps";
import { ugcProductVideoSteps } from "./UgcProductVideoSteps";

/** Step diagrams by recipe slug, then by guide step id. */
export const recipeStepVisuals: Readonly<
  Record<string, Readonly<Record<string, ReactNode>>>
> = {
  "directed-campaign-kit": directedCampaignKitSteps,
  "ugc-product-video": ugcProductVideoSteps,
  "impossible-product-worlds": impossibleProductWorldsSteps,
  "viral-video-ad-engine": productCommercialSteps,
  "multilingual-video-dubber": multilingualVideoSteps,
  "ecommerce-sku-visual-factory": productCatalogueSteps,
  "storyboard-to-trailer": storyboardTrailerSteps
};
