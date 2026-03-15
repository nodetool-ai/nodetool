/**
 * Local Model Fit — public API barrel
 *
 * Import everything the rest of the app needs from here:
 *
 *   import { useRankedModelFits, useHardwareProfile, ... }
 *     from "../local_model_fit";
 */

// Types
export type {
  HardwareProfile,
  ModelCatalogEntry,
  ModelVariant,
  RankedModelFit,
  FitTier,
  FitLabel,
} from "./types";

// Catalog
export { MODEL_CATALOG, CATALOG_VERSION, getAllCatalogTags, getAllCatalogFamilies } from "./modelCatalog";

// Hardware
export { HARDWARE_PRESETS, getHardwarePreset, buildCustomProfile } from "./hardwareProfiles";
export { detectHardwareProfile } from "./hardwareProfileDetection";

// Scoring / ranking / filtering
export { scoreModelFit, effectiveMemoryGb, scoreToTier, tierToLabel } from "./scoreModelFit";
export { rankModelFits } from "./rankModelFits";
export { filterBySearch, filterByTags, filterByFamilies, filterByTiers, filterByFits } from "./filterModelFits";

// Summaries
export type { TierCounts } from "./summaries";
export { computeTierCounts, bestAvailableTier, oneLinerSummary, TIER_ORDER } from "./summaries";

// Store
export { useLocalModelFitStore } from "./store/localModelFitStore";
export type { LocalModelFitState } from "./store/localModelFitStore";

// Hooks
export { useHardwareProfile } from "./hooks/useHardwareProfile";
export { useRankedModelFits } from "./hooks/useRankedModelFits";
export { useModelFitSummary } from "./hooks/useModelFitSummary";
