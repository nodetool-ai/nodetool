/**
 * useWorkflowFreshnessCheck
 *
 * When the timeline editor mounts (or re-mounts after returning from the node
 * editor), this hook:
 *
 * 1. Collects all unique workflowIds referenced by clips in the current sequence.
 * 2. Fetches the latest workflow data for each (bypasses React-Query cache so
 *    we always get fresh `updated_at` timestamps).
 * 3. For each clip whose workflow has a newer `updated_at` than the most recent
 *    successful version's `workflowUpdatedAt`, marks the clip as stale.
 * 4. Checks for structural drift:
 *    - Input* nodes added → seed `paramOverrides` with default values.
 *    - Input* nodes removed → drop the corresponding override keys.
 *    - `selectedOutputNodeId` no longer present in the workflow → surfaces a
 *      `DriftInfo` item so the caller can show `StructuralDriftDialog`.
 *
 * Returns `{ driftItems, resolveDrift }`:
 *   - `driftItems`: one item per affected workflowId where the selected output
 *     node was removed. Empty array when nothing needs user action.
 *   - `resolveDrift(workflowId, newOutputNodeId)`: apply the user's chosen
 *     output node to all clips with that workflowId.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { trpcClient } from "../../trpc/client";
import { useTimelineStore } from "../../stores/timeline/TimelineStore";

// ── Minimal local types (avoid depending on @nodetool-ai/timeline in typecheck) ─

interface ClipVersion {
  id: string;
  workflowUpdatedAt: string;
  status: "success" | "failed" | string;
}

// ── Node-type prefix constants ─────────────────────────────────────────────

const INPUT_PREFIX = "nodetool.input.";
const OUTPUT_PREFIX = "nodetool.output.";

// ── Shared node shape ─────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  type: string;
  data?: Record<string, unknown>;
}

// ── Public types ──────────────────────────────────────────────────────────

export interface OutputNodeOption {
  id: string;
  label: string;
}

export interface DriftItem {
  /** The workflow whose selected output node was deleted. */
  workflowId: string;
  /** Clips affected (all share the same workflowId). */
  clipIds: string[];
  /** Output nodes currently available in the workflow. */
  availableOutputNodes: OutputNodeOption[];
}

export interface UseWorkflowFreshnessCheckReturn {
  /** Non-empty when at least one workflow lost its selected output node. */
  driftItems: DriftItem[];
  /** Call this when the user picks a new output node for a workflow. */
  resolveDrift: (workflowId: string, newOutputNodeId: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** ISO string comparison: returns true when `a` is strictly after `b`. */
function isAfter(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return new Date(a).getTime() > new Date(b).getTime();
}

/**
 * Find the most recent `workflowUpdatedAt` from all successful versions of
 * a clip. Returns null when no successful version exists.
 */
function latestSuccessfulWorkflowUpdatedAt(
  versions: ClipVersion[] | undefined
): string | null {
  const successful = (versions ?? []).filter((v) => v.status === "success");
  if (successful.length === 0) return null;
  return successful.reduce((best, v) =>
    isAfter(v.workflowUpdatedAt, best.workflowUpdatedAt) ? v : best
  ).workflowUpdatedAt;
}

// ── Hook ─────────────────────────────────────────────────────────────────

export function useWorkflowFreshnessCheck(
  sequenceId: string | null | undefined
): UseWorkflowFreshnessCheckReturn {
  const markClipsStaleForWorkflow = useTimelineStore(
    (s) => s.markClipsStaleForWorkflow
  );
  const applyInputDrift = useTimelineStore((s) => s.applyInputDrift);
  const setClipsOutputNode = useTimelineStore((s) => s.setClipsOutputNode);

  const [driftItems, setDriftItems] = useState<DriftItem[]>([]);

  // Track whether we've already run the check for this sequenceId so we
  // don't re-run on every render cycle.
  const lastCheckedSequenceId = useRef<string | null>(null);

  const runCheck = useCallback(async () => {
    if (!sequenceId) return;

    // Read clips once at call-time via getState() — the hook is one-shot per
    // sequenceId, so a reactive subscription would only add churn.
    const clips = useTimelineStore.getState().clips;

    // Collect unique workflowIds from generated clips that have at least one
    // successful version (draft/never-generated clips don't need freshness checks).
    const workflowIds = new Set<string>();
    for (const clip of clips) {
      if (
        clip.workflowId &&
        clip.sourceType === "generated" &&
        ((clip.versions ?? []) as ClipVersion[]).some((v) => v.status === "success")
      ) {
        workflowIds.add(clip.workflowId);
      }
    }

    if (workflowIds.size === 0) return;

    const newDriftItems: DriftItem[] = [];

    await Promise.all(
      [...workflowIds].map(async (workflowId) => {
        let workflow;
        try {
          workflow = await trpcClient.workflows.get.query({ id: workflowId });
        } catch {
          // Workflow not accessible (deleted / permissions changed) — skip.
          return;
        }

        const workflowUpdatedAt = workflow.updated_at ?? null;
        const graphNodes: GraphNode[] =
          (workflow.graph?.nodes ?? []) as GraphNode[];

        // ── Compute current input/output sets ─────────────────────────────

        const currentInputNodes = graphNodes.filter((n) =>
          n.type?.startsWith(INPUT_PREFIX)
        );
        const currentOutputNodes = graphNodes.filter((n) =>
          n.type?.startsWith(OUTPUT_PREFIX)
        );
        const currentOutputIds = new Set(currentOutputNodes.map((n) => n.id));

        // ── Get clips for this workflowId ─────────────────────────────────

        const affectedClips = clips.filter((c) => c.workflowId === workflowId);

        // ── Freshness check ───────────────────────────────────────────────

        const anyNeedsFreshness = affectedClips.some((clip) => {
          const versions = clip.versions as ClipVersion[] | undefined;
          const latestAt = latestSuccessfulWorkflowUpdatedAt(versions);
          return isAfter(workflowUpdatedAt, latestAt);
        });

        if (anyNeedsFreshness) {
          markClipsStaleForWorkflow(workflowId);
        }

        // ── Structural drift: Input* nodes ────────────────────────────────

        // Use a representative clip's paramOverrides to detect added/removed inputs.
        const representativeClip = affectedClips[0];
        if (representativeClip) {
          const existingOverrideKeys = new Set(
            Object.keys(representativeClip.paramOverrides ?? {})
          );

          // Input node names come from the node's `data.name` or fallback to id.
          const currentInputNames = new Set(
            currentInputNodes.map(
              (n) => (n.data?.name as string | undefined) ?? n.id
            )
          );

          const added: Array<{ name: string; defaultValue: unknown }> = [];
          for (const inputNode of currentInputNodes) {
            const name = (inputNode.data?.name as string | undefined) ?? inputNode.id;
            if (!existingOverrideKeys.has(name)) {
              added.push({
                name,
                defaultValue: (inputNode.data?.default ?? inputNode.data?.value) ?? null
              });
            }
          }

          const removed: string[] = [...existingOverrideKeys].filter(
            (k) => !currentInputNames.has(k)
          );

          if (added.length > 0 || removed.length > 0) {
            applyInputDrift(workflowId, added, removed);
          }
        }

        // ── Structural drift: selected output node removed ────────────────

        const clipsWithMissingOutput = affectedClips.filter(
          (c) =>
            c.selectedOutputNodeId &&
            !currentOutputIds.has(c.selectedOutputNodeId)
        );

        if (clipsWithMissingOutput.length > 0) {
          newDriftItems.push({
            workflowId,
            clipIds: clipsWithMissingOutput.map((c) => c.id),
            availableOutputNodes: currentOutputNodes.map((n) => ({
              id: n.id,
              label: (n.data?.name as string | undefined) ?? n.id
            }))
          });
        }
      })
    );

    setDriftItems(newDriftItems);
  }, [sequenceId, markClipsStaleForWorkflow, applyInputDrift]);

  useEffect(() => {
    if (!sequenceId || lastCheckedSequenceId.current === sequenceId) return;
    lastCheckedSequenceId.current = sequenceId;
    void runCheck();
  }, [sequenceId, runCheck]);

  const resolveDrift = useCallback(
    (workflowId: string, newOutputNodeId: string) => {
      setClipsOutputNode(workflowId, newOutputNodeId);
      setDriftItems((prev) => prev.filter((d) => d.workflowId !== workflowId));
    },
    [setClipsOutputNode]
  );

  return { driftItems, resolveDrift };
}
