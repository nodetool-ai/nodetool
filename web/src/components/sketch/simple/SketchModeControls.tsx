/**
 * The Simple / Expert switch, and in Simple mode the layer count and canvas
 * size that Expert mode shows in its status bar.
 */

import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";

import { Chip, FlexRow, ModeSwitch, SPACING } from "../../ui_primitives";
import { useSketchStore } from "../state/useSketchStore";
import type { SketchEditorMode } from "../../../stores/sketch/SketchEditorMode";

export const SimpleDocumentChips = memo(function SimpleDocumentChips() {
  const { t } = useTranslation();
  const layerCount = useSketchStore(
    (s) => s.document.layers.filter((layer) => layer.type !== "group").length
  );
  const width = useSketchStore((s) => s.document.canvas.width);
  const height = useSketchStore((s) => s.document.canvas.height);
  return (
    <FlexRow align="center" gap={SPACING.xs} className="sketch-simple__chips">
      <Chip
        compact
        variant="outlined"
        icon={<LayersOutlinedIcon />}
        label={t("i18n-next4.sketch.simple.layerCount", { count: layerCount })}
        data-testid="sketch-simple-layer-count"
      />
      <Chip
        compact
        variant="outlined"
        label={t("i18n-next4.sketch.simple.canvasSize", { width, height })}
        data-testid="sketch-simple-canvas-size"
      />
    </FlexRow>
  );
});

export interface SketchModeSwitchProps {
  mode: SketchEditorMode;
  onChange: (mode: SketchEditorMode) => void;
}

export const SketchModeSwitch = memo(function SketchModeSwitch({
  mode,
  onChange
}: SketchModeSwitchProps) {
  const { t } = useTranslation();
  return (
    <ModeSwitch
      className="sketch-mode-switch"
      ariaLabel={t("i18n-next4.sketch.simple.modeLabel")}
      value={mode}
      onChange={onChange}
      options={[
        { value: "simple", label: t("i18n-next4.sketch.simple.simple") },
        { value: "expert", label: t("i18n-next4.sketch.simple.expert") }
      ]}
    />
  );
});
