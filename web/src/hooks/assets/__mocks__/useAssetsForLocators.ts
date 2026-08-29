/**
 * Manual mock for `useAssetsForLocators`.
 *
 * The real hook fetches asset records through TanStack Query, so a component
 * that opens a gallery needs a `QueryClientProvider`. Suites that only exercise
 * what the gallery is handed mock this module instead of standing one up:
 * every locator resolves to nothing, which is the shape of a viewer opened
 * before the records arrive.
 */

import type { Asset } from "../../../stores/ApiTypes";

export type AssetLocator =
  | string
  | { uri?: string | null; asset_id?: string | null }
  | null
  | undefined;

export const useAssetsForLocators = (
  sources: AssetLocator[]
): (Asset | undefined)[] => sources.map(() => undefined);

export default useAssetsForLocators;
