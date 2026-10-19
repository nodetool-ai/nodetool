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
import { useTranslation } from "react-i18next";
import type { Layer } from "../types";
import {
  Caption,
  FlexColumn,
  FlexRow,
  InspectorSection,
  Label,
  Panel,
  Text
} from "../../ui_primitives";

interface PaintedLayerPanelProps {
  layer: Layer;
}

export const PaintedLayerPanel: React.FC<PaintedLayerPanelProps> = memo(
  ({ layer }) => {
    const { t } = useTranslation();
    const kind = layer.type === "mask"
      ? t("i18n-next52.sketch.inspector.mask")
      : layer.type === "group"
        ? t("i18n-next52.sketch.inspector.group")
        : t("i18n-next52.sketch.inspector.painted");
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
            <Caption color="secondary">{kind}</Caption>
          </FlexColumn>

          <InspectorSection title={t("i18n-next52.sketch.inspector.layer")} divider={false}>
            <FlexColumn gap={0.5}>
              <Text size="small">
                {t("i18n-next52.sketch.inspector.opacity")}: {Math.round(layer.opacity * 100)}%
              </Text>
              <Text size="small">{t("i18n-next52.sketch.inspector.blendMode")}: {layer.blendMode}</Text>
              <Text size="small">
                {t("i18n-next52.sketch.inspector.bounds")}: {layer.contentBounds.width}×
                {layer.contentBounds.height} @ ({layer.contentBounds.x},{" "}
                {layer.contentBounds.y})
              </Text>
              <Text size="small">
                {t("i18n-next52.sketch.inspector.effects")}: {layer.effects.length === 0 ? t("i18n-next52.sketch.inspector.none") : layer.effects.length}
              </Text>
            </FlexColumn>
          </InspectorSection>
        </FlexColumn>
      </Panel>
    );
  }
);

PaintedLayerPanel.displayName = "PaintedLayerPanel";
