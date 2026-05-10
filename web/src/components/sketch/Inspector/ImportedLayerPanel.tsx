/** @jsxImportSource @emotion/react */
/**
 * ImportedLayerPanel
 *
 * Read-only inspector for layers backed by an external `imageReference`
 * (workflow input image, dragged-in asset, etc.). Imported layers do not
 * have a workflow node stack — they show source provenance instead.
 */

import React, { memo } from "react";
import type { Layer } from "../types";
import { summarizeLayerImageReference } from "../types";
import {
  Caption,
  CollapsibleSection,
  FlexColumn,
  FlexRow,
  Label,
  Panel,
  Text
} from "../../ui_primitives";

export interface ImportedLayerPanelProps {
  layer: Layer;
}

export const ImportedLayerPanel: React.FC<ImportedLayerPanelProps> = memo(
  ({ layer }) => {
    const ref = layer.imageReference;
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
            <Caption color="secondary">Imported layer</Caption>
          </FlexColumn>

          <CollapsibleSection title="Source" defaultOpen>
            {ref ? (
              <FlexColumn gap={0.5}>
                <Text size="small">
                  {ref.naturalWidth}×{ref.naturalHeight} · {ref.objectFit}
                </Text>
                <Text size="small" sx={{ wordBreak: "break-all" }}>
                  {summarizeLayerImageReference(ref)}
                </Text>
              </FlexColumn>
            ) : (
              <Caption color="secondary">No image source recorded.</Caption>
            )}
          </CollapsibleSection>
        </FlexColumn>
      </Panel>
    );
  }
);

ImportedLayerPanel.displayName = "ImportedLayerPanel";
