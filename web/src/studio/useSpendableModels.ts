/**
 * Which curated models this server sells.
 *
 * A production operator whitelists a subset of the catalog
 * (`NODETOOL_CREDIT_MODELS`); the server refuses the rest and reports the
 * survivors as `spendableModels` on the credit status. Studio's dropdowns are
 * built from the static catalog, so they filter through this to avoid offering
 * a model the run would refuse.
 *
 * Fails open, matching the server gate: while the status is loading or
 * unavailable the full list shows, and the run is what refuses.
 */

import { useMemo } from "react";
import { useStudioCredits } from "./useStudioCredits";
import type { CuratedOption } from "./curatedModels";

function useSpendableModelIds(): ReadonlySet<string> | null {
  const { status } = useStudioCredits();
  return useMemo(
    () => (status ? new Set(status.spendableModels) : null),
    [status]
  );
}

/** `options` narrowed to the ones whose model this server sells. */
export function useSpendableOptions<T>(
  options: CuratedOption<T>[]
): CuratedOption<T>[] {
  const spendable = useSpendableModelIds();
  return useMemo(() => {
    if (!spendable) return options;
    const kept = options.filter((option) => spendable.has(option.modelId));
    // An empty result means the whitelist and this picker's role do not
    // overlap; showing the full list beats showing an empty dropdown, and the
    // run still refuses.
    return kept.length > 0 ? kept : options;
  }, [options, spendable]);
}
