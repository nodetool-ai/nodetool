/** @jsxImportSource @emotion/react */
/**
 * PaintedLayerPanel
 *
 * Read-only inspector for plain raster / mask layers (the user-painted
 * layers). No workflow binding, no node stack — just enough metadata to
 * orient the user. Editable transforms and effects are reached via the
 * canvas tools, not here.
 */

import React, { memo } from "react";
import type { Layer } from "../types";
import { Caption } from "../../ui_primitives/Caption";
import { CollapsibleSection } from "../../ui_primitives/CollapsibleSection";
import { FlexColumn } from "../../ui_primitives/FlexColumn";
import { FlexRow } from "../../ui_primitives/FlexRow";
import { Label } from "../../ui_primitives/Label";
import { Panel } from "../../ui_primitives/Panel";
import { Text } from "../../ui_primitives/Text";

export interface PaintedLayerPanelProps {
  layer: Layer;
}

function describeKind(layer: Layer): string {
  if (layer.type === "mask") return "Mask layer";
  if (layer.type === "group") return "Group";
  return "Painted layer";
}

export const PaintedLayerPanel: React.FC<PaintedLayerPanelProps> = memo(
  ({ layer }) => {
    return (
      <Panel sx={{ width: "100%", overflow: "auto" }}>
        <FlexColumn gap={0}>
          <FlexColumn gap={0.5} sx={{ px: 1, pt: 0.5, pb: 0.5 }}>
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
            </FlexRow>
            <Caption color="secondary">{describeKind(layer)}</Caption>
          </FlexColumn>

          <CollapsibleSection title="Layer" defaultOpen>
            <FlexColumn gap={0.5}>
              <Text size="small">
                Opacity: {Math.round(layer.opacity * 100)}%
              </Text>
              <Text size="small">Blend mode: {layer.blendMode}</Text>
              <Text size="small">
                Bounds: {layer.contentBounds.width}×
                {layer.contentBounds.height} @ ({layer.contentBounds.x},{" "}
                {layer.contentBounds.y})
              </Text>
              <Text size="small">
                Effects: {layer.effects.length === 0 ? "none" : layer.effects.length}
              </Text>
            </FlexColumn>
          </CollapsibleSection>
        </FlexColumn>
      </Panel>
    );
  }
);

PaintedLayerPanel.displayName = "PaintedLayerPanel";
