/**
 * useAutoEnableNodePacks
 *
 * Keeps the live node registry in sync with the two things that should make a
 * builtin provider pack's nodes available, treating the API key as the source
 * of truth:
 *
 *  1. **Key set** — when a provider's API key is configured, its builtin pack
 *     is enabled so its nodes register (no restart needed).
 *  2. **Workflow load** — when the open workflow contains nodes from a disabled
 *     builtin pack, that pack is enabled so the nodes resolve instead of
 *     rendering as placeholders.
 *
 * Mounted once per editor; only the active editor drives the sync, and a
 * module-level guard de-dupes concurrent enables across tabs and renders.
 */
import { useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { findBuiltinPackForNodeType } from "@nodetool-ai/protocol";

import { useNodes } from "../contexts/NodeContext";
import type { NodeStoreState } from "../stores/NodeStore";
import { useSecrets } from "./useSecrets";
import usePacksStore from "../stores/PacksStore";
import { getRequiredKeyForBuiltinPack } from "../utils/providerPacks";

/** Pack ids with an enable request in flight, shared across hook instances. */
const enabling = new Set<string>();

export const useAutoEnableNodePacks = (active: boolean): void => {
  const { secrets } = useSecrets();
  // Compare against the previous types in place and only allocate when they
  // actually differ. `useShallow` built a fresh N-element array on every
  // NodeStore write before comparing, and a node drag pushes one ~60x/s.
  const nodeTypesSelector = useMemo(() => {
    let lastResult: (string | undefined)[] = [];
    return (state: NodeStoreState) => {
      if (
        state.nodes.length === lastResult.length &&
        state.nodes.every((node, i) => node.type === lastResult[i])
      ) {
        return lastResult;
      }
      lastResult = state.nodes.map((node) => node.type);
      return lastResult;
    };
  }, []);
  const nodeTypes = useNodes(nodeTypesSelector);
  const { builtins, fetchBuiltins, setBuiltinEnabled } = usePacksStore(
    useShallow((state) => ({
      builtins: state.builtins,
      fetchBuiltins: state.fetchBuiltins,
      setBuiltinEnabled: state.setBuiltinEnabled
    }))
  );

  useEffect(() => {
    if (!active) return;
    // Need the builtin list to know what's disabled; fetch it once and let the
    // resulting state change re-run this effect.
    if (builtins.length === 0) {
      void fetchBuiltins();
      return;
    }

    const isEnabled = (id: string): boolean =>
      builtins.find((pack) => pack.id === id)?.enabled ?? true;

    const toEnable = new Set<string>();

    // (1) Key is the switch: enable any disabled pack whose API key is set.
    for (const pack of builtins) {
      if (pack.required || pack.enabled) continue;
      const requiredKey = getRequiredKeyForBuiltinPack(pack.id);
      if (requiredKey && secrets.some((s) => s.key === requiredKey)) {
        toEnable.add(pack.id);
      }
    }

    // (2) Resolve nodes from disabled packs used by the loaded workflow.
    for (const nodeType of nodeTypes) {
      if (!nodeType) continue;
      const pack = findBuiltinPackForNodeType(nodeType);
      if (pack && !isEnabled(pack.id)) {
        toEnable.add(pack.id);
      }
    }

    for (const id of toEnable) {
      if (enabling.has(id)) continue;
      enabling.add(id);
      void setBuiltinEnabled(id, true).finally(() => enabling.delete(id));
    }
  }, [active, builtins, secrets, nodeTypes, fetchBuiltins, setBuiltinEnabled]);
};

export default useAutoEnableNodePacks;
