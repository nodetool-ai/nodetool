/**
 * Merge the Comfy Cloud node catalog into the node menu while a Comfy
 * workflow (`run_mode: "comfy"`) is open.
 *
 * `/api/comfy/nodes` returns one `comfy.<ClassName>` metadata record per
 * ComfyUI node class Comfy Cloud serves. The catalog needs the user's
 * COMFY_API_KEY, so it is fetched on demand rather than at boot, once per
 * page load. The records render with the standard `BaseNode`, which is what
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
    void Promise.all([loadComfyNodeCatalog(), import("../components/node/BaseNode")])
      .then(([records, { default: BaseNode }]) => {
        if (cancelled) return;
        const store = useMetadataStore.getState();
        const next = { ...store.metadata };
        const nodeTypes = { ...store.nodeTypes };
        for (const record of records) {
          next[record.node_type] = record;
          nodeTypes[record.node_type] = BaseNode;
        }
        store.setNodeTypes(nodeTypes);
        store.setMetadata(next);
        createConnectabilityMatrix(Object.values(next));
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
