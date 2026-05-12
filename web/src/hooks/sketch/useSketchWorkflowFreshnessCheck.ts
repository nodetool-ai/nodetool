/**
 * Sketch-document freshness check.
 *
 * Bindings reference the source workflow id directly (no clones), so on
 * document load we reconcile against the current workflow graph:
 *   - mark layers stale when the workflow has updated since the last
 *     successful run
 *   - merge paramOverrides against the current Input* node set (drop
 *     removed names, seed added ones with defaults)
 *   - if a binding's selectedOutputNodeId no longer exists, auto-pick the
 *     first remaining image-output node — silently, with the layer staying
 *     marked stale so the user knows to re-run
 */

import { useEffect, useRef, useCallback } from "react";
import { trpcClient } from "../../trpc/client";
import {
  useSketchSessionStore,
  type LayerWorkflowBinding
} from "../../stores/sketch/SketchSessionStore";

const INPUT_PREFIX = "nodetool.input.";
const OUTPUT_PREFIX = "nodetool.output.";

interface GraphNode {
  id: string;
  type: string;
  data?: Record<string, unknown>;
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
): void {
  const markStaleForWorkflow = useSketchSessionStore(
    (s) => s.markStaleForWorkflow
  );
  const applyInputDrift = useSketchSessionStore((s) => s.applyInputDrift);
  const setBindingsOutputNode = useSketchSessionStore(
    (s) => s.setBindingsOutputNode
  );

  const lastCheckedDocumentId = useRef<string | null>(null);

  const runCheck = useCallback(async () => {
    if (!documentId) return;

    const bindings = Object.values(
      useSketchSessionStore.getState().bindings
    );

    const workflowIds = new Set<string>();
    for (const b of bindings) {
      if (b.workflowId) {
        workflowIds.add(b.workflowId);
      }
    }

    if (workflowIds.size === 0) return;

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

        const hasMissingOutput = affected.some(
          (b) =>
            b.selectedOutputNodeId &&
            !currentOutputIds.has(b.selectedOutputNodeId)
        );
        if (hasMissingOutput && currentOutputNodes.length > 0) {
          setBindingsOutputNode(workflowId, currentOutputNodes[0]!.id);
          markStaleForWorkflow(workflowId);
        }
      })
    );
  }, [
    documentId,
    markStaleForWorkflow,
    applyInputDrift,
    setBindingsOutputNode
  ]);

  useEffect(() => {
    if (!documentId || lastCheckedDocumentId.current === documentId) return;
    lastCheckedDocumentId.current = documentId;
    void runCheck();
  }, [documentId, runCheck]);
}
