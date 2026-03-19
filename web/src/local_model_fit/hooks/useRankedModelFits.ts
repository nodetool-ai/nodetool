/**
 * Local Model Fit — useRankedModelFits hook
 *
 * Returns the full ranked result set derived from the current hardware
 * profile and the static model catalog, with all active filters applied.
 *
 * The heavy computation (score + sort) is memoised so it only recomputes
 * when the hardware profile or catalog changes.  Filtering is a second
 * memo layer so typing in the search box doesn't rescore everything.
 */

import { useMemo } from "react";
import { useLocalModelFitStore } from "../store/localModelFitStore";
import { MODEL_CATALOG } from "../modelCatalog";
import { rankModelFits } from "../rankModelFits";
import {
  filterBySearch,
  filterByTags,
  filterByFamilies,
  filterByTiers,
  filterByFits,
} from "../filterModelFits";
import type { RankedModelFit } from "../types";

export interface UseRankedModelFitsResult {
  /** All scored results (unfiltered). */
  allResults: RankedModelFit[];
  /** Filtered results ready for rendering. */
  results: RankedModelFit[];
}

export const useRankedModelFits = (): UseRankedModelFitsResult => {
  const profile = useLocalModelFitStore((s) => s.hardwareProfile);
  const search = useLocalModelFitStore((s) => s.search);
  const selectedTags = useLocalModelFitStore((s) => s.selectedTags);
  const selectedFamilies = useLocalModelFitStore((s) => s.selectedFamilies);
  const selectedTiers = useLocalModelFitStore((s) => s.selectedTiers);
  const fitsOnly = useLocalModelFitStore((s) => s.fitsOnly);

  // Score + rank: only recomputes when profile changes.
  const allResults = useMemo(
    () => rankModelFits(MODEL_CATALOG, profile),
    [profile],
  );

  // Apply filters on top of the ranked list.
  const results = useMemo(() => {
    let r: RankedModelFit[] = allResults;
    r = filterBySearch(r, search);
    r = filterByTags(r, selectedTags);
    r = filterByFamilies(r, selectedFamilies);
    r = filterByTiers(r, selectedTiers);
    r = filterByFits(r, fitsOnly);
    return r;
  }, [allResults, search, selectedTags, selectedFamilies, selectedTiers, fitsOnly]);

  return { allResults, results };
};
