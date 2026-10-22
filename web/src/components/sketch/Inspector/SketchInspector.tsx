/** @jsxImportSource @emotion/react */
/**
 * SketchInspector
 *
 * Top-level inspector for the sketch editor. Looks up the active layer and
 * dispatches to the panel that matches its kind:
 *
 *   - generated layer (has a `LayerWorkflowBinding`) → GeneratedLayerPanel
 *   - imported layer  (`imageReference` set)         → ImportedLayerPanel
 *   - painted / mask / group                         → PaintedLayerPanel
 *
 * Mirrors `TimelineInspector`'s dispatcher pattern. Multi-select and empty
 * selection states are handled here so the panel components stay focused.
 */

import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import { useSketchStore } from "../state/useSketchStore";
import { useLayerBinding } from "../../../stores/sketch/SketchSessionStore";
import { SKETCH_SIZE } from "../sketchStyles";
import { EmptyState, ScrollArea } from "../../ui_primitives";
import { GeneratedLayerPanel } from "./GeneratedLayerPanel";
import { ImportedLayerPanel } from "./ImportedLayerPanel";
import { PaintedLayerPanel } from "./PaintedLayerPanel";
import { VectorLayerPanel } from "./VectorLayerPanel";
import { DirectGenLayerPanel } from "./DirectGenLayerPanel";

const SketchInspectorInner: React.FC = () => {
  const theme = useTheme();
  const { t } = useTranslation();
  const panelsHidden = useSketchStore((s) => s.panelsHidden);
  const activeLayerId = useSketchStore((s) => s.document.activeLayerId);
  const selectedLayerIds = useSketchStore((s) => s.selectedLayerIds);
  const layer = useSketchStore((s) =>
    s.document.layers.find((l) => l.id === activeLayerId)
  );
  const binding = useLayerBinding(activeLayerId);

  if (panelsHidden) {
    return null;
  }

  let body: React.ReactNode;
  if (selectedLayerIds.length > 1) {
    body = (
      <EmptyState
        variant="empty"
        size="small"
        title={t("i18n-next52.sketch.inspector.selected", { count: selectedLayerIds.length })}
        description={t("i18n-next52.sketch.inspector.selectSingle")}
      />
    );
  } else if (!layer) {
    body = (
      <EmptyState
        variant="empty"
        size="small"
        title={t("i18n-next52.sketch.inspector.title")}
        description={t("i18n-next52.sketch.inspector.selectLayer")}
      />
    );
  } else if (layer.type === "vector") {
    body = <VectorLayerPanel key={layer.id} layer={layer} />;
  } else if (
    binding &&
    (binding.kind === "text-to-image" || binding.kind === "image-to-image")
  ) {
    body = <DirectGenLayerPanel layer={layer} binding={binding} />;
  } else if (binding) {
    body = <GeneratedLayerPanel layer={layer} />;
  } else if (layer.imageReference) {
    body = <ImportedLayerPanel layer={layer} />;
  } else {
    body = <PaintedLayerPanel layer={layer} />;
  }

  return (
    <ScrollArea
      className="sketch-inspector"
      sx={{
        width: SKETCH_SIZE.panelWidth,
        minWidth: SKETCH_SIZE.panelWidth,
        maxWidth: SKETCH_SIZE.panelWidth,
        flex: 1,
        minHeight: 0,
        // Recessed, darker well for the generate/inspect content so previews
        // and generated output read against a near-black surface (darker than
        // the surrounding `paper` panel).
        backgroundColor: theme.vars.palette.background.default,
        borderTop: `1px solid ${theme.vars.palette.divider}`,
        borderLeft: `1px solid ${theme.vars.palette.divider}`
      }}
    >
      {body}
    </ScrollArea>
  );
};

export const SketchInspector = memo(SketchInspectorInner);
SketchInspector.displayName = "SketchInspector";
