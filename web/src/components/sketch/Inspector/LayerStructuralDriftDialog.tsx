/** @jsxImportSource @emotion/react */
/** Replacement-output-node prompt for layers whose bound output node was deleted. */

import React, { memo, useState, useCallback, useEffect } from "react";
import {
  FlexColumn,
  FlexRow,
  Text,
  Dialog,
  SelectField,
  Caption
} from "../../ui_primitives";
import type { LayerDriftItem } from "../../../hooks/sketch/useSketchWorkflowFreshnessCheck";

export interface LayerStructuralDriftDialogProps {
  /** First pending drift item; caller passes one at a time. */
  driftItem: LayerDriftItem | null;
  onResolve: (workflowId: string, newOutputNodeId: string) => void;
  onDismiss?: () => void;
}

export const LayerStructuralDriftDialog: React.FC<LayerStructuralDriftDialogProps> =
  memo(({ driftItem, onResolve, onDismiss }) => {
    const [selectedNodeId, setSelectedNodeId] = useState<string>("");

    const open = driftItem !== null;

    useEffect(() => {
      setSelectedNodeId("");
    }, [driftItem?.workflowId]);

    const options = driftItem?.availableOutputNodes ?? [];
    const layerCount = driftItem?.layerIds.length ?? 0;

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
      >
        <FlexColumn gap={2} sx={{ minWidth: 360 }}>
          <Text size="small">
            The previously selected output node no longer exists in this
            workflow. Please choose a replacement output node.
            {layerCount > 1 && (
              <>
                {" "}
                The selection will be applied to all {layerCount} linked
                layers.
              </>
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

          {layerCount > 1 && (
            <FlexRow gap={1} align="center">
              <Caption>Affected layers: {layerCount}</Caption>
            </FlexRow>
          )}
        </FlexColumn>
      </Dialog>
    );
  });

LayerStructuralDriftDialog.displayName = "LayerStructuralDriftDialog";

export default LayerStructuralDriftDialog;
