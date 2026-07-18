/**
 * useWorkflowFreshnessCheck (timeline)
 *
 * Reconciles generated clips against the current state of their bound
 * workflows when the timeline editor mounts:
 *   - mark clips stale when the workflow has updated since the last
 *     successful run
 *   - merge `paramOverrides` against the current Input* node set
 *   - if a clip's `selectedOutputNodeId` no longer exists, auto-pick the
 *     first remaining output node and mark the clip stale
 */

import { useEffect, useRef, useCallback } from "react";
import { trpcClient } from "../../trpc/client";
import {
  useTimelineStore,
  useTimelineStoreApi
} from "../../stores/timeline/TimelineStore";

interface ClipVersion {
  id: string;
  workflowUpdatedAt: string;
  status: "success" | "failed" | string;
}

const INPUT_PREFIX = "nodetool.input.";
const OUTPUT_PREFIX = "nodetool.output.";

interface GraphNode {
  id: string;
  type: string;
  data?: Record<string, unknown>;
}

function isAfter(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return new Date(a).getTime() > new Date(b).getTime();
}

function latestSuccessfulWorkflowUpdatedAt(
  versions: ClipVersion[] | undefined
): string | null {
  const successful = (versions ?? []).filter((v) => v.status === "success");
  if (successful.length === 0) return null;
  return successful.reduce((best, v) =>
    isAfter(v.workflowUpdatedAt, best.workflowUpdatedAt) ? v : best
  ).workflowUpdatedAt;
}

export function useWorkflowFreshnessCheck(
  sequenceId: string | null | undefined
): void {
  // Resolve the surrounding instance's store via context rather than the
  // active-instance statics: this hook's effect runs before the parent
  // TimelineProvider pushes its instance (child effects run first), so the
  // statics would subscribe to whichever instance was active previously.
  const store = useTimelineStoreApi();
  const markClipsStaleForWorkflow = useTimelineStore(
    (s) => s.markClipsStaleForWorkflow
  );
  const applyInputDrift = useTimelineStore((s) => s.applyInputDrift);
  const patchClip = useTimelineStore((s) => s.patchClip);

  const lastCheckedSequenceId = useRef<string | null>(null);

  const runCheck = useCallback(async () => {
    if (!sequenceId) return;

    const clips = store.getState().clips;

    const workflowIds = new Set<string>();
    for (const clip of clips) {
      if (clip.workflowId && clip.sourceType === "generated") {
        workflowIds.add(clip.workflowId);
      }
    }

    if (workflowIds.size === 0) return;

    await Promise.all(
      [...workflowIds].map(async (workflowId) => {
        let workflow;
        try {
          workflow = await trpcClient.workflows.get.query({ id: workflowId });
        } catch {
          return;
        }

        const workflowUpdatedAt = workflow.updated_at ?? null;
        const graphNodes: GraphNode[] =
          (workflow.graph?.nodes ?? []) as GraphNode[];

        const currentInputNodes = graphNodes.filter((n) =>
          n.type?.startsWith(INPUT_PREFIX)
        );
        const currentOutputNodes = graphNodes.filter((n) =>
          n.type?.startsWith(OUTPUT_PREFIX)
        );
        const currentOutputIds = new Set(currentOutputNodes.map((n) => n.id));

        const affectedClips = clips.filter((c) => c.workflowId === workflowId);

        const anyNeedsFreshness = affectedClips.some((clip) => {
          const versions = clip.versions as ClipVersion[] | undefined;
          const latestAt = latestSuccessfulWorkflowUpdatedAt(versions);
          return isAfter(workflowUpdatedAt, latestAt);
        });

        if (anyNeedsFreshness) {
          markClipsStaleForWorkflow(workflowId);
        }

        const representativeClip = affectedClips[0];
        if (representativeClip) {
          const existingOverrideKeys = new Set(
            Object.keys(representativeClip.paramOverrides ?? {})
          );

          const currentInputNames = new Set(
            currentInputNodes.map(
              (n) => (n.data?.name as string | undefined) ?? n.id
            )
          );

          const added: Array<{ name: string; defaultValue: unknown }> = [];
          for (const inputNode of currentInputNodes) {
            const name =
              (inputNode.data?.name as string | undefined) ?? inputNode.id;
            if (!existingOverrideKeys.has(name)) {
              added.push({
                name,
                defaultValue:
                  (inputNode.data?.default ?? inputNode.data?.value) ?? null
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

        const clipsWithMissingOutput = affectedClips.filter(
          (c) =>
            c.selectedOutputNodeId &&
            !currentOutputIds.has(c.selectedOutputNodeId)
        );

        // Only re-point clips whose OWN selection is actually missing.
        // Clips deliberately bound to a different, still-valid output must
        // not be clobbered by another clip's missing selection.
        if (clipsWithMissingOutput.length > 0 && currentOutputNodes.length > 0) {
          const fallbackOutputNodeId = currentOutputNodes[0]!.id;
          for (const clip of clipsWithMissingOutput) {
            patchClip(clip.id, {
              selectedOutputNodeId: fallbackOutputNodeId,
              status: "stale"
            });
          }
        }
      })
    );
  }, [
    sequenceId,
    store,
    markClipsStaleForWorkflow,
    applyInputDrift,
    patchClip
  ]);

  useEffect(() => {
    if (!sequenceId) return;

    // The check reads clips from the store, but `useLoadTimelineIntoStore`
    // populates them asynchronously. Defer until the store carries clips for
    // this sequence so we don't permanently skip the check by tripping
    // `lastCheckedSequenceId` against an empty store.
    const tryRun = (): boolean => {
      if (lastCheckedSequenceId.current === sequenceId) return true;
      const state = store.getState();
      if (state.sequenceId !== sequenceId) return false;
      if (state.clips.length === 0) return false;
      lastCheckedSequenceId.current = sequenceId;
      void runCheck();
      return true;
    };

    if (tryRun()) return;

    const unsubscribe = store.subscribe(() => {
      if (tryRun()) {
        unsubscribe();
      }
    });
    return unsubscribe;
  }, [sequenceId, store, runCheck]);
}
