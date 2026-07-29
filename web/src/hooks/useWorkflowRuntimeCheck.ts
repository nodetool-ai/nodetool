/**
 * Hook that checks whether all runtimes required by the current workflow
 * are installed. Returns the set of missing runtimes (deduped, stable across
 * re-renders) so a caller can render an install prompt. The check runs once
 * per workflow id.
 */
import { useEffect, useRef, useState } from "react";
import { useNodeStoreRef } from "../contexts/NodeContext";
import useMetadataStore from "../stores/MetadataStore";
import { getIsElectronDetails } from "../utils/browser";
import {
  refreshRuntimeStatuses,
  getCachedRuntimeStatuses,
  ensureRuntimeStatuses,
  RUNTIME_TO_PACKAGE_ID,
} from "../components/node/NodeDependencyWarning.helpers";

export interface MissingRuntime {
  /** Original `required_runtimes` value from node metadata. */
  id: string;
  /** Package id understood by the Electron runtime IPC. */
  packageId: string;
}

export interface WorkflowRuntimeCheckResult {
  missing: MissingRuntime[];
  /** True until the first status check resolves. */
  loading: boolean;
}

export function useWorkflowRuntimeCheck(
  workflowId: string | null
): WorkflowRuntimeCheckResult {
  const { isElectron } = getIsElectronDetails();
  const store = useNodeStoreRef();
  const getMetadata = useMetadataStore((s) => s.getMetadata);
  const checkedWorkflowRef = useRef<string | null>(null);
  const [missing, setMissing] = useState<MissingRuntime[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isElectron || !workflowId || workflowId === checkedWorkflowRef.current) {
      return;
    }

    const nodes = store.getState().nodes;
    if (nodes.length === 0) return;

    checkedWorkflowRef.current = workflowId;

    let cancelled = false;
    (async () => {
      if (!getCachedRuntimeStatuses()) {
        await refreshRuntimeStatuses();
      }
      if (cancelled) return;
      const statuses = getCachedRuntimeStatuses();
      if (!statuses) {
        setLoading(false);
        return;
      }

      const missingMap = new Map<string, MissingRuntime>();
      for (const node of nodes) {
        if (!node.type) continue;
        const meta = getMetadata(node.type);
        if (!meta?.required_runtimes) continue;
        for (const rt of meta.required_runtimes) {
          const pkgId = RUNTIME_TO_PACKAGE_ID[rt] ?? rt;
          if (!statuses[pkgId] && !missingMap.has(rt)) {
            missingMap.set(rt, { id: rt, packageId: pkgId });
          }
        }
      }
      if (cancelled) return;
      setMissing([...missingMap.values()]);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [workflowId, store, getMetadata, isElectron]);

  return { missing, loading };
}

/**
 * Re-export so callers that install runtimes (e.g. the install dialog) can
 * refresh the shared status cache without reaching into the helpers module.
 */
export { ensureRuntimeStatuses };
