/** Sketch-document workflow freshness + structural drift check — mirrors `useWorkflowFreshnessCheck`. */

import { useEffect, useRef, useState, useCallback } from "react";
import { trpcClient } from "../../trpc/client";
import {
  useSketchLayerBindingsStore,
  type LayerWorkflowBinding
} from "../../stores/sketch/SketchLayerBindingsStore";

const INPUT_PREFIX = "nodetool.input.";
const OUTPUT_PREFIX = "nodetool.output.";

interface GraphNode {
  id: string;
  type: string;
  data?: Record<string, unknown>;
}

export interface OutputNodeOption {
  id: string;
  label: string;
}

export interface LayerDriftItem {
  /** The workflow whose selected output node was deleted. */
  workflowId: string;
  /** Layer ids affected (all share the same workflowId). */
  layerIds: string[];
  /** Output nodes currently available in the workflow. */
  availableOutputNodes: OutputNodeOption[];
}

export interface UseSketchWorkflowFreshnessCheckReturn {
  /** Non-empty when at least one workflow lost its selected output node. */
  driftItems: LayerDriftItem[];
  /** Apply the user's chosen output node to every binding in the workflow. */
  resolveDrift: (workflowId: string, newOutputNodeId: string) => void;
}

function isAfter(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!a || !b) return false;
  return new Date(a).getTime() > new Date(b).getTime();
}

function latestSuccessfulWorkflowUpdatedAt(
  binding: LayerWorkflowBinding
): string | null {
  const successful = binding.versions.filter((v) => v.status === "success");
  if (successful.length === 0) return null;
  return successful.reduce((best, v) =>
    isAfter(v.workflowUpdatedAt, best.workflowUpdatedAt) ? v : best
  ).workflowUpdatedAt;
}

export function useSketchWorkflowFreshnessCheck(
  documentId: string | null | undefined
): UseSketchWorkflowFreshnessCheckReturn {
  const markStaleForWorkflow = useSketchLayerBindingsStore(
    (s) => s.markStaleForWorkflow
  );
  const applyInputDrift = useSketchLayerBindingsStore((s) => s.applyInputDrift);
  const setBindingsOutputNode = useSketchLayerBindingsStore(
    (s) => s.setBindingsOutputNode
  );

  const [driftItems, setDriftItems] = useState<LayerDriftItem[]>([]);

  const lastCheckedDocumentId = useRef<string | null>(null);

  const runCheck = useCallback(async () => {
    if (!documentId) return;

    const bindings = Object.values(
      useSketchLayerBindingsStore.getState().bindings
    );

    const workflowIds = new Set<string>();
    for (const b of bindings) {
      if (
        b.workflowId &&
        b.versions.some((v) => v.status === "success")
      ) {
        workflowIds.add(b.workflowId);
      }
    }

    if (workflowIds.size === 0) return;

    const newDriftItems: LayerDriftItem[] = [];

    await Promise.all(
      [...workflowIds].map(async (workflowId) => {
        let workflow;
        try {
          workflow = await trpcClient.workflows.get.query({ id: workflowId });
        } catch {
          // Workflow not accessible (deleted / permissions changed).
          return;
        }

        const workflowUpdatedAt = workflow.updated_at ?? null;
        const graphNodes: GraphNode[] = (workflow.graph?.nodes ??
          []) as GraphNode[];

        const currentInputNodes = graphNodes.filter((n) =>
          n.type?.startsWith(INPUT_PREFIX)
        );
        const currentOutputNodes = graphNodes.filter((n) =>
          n.type?.startsWith(OUTPUT_PREFIX)
        );
        const currentOutputIds = new Set(currentOutputNodes.map((n) => n.id));

        const affected = bindings.filter((b) => b.workflowId === workflowId);

        const anyNeedsFreshness = affected.some((b) =>
          isAfter(workflowUpdatedAt, latestSuccessfulWorkflowUpdatedAt(b))
        );
        if (anyNeedsFreshness) {
          markStaleForWorkflow(workflowId);
        }

        const representative = affected[0];
        if (representative) {
          const existingKeys = new Set(
            Object.keys(representative.paramOverrides ?? {})
          );

          const currentInputNames = new Set(
            currentInputNodes.map(
              (n) => (n.data?.name as string | undefined) ?? n.id
            )
          );

          const added: Array<{ name: string; defaultValue: unknown }> = [];
          for (const node of currentInputNodes) {
            const name = (node.data?.name as string | undefined) ?? node.id;
            if (!existingKeys.has(name)) {
              added.push({
                name,
                defaultValue:
                  (node.data?.default ?? node.data?.value) ?? null
              });
            }
          }

          const removed: string[] = [...existingKeys].filter(
            (k) => !currentInputNames.has(k)
          );

          if (added.length > 0 || removed.length > 0) {
            applyInputDrift(workflowId, added, removed);
          }
        }

        const layersWithMissingOutput = affected.filter(
          (b) =>
            b.selectedOutputNodeId &&
            !currentOutputIds.has(b.selectedOutputNodeId)
        );

        if (layersWithMissingOutput.length > 0) {
          newDriftItems.push({
            workflowId,
            layerIds: layersWithMissingOutput.map((b) => b.layerId),
            availableOutputNodes: currentOutputNodes.map((n) => ({
              id: n.id,
              label: (n.data?.name as string | undefined) ?? n.id
            }))
          });
        }
      })
    );

    setDriftItems(newDriftItems);
  }, [documentId, markStaleForWorkflow, applyInputDrift]);

  useEffect(() => {
    if (!documentId || lastCheckedDocumentId.current === documentId) return;
    lastCheckedDocumentId.current = documentId;
    void runCheck();
  }, [documentId, runCheck]);

  const resolveDrift = useCallback(
    (workflowId: string, newOutputNodeId: string) => {
      setBindingsOutputNode(workflowId, newOutputNodeId);
      setDriftItems((prev) => prev.filter((d) => d.workflowId !== workflowId));
    },
    [setBindingsOutputNode]
  );

  return { driftItems, resolveDrift };
}
