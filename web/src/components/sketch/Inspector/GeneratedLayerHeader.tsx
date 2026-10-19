/** @jsxImportSource @emotion/react */
/**
 * GeneratedLayerHeader
 *
 * Name + status badge + generation metadata for a generated layer.
 * Mirrors the Timeline's `GeneratedClipHeader`, retargeted from clip → layer.
 */

import React, { memo } from "react";
import { useTranslation } from "react-i18next";
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

function formatTimestamp(isoString: string, locale: string): string {
  try {
    return new Date(isoString).toLocaleString(locale, {
      dateStyle: "short",
      timeStyle: "short"
    });
  } catch {
    return isoString;
  }
}

interface GeneratedLayerHeaderProps {
  layer: Layer;
  binding: LayerWorkflowBinding;
}

export const GeneratedLayerHeader: React.FC<GeneratedLayerHeaderProps> = memo(
  ({ layer, binding }) => {
    const { t, i18n } = useTranslation();
    const visual = LAYER_STATUS_MAP[binding.status];
    const latestVersion =
      binding.versions[binding.versions.length - 1] ?? null;

    return (
      <FlexColumn gap={1} sx={{ px: 1, pt: 0.5, pb: 0.5 }}>
        <FlexRow align="center" gap={1}>
          <Label noWrap sx={{ flex: 1 }}>
            {layer.name}
          </Label>
          <StatusIndicator
            status={visual.status}
            label={t(
              `screens4_26.sketch.generatedLayerHeader.status.${binding.status}`,
              { defaultValue: visual.label }
            )}
            pulse={visual.pulse}
            size="small"
          />
        </FlexRow>

        <Caption color="secondary">
          {t("screens4_26.sketch.generatedLayerHeader.generatedLayer")}
        </Caption>

        {latestVersion && (
          <Caption color="secondary">
            {t("screens4_26.sketch.generatedLayerHeader.generatedAt", {
              timestamp: formatTimestamp(
                latestVersion.createdAt,
                i18n.language
              )
            })}
          </Caption>
        )}
      </FlexColumn>
    );
  }
);

GeneratedLayerHeader.displayName = "GeneratedLayerHeader";
