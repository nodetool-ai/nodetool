/**
 * Merge the user's custom nodes into the node menu.
 *
 * Custom-node metadata is user data, so it cannot ride the unauthenticated
 * `/api/nodes/metadata` fetch `useMetadata` performs. This hook queries the
 * scripts their owner exposed (`jsScripts.palette`), turns them into virtual
 * `user.*` records, and merges them into `MetadataStore` once the base catalog
 * has loaded. A `resource_change` on a js_scripts row invalidates the query, so
 * saving, exposing or deleting a script updates the menu without a reload.
 *
 * Signed out or on error the query yields nothing and the menu is the shipped
 * catalog — the merge only ever adds `user.*` keys, and rewrites all of them
 * each pass so a script that lost its palette flag leaves.
 */
import { useEffect, useRef } from "react";

import { trpc } from "../trpc/client";
import useMetadataStore from "../stores/MetadataStore";
import type { NodeMetadata } from "../stores/ApiTypes";
import {
  CUSTOM_NODE_PREFIX,
  generateCustomNodeMetadata,
  setCustomNodeScripts,
  type CustomNodeScript
} from "../config/customNodeMetadata";

const EMPTY: readonly CustomNodeScript[] = [];

export const useCustomNodeMetadata = (enabled = true): void => {
  const query = trpc.jsScripts.palette.useQuery(undefined, {
    enabled,
    staleTime: 30_000
  });
  const metadata = useMetadataStore((state) => state.metadata);
  const setMetadata = useMetadataStore((state) => state.setMetadata);
  const data = query.data;

  /**
   * What the last merge saw. Without it the effect would re-merge the map it
   * just wrote and loop; a fresh `loadMetadata` gives the map a new identity,
   * which is exactly when the custom records have to be put back.
   */
  const merged = useRef<{
    scripts: readonly CustomNodeScript[] | undefined;
    metadata: Record<string, NodeMetadata>;
  } | null>(null);

  useEffect(() => {
    // Before the base catalog lands there is nothing to merge into: the load
    // replaces the map wholesale and would drop these records.
    if (Object.keys(metadata).length === 0) return;
    if (
      merged.current?.scripts === data &&
      merged.current?.metadata === metadata
    ) {
      return;
    }

    const scripts: readonly CustomNodeScript[] = data ?? EMPTY;
    setCustomNodeScripts(scripts);
    const custom = generateCustomNodeMetadata(scripts);

    const base = Object.entries(metadata).filter(
      ([nodeType]) => !nodeType.startsWith(CUSTOM_NODE_PREFIX)
    );
    const hadCustom = base.length !== Object.keys(metadata).length;
    if (Object.keys(custom).length === 0 && !hadCustom) {
      merged.current = { scripts: data, metadata };
      return;
    }
    const next = { ...Object.fromEntries(base), ...custom };
    merged.current = { scripts: data, metadata: next };
    setMetadata(next);
  }, [data, metadata, setMetadata]);
};

export default useCustomNodeMetadata;
