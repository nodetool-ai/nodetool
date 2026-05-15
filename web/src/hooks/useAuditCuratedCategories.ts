import { useEffect } from "react";

import useMetadataStore from "../stores/MetadataStore";
import { CURATED_NODE_TYPES } from "../config/quickAccessCategories";

/**
 * Dev-mode audit: warn once when curated category lists in
 * `quickAccessCategories` reference `node_type`s that aren't in the live
 * node registry. Surfaces drift between this static config and the backend
 * registry (renames, deletions) instead of silently dropping the tile.
 *
 * No-op in production. Runs once after metadata is loaded.
 */
export const useAuditCuratedCategories = (): void => {
  const metadata = useMetadataStore((s) => s.metadata);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return;
    }
    const loadedCount = Object.keys(metadata).length;
    if (loadedCount === 0) {
      return;
    }
    const missing: Array<{ nodeType: string; categories: string[] }> = [];
    for (const [nodeType, categories] of CURATED_NODE_TYPES) {
      if (!metadata[nodeType]) {
        missing.push({ nodeType, categories });
      }
    }
    if (missing.length > 0) {
      console.warn(
        "[quickAccessCategories] Curated node_types missing from the registry — " +
          "rename or remove them in web/src/config/quickAccessCategories.tsx:",
        missing
      );
    }
  }, [metadata]);
};
