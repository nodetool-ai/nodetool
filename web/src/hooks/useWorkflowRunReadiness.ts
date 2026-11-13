/**
 * What a workflow needs before Run, read from its graph: the API keys its
 * nodes require that are not set, and what one run is estimated to cost.
 *
 * Without it a template opened from the gallery shows nothing next to Run,
 * the run starts, and the user learns about the missing FAL key from a failed
 * job. The node itself carries a warning, but only on the canvas, where a
 * first-time user has not looked yet.
 */
import { useMemo } from "react";
import type { WorkflowCostEstimateDetail } from "@nodetool-ai/node-sdk/cost-estimate";
import { useNodes } from "../contexts/NodeContext";
import useMetadataStore from "../stores/MetadataStore";
import useRemoteSettingsStore from "../stores/RemoteSettingStore";
import { findMissingSettings } from "./useRequiredSettings";
import { useWorkflowCostEstimate } from "./useWorkflowCostEstimate";

export interface WorkflowRunReadiness {
  /** Required settings (API keys) no node can run without, in graph order. */
  missingSettings: string[];
  /** The pre-run estimate, or null before the graph is available. */
  costEstimate: WorkflowCostEstimateDetail | null;
}

/** Node types in the graph, joined, so the selector result compares by value. */
const NODE_TYPE_SEPARATOR = "\n";

export function useWorkflowRunReadiness(
  workflowId: string | undefined
): WorkflowRunReadiness {
  const nodeTypesKey = useNodes((state) =>
    [...new Set(state.nodes.map((node) => node.type ?? ""))]
      .filter(Boolean)
      .join(NODE_TYPE_SEPARATOR)
  );
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const settings = useRemoteSettingsStore((state) => state.settings);
  const settingsLoading = useRemoteSettingsStore((state) => state.isLoading);
  const costEstimate = useWorkflowCostEstimate(workflowId ?? "");

  const missingSettings = useMemo(() => {
    // Settings that never loaded say nothing; a false "missing key" would
    // send the user to Settings for nothing.
    if (settingsLoading || settings.length === 0 || !nodeTypesKey) {
      return [];
    }
    const required = new Set<string>();
    for (const nodeType of nodeTypesKey.split(NODE_TYPE_SEPARATOR)) {
      for (const key of getMetadata(nodeType)?.required_settings ?? []) {
        required.add(key);
      }
    }
    return findMissingSettings([...required], settings);
  }, [nodeTypesKey, getMetadata, settings, settingsLoading]);

  return { missingSettings, costEstimate: workflowId ? costEstimate : null };
}
