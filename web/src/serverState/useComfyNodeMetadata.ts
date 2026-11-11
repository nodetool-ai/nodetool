/**
 * Merge the Comfy target's node catalog into the node menu while a Comfy
 * workflow (`run_mode: "comfy"`) is open.
 *
 * `/api/comfy/nodes` returns one `comfy.<ClassName>` metadata record per
 * ComfyUI node class the selected target serves. The catalog depends on the
 * user's settings, so it is fetched on demand rather than at boot. The records render with the standard `BaseNode`, which is what
 * lets the NodeTool graph editor edit Comfy graphs unchanged.
 */
import { useEffect, useState } from "react";
import { COMFY_NODE_PREFIX } from "@nodetool-ai/protocol";

import useMetadataStore from "../stores/MetadataStore";
import type { NodeMetadata } from "../stores/ApiTypes";
import { restFetch } from "../lib/rest-fetch";
import { createConnectabilityMatrix } from "../components/node_menu/typeFilterUtils";

let catalog: Promise<NodeMetadata[]> | null = null;

export const loadComfyNodeCatalog = (): Promise<NodeMetadata[]> => {
  catalog ??= (async () => {
    const res = await restFetch("/api/comfy/nodes");
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        detail?: string;
        error?: { message?: string };
      } | null;
      throw new Error(
        body?.error?.message ?? body?.detail ?? `Comfy nodes failed to load (HTTP ${res.status})`
      );
    }
    return (await res.json()) as NodeMetadata[];
  })();
  catalog.catch(() => {
    catalog = null;
  });
  return catalog;
};

/**
 * Put a catalog in the store. Comfy nodes the new catalog lacks stay registered
 * but hidden from the menu, because `BaseNode` throws for a node on the canvas
 * that has no metadata. A run on the new target reports those classes.
 */
const mergeComfyCatalog = async (records: NodeMetadata[]): Promise<void> => {
  const { default: BaseNode } = await import("../components/node/BaseNode");
  const store = useMetadataStore.getState();
  const next: Record<string, NodeMetadata> = {};
  for (const [key, record] of Object.entries(store.metadata)) {
    next[key] = key.startsWith(COMFY_NODE_PREFIX)
      ? { ...record, hidden: true }
      : record;
  }
  const nodeTypes = { ...store.nodeTypes };
  for (const record of records) {
    next[record.node_type] = record;
    nodeTypes[record.node_type] = BaseNode;
  }
  store.setNodeTypes(nodeTypes);
  store.setMetadata(next);
  createConnectabilityMatrix(Object.values(next));
};

/**
 * Load the catalog of a newly selected target. The previous catalog stays in
 * place until the new one arrives, and also when the load fails.
 */
export const reloadComfyNodeCatalog = async (): Promise<void> => {
  catalog = null;
  await mergeComfyCatalog(await loadComfyNodeCatalog());
};

/**
 * After the Comfy target changes: reload a catalog that is already in the
 * node menu, or drop the cached one so the next Comfy workflow loads fresh.
 */
export const refreshComfyNodeCatalog = async (): Promise<void> => {
  const loaded = Object.keys(useMetadataStore.getState().metadata).some((key) =>
    key.startsWith(COMFY_NODE_PREFIX)
  );
  if (loaded) {
    await reloadComfyNodeCatalog();
  } else {
    catalog = null;
  }
};

export type ComfyCatalogState =
  | { status: "idle" | "loading" | "ready" }
  | { status: "error"; error: string };

export const useComfyNodeMetadata = (enabled: boolean): ComfyCatalogState => {
  const metadata = useMetadataStore((state) => state.metadata);
  const [state, setState] = useState<ComfyCatalogState>({ status: "idle" });

  useEffect(() => {
    if (!enabled) return;
    // The base catalog load replaces the map wholesale; merge after it.
    if (Object.keys(metadata).length === 0) return;
    if (Object.keys(metadata).some((key) => key.startsWith(COMFY_NODE_PREFIX))) {
      setState({ status: "ready" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    void loadComfyNodeCatalog()
      .then(async (records) => {
        if (cancelled) return;
        await mergeComfyCatalog(records);
        setState({ status: "ready" });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          error: error instanceof Error ? error.message : String(error)
        });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, metadata]);

  return state;
};
