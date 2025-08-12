import type { LanguageModel } from "../stores/ApiTypes";
import { buildMetaIndex } from "./modelNormalization";
import type { SizeBucket, TypeTag } from "../stores/ModelFiltersStore";

export type ActiveFilters = {
  selectedTypes: TypeTag[];
  sizeBucket: SizeBucket | null;
  families: string[];
  // removed: quant, context, modality
};

export function applyAdvancedModelFilters(
  models: LanguageModel[],
  filters: ActiveFilters
): LanguageModel[] {
  if (!models || models.length === 0) return models;
  const index = buildMetaIndex(models);

  const hasTypes = filters.selectedTypes.length > 0;
  const hasFamilies = filters.families.length > 0;
  // removed: quant/modalities

  return (
    index
      .filter(({ meta }) =>
        filters.sizeBucket ? meta.sizeBucket === filters.sizeBucket : true
      )
      // removed: context filter
      .filter(({ meta }) =>
        hasTypes
          ? filters.selectedTypes.some((t) => meta.typeTags.includes(t))
          : true
      )
      .filter(({ meta }) =>
        hasFamilies
          ? meta.family
            ? filters.families.includes(meta.family)
            : false
          : true
      )
      // removed: quant and modality filters
      .map(({ model }) => model)
  );
}
