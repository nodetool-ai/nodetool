/**
 * Hook that checks whether all runtimes required by the current workflow
 * are installed. Shows a notification listing missing runtimes when
 * a workflow is first opened.
 */
import { useEffect, useRef } from "react";
import { useNodes } from "../contexts/NodeContext";
import useMetadataStore from "../stores/MetadataStore";
import { getIsElectronDetails } from "../utils/browser";
import {
  refreshRuntimeStatuses,
  getCachedRuntimeStatuses,
  RUNTIME_TO_PACKAGE_ID,
  RUNTIME_LABELS,
} from "../components/node/NodeDependencyWarning";
import { useNotificationStore } from "../stores/NotificationStore";

export function useWorkflowRuntimeCheck(workflowId: string | null): void {
  const { isElectron } = getIsElectronDetails();
  const nodes = useNodes((s) => s.nodes);
  const getMetadata = useMetadataStore((s) => s.getMetadata);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const checkedWorkflowRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isElectron || !workflowId || workflowId === checkedWorkflowRef.current) {
      return;
    }
    if (nodes.length === 0) return;

    checkedWorkflowRef.current = workflowId;

    (async () => {
      // Ensure runtime statuses are loaded
      if (!getCachedRuntimeStatuses()) {
        await refreshRuntimeStatuses();
      }
      const statuses = getCachedRuntimeStatuses();
      if (!statuses) return;

      // Collect all missing runtimes across all nodes
      const missingSet = new Set<string>();
      for (const node of nodes) {
        if (!node.type) continue;
        const meta = getMetadata(node.type);
        if (!meta?.required_runtimes) continue;
        for (const rt of meta.required_runtimes) {
          const pkgId = RUNTIME_TO_PACKAGE_ID[rt] ?? rt;
          if (!statuses[pkgId]) {
            missingSet.add(rt);
          }
        }
      }

      if (missingSet.size > 0) {
        const names = [...missingSet].map((r) => RUNTIME_LABELS[r] || r);
        addNotification({
          type: "warning",
          alert: true,
          content: `This workflow requires runtimes that are not installed: ${names.join(", ")}. Open the Package Manager to install them.`,
          timeout: 15000,
        });
      }
    })();
  }, [workflowId, nodes, getMetadata, isElectron, addNotification]);
}
