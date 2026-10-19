/** @jsxImportSource @emotion/react */
/**
 * ImportedLayerPanel
 *
 * Read-only inspector for layers backed by an external `imageReference`
 * (workflow input image, dragged-in asset, etc.). Imported layers do not
 * have a workflow node stack — they show source provenance instead.
 */

import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import type { Layer } from "../types";
import { summarizeLayerImageReference } from "../types";
import {
  Caption,
  FlexColumn,
  FlexRow,
  InspectorSection,
  Label,
  Panel,
  Text
} from "../../ui_primitives";

interface ImportedLayerPanelProps {
  layer: Layer;
}

export const ImportedLayerPanel: React.FC<ImportedLayerPanelProps> = memo(
  ({ layer }) => {
    const { t, i18n } = useTranslation();
    const ref = layer.imageReference;
    const numberFormat = new Intl.NumberFormat(i18n.language);
    return (
      <Panel
        background="default"
        bordered={false}
        sx={{ width: "100%", overflow: "auto" }}
      >
        <FlexColumn gap={0}>
          <FlexColumn gap={0.5} sx={{ px: 1, pt: 0.5, pb: 0.5 }}>
            <FlexRow align="center" gap={1}>
              <Label noWrap sx={{ flex: 1 }}>
                {layer.name}
              </Label>
            </FlexRow>
            <Caption color="secondary">
              {t("screens4_26.sketch.importedLayerPanel.importedLayer")}
            </Caption>
          </FlexColumn>

          <InspectorSection
            title={t("screens4_26.sketch.importedLayerPanel.source")}
            divider={false}
          >
            {ref ? (
              <FlexColumn gap={0.5}>
                <Text size="small">
                  {numberFormat.format(ref.naturalWidth)}×
                  {numberFormat.format(ref.naturalHeight)} · {ref.objectFit}
                </Text>
                <Text size="small" sx={{ wordBreak: "break-all" }}>
                  {summarizeLayerImageReference(ref)}
                </Text>
              </FlexColumn>
            ) : (
              <Caption color="secondary">
                {t("screens4_26.sketch.importedLayerPanel.noImageSource")}
              </Caption>
            )}
          </InspectorSection>
        </FlexColumn>
      </Panel>
    );
  }
);

ImportedLayerPanel.displayName = "ImportedLayerPanel";
