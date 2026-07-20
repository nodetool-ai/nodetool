/**
 * Overlays raised by the clip context menu. They live outside the menu,
 * which unmounts the moment an item is clicked, and mount only once an
 * action has actually asked for them.
 */

import React, { memo, useCallback, useState } from "react";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { Dialog, Text, TextInput } from "../../ui_primitives";

export interface ReplaceOutputDialogProps {
  clipId: string;
  /** Asset id the clip currently points at, prefilled into the field. */
  initialAssetId: string;
  onClose: () => void;
}

export const ReplaceOutputDialog: React.FC<ReplaceOutputDialogProps> = memo(
  ({ clipId, initialAssetId, onClose }) => {
    const replaceClipOutput = useTimelineStore((s) => s.replaceClipOutput);
    const [assetId, setAssetId] = useState(initialAssetId);

    const handleConfirm = useCallback(() => {
      const trimmed = assetId.trim();
      if (trimmed) {
        replaceClipOutput(clipId, trimmed);
      }
      onClose();
    }, [assetId, clipId, onClose, replaceClipOutput]);

    return (
      <Dialog
        open
        onClose={onClose}
        title="Replace Clip"
        onConfirm={handleConfirm}
        onCancel={onClose}
        confirmText="Replace"
        cancelText="Cancel"
        showActions
      >
        <Text size="small" sx={{ mb: 1 }}>
          Enter the asset ID to use as the clip&apos;s current output. The
          generation state and param overrides will not be changed.
        </Text>
        <TextInput
          value={assetId}
          onChange={(e) => setAssetId(e.target.value)}
          placeholder="Asset ID"
          inputProps={{ "aria-label": "Asset ID" }}
          fullWidth
          size="small"
        />
      </Dialog>
    );
  }
);

ReplaceOutputDialog.displayName = "ReplaceOutputDialog";
