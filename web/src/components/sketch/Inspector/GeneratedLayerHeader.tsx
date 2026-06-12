/** @jsxImportSource @emotion/react */
/**
 * GeneratedLayerHeader
 *
 * Name + status badge + generation metadata for a generated layer.
 * Mirrors the Timeline's `GeneratedClipHeader`, retargeted from clip → layer.
 */

import React, { memo } from "react";
import type { LayerWorkflowBinding } from "@nodetool-ai/image-editor";
import type { Layer } from "../types";

import {
  Caption,
  FlexColumn,
  FlexRow,
  Label,
  StatusIndicator
} from "../../ui_primitives";
import { LAYER_STATUS_MAP } from "./layerStatusMapping";

function formatTimestamp(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "short"
    });
  } catch {
    return isoString;
  }
}

export interface GeneratedLayerHeaderProps {
  layer: Layer;
  binding: LayerWorkflowBinding;
}

export const GeneratedLayerHeader: React.FC<GeneratedLayerHeaderProps> = memo(
  ({ layer, binding }) => {
    const visual = LAYER_STATUS_MAP[binding.status];
    const latestVersion =
      binding.versions[binding.versions.length - 1] ?? null;

    return (
      <FlexColumn gap={1} sx={{ px: 1, pt: 0.5, pb: 0.5 }}>
        <FlexRow align="center" gap={1}>
          <Label
            sx={{
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {layer.name}
          </Label>
          <StatusIndicator
            status={visual.status}
            label={visual.label}
            pulse={visual.pulse}
            size="small"
          />
        </FlexRow>

        <Caption color="secondary">Generated layer</Caption>

        {latestVersion && (
          <Caption color="secondary">
            Generated: {formatTimestamp(latestVersion.createdAt)}
          </Caption>
        )}
      </FlexColumn>
    );
  }
);

GeneratedLayerHeader.displayName = "GeneratedLayerHeader";
