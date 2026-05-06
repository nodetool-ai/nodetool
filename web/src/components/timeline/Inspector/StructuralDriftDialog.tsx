/** @jsxImportSource @emotion/react */
/**
 * StructuralDriftDialog
 *
 * Shown when a clip's `selectedOutputNodeId` no longer exists in the bound
 * workflow (e.g. the output node was deleted in the node editor).
 *
 * The user must pick a replacement output node before the clip can be
 * regenerated. Until resolved, the affected clips have status "failed".
 *
 * When multiple clips share the same workflowId, the dialog lists all of them
 * and applies the chosen output node to all simultaneously.
 */

import React, { memo, useState, useCallback } from "react";
import { FlexColumn, FlexRow, Text, Dialog, SelectField, Caption } from "../../ui_primitives";
import type { DriftItem } from "../../../hooks/timeline/useWorkflowFreshnessCheck";

export interface StructuralDriftDialogProps {
  /** First pending drift item; caller should pass one at a time. */
  driftItem: DriftItem | null;
  /** Called when the user confirms a new output node. */
  onResolve: (workflowId: string, newOutputNodeId: string) => void;
  /** Called when the dialog is dismissed without resolving (not allowed; kept for escape-key UX). */
  onDismiss?: () => void;
}

export const StructuralDriftDialog: React.FC<StructuralDriftDialogProps> = memo(
  ({ driftItem, onResolve, onDismiss }) => {
    const [selectedNodeId, setSelectedNodeId] = useState<string>("");

    const open = driftItem !== null;

    // Reset selection whenever the dialog opens for a new item.
    const options = driftItem?.availableOutputNodes ?? [];
    const clipCount = driftItem?.clipIds.length ?? 0;

    const handleConfirm = useCallback(() => {
      if (!driftItem || !selectedNodeId) return;
      onResolve(driftItem.workflowId, selectedNodeId);
      setSelectedNodeId("");
    }, [driftItem, selectedNodeId, onResolve]);

    const handleClose = useCallback(() => {
      onDismiss?.();
    }, [onDismiss]);

    return (
      <Dialog
        open={open}
        onClose={handleClose}
        title="Output node removed"
        onConfirm={handleConfirm}
        onCancel={handleClose}
        confirmText="Apply"
        cancelText="Cancel"
        showActions
        // Prevent closing without resolving — the Generate button is disabled
        // until this is resolved, so closing is acceptable but tracked.
      >
        <FlexColumn gap={2} sx={{ minWidth: 360 }}>
          <Text size="small">
            The previously selected output node no longer exists in this
            workflow. Please choose a replacement output node.
            {clipCount > 1 && (
              <> The selection will be applied to all {clipCount} linked clips.</>
            )}
          </Text>

          <SelectField
            label="Output node"
            value={selectedNodeId}
            onChange={(v) => setSelectedNodeId(v)}
            options={options.map((o) => ({ value: o.id, label: o.label }))}
            size="small"
          />

          {options.length === 0 && (
            <Caption sx={{ color: "error.main" }}>
              No output nodes found in this workflow. Add an output node before
              generating.
            </Caption>
          )}

          {clipCount > 1 && (
            <FlexRow gap={1} align="center">
              <Caption>
                Affected clips: {clipCount}
              </Caption>
            </FlexRow>
          )}
        </FlexColumn>
      </Dialog>
    );
  }
);

StructuralDriftDialog.displayName = "StructuralDriftDialog";
