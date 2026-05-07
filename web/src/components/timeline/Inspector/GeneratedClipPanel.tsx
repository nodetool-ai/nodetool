/** @jsxImportSource @emotion/react */
/**
 * GeneratedClipPanel
 *
 * Inspector panel shown when a generated clip is selected in the timeline.
 * Composes:
 *   - GeneratedClipHeader  — name, status badge, type, duration, timestamps
 *   - NodeStack            — vertical topo-sorted node list with selection
 *   - NodePropertyEditor   — editable fields or read-only summary for selected node
 *   - ClipActions          — generate, lock, open in node editor, etc.
 *
 * Owns the SelectedClipNodeStore interaction: resets the selected node
 * whenever the active clipId changes, defaulting to `clip.selectedOutputNodeId`.
 *
 * PRD §5.4 (Generated clip selected → GeneratedClipPanel).
 */

import React, { memo, useCallback, useEffect } from "react";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useSelectedClipNodeStore } from "../../../stores/timeline/SelectedClipNodeStore";
import { useWorkflow } from "../../../serverState/useWorkflow";
import {
  CollapsibleSection,
  EmptyState,
  FlexColumn,
  LoadingSpinner,
  Panel
} from "../../ui_primitives";
import { GeneratedClipHeader } from "./GeneratedClipHeader";
import { NodeStack } from "./NodeStack";
import { NodePropertyEditor } from "./NodePropertyEditor";
import { ClipActions } from "./ClipActions";

// ── Types ─────────────────────────────────────────────────────────────────

export interface GeneratedClipPanelProps {
  clipId: string;
}

// ── Component ─────────────────────────────────────────────────────────────

export const GeneratedClipPanel: React.FC<GeneratedClipPanelProps> = memo(
  ({ clipId }) => {
    const clip = useTimelineStore((s) =>
      s.clips.find((c) => c.id === clipId)
    );

    const selectedClipNodeId = useSelectedClipNodeStore(
      (s) => s.selectedClipNodeId
    );
    const resetForClip = useSelectedClipNodeStore((s) => s.resetForClip);
    const setSelectedClipNodeId = useSelectedClipNodeStore(
      (s) => s.setSelectedClipNodeId
    );

    // When the clip changes, reset selected node to the terminal output node
    // (or null if none is set).
    useEffect(() => {
      resetForClip(clip?.selectedOutputNodeId ?? null);
    }, [clipId, clip?.selectedOutputNodeId, resetForClip]);

    const handleSelectNode = useCallback(
      (nodeId: string) => {
        setSelectedClipNodeId(nodeId);
      },
      [setSelectedClipNodeId]
    );

    const workflowId = clip?.workflowId ?? null;
    const { data: workflow, isLoading, isError } = useWorkflow(workflowId);

    if (!clip) {
      return null;
    }

    const graphNodes = workflow?.graph?.nodes ?? [];
    const graphEdges = workflow?.graph?.edges ?? [];

    return (
      <Panel sx={{ width: "100%", overflow: "auto" }}>
        <FlexColumn gap={0}>
          {/* Header: name, status, type, duration, timestamps */}
          <GeneratedClipHeader clip={clip} />

          {/* Node Stack */}
          {workflowId && (
            <CollapsibleSection title="Workflow Nodes" defaultOpen>
              {isLoading && (
                <LoadingSpinner size="small" />
              )}
              {isError && (
                <EmptyState
                  variant="error"
                  size="small"
                  description="Failed to load workflow graph."
                />
              )}
              {!isLoading && !isError && clip.selectedOutputNodeId && (
                <NodeStack
                  nodes={graphNodes}
                  edges={graphEdges}
                  selectedOutputNodeId={clip.selectedOutputNodeId}
                  selectedNodeId={selectedClipNodeId}
                  workflowId={workflowId}
                  onSelectNode={handleSelectNode}
                />
              )}
              {!isLoading && !isError && !clip.selectedOutputNodeId && (
                <EmptyState
                  variant="empty"
                  size="small"
                  description="No output node configured for this clip."
                />
              )}
            </CollapsibleSection>
          )}

          {/* Node Property Editor */}
          {workflowId && (
            <CollapsibleSection title="Properties" defaultOpen>
              <NodePropertyEditor
                clipId={clipId}
                workflowId={workflowId}
                selectedNodeId={selectedClipNodeId}
              />
            </CollapsibleSection>
          )}

          {/* Clip Actions */}
          <CollapsibleSection title="Actions" defaultOpen>
            <ClipActions clipId={clipId} />
          </CollapsibleSection>
        </FlexColumn>
      </Panel>
    );
  }
);

GeneratedClipPanel.displayName = "GeneratedClipPanel";
