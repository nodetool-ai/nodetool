import { TYPE_FILTERS } from "../../utils/formatUtils";

const LABELS: Record<string, string> = {
  ...Object.fromEntries(TYPE_FILTERS.map(({ key, label }) => [key, label])),
  folder: "Folders"
};

/** Plural section-header label for an asset category, matching the filter menu. */
export const assetTypeLabel = (type: string): string =>
  LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
