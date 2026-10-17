/** @jsxImportSource @emotion/react */
/**
 * ConnectedGeneratedLayerSection
 *
 * Renders the "Generated Layer" inspector section only when the active layer
 * has a generated-layer binding. Subscribes directly to the sketch store and
 * the layer-bindings store so SketchEditor doesn't need to.
 */

import React, { memo } from "react";
import { useTheme } from "@mui/material/styles";

import { CollapsibleSection, InspectorSectionTitle } from "../../ui_primitives";
import { useSketchStore } from "../state/useSketchStore";
import { useLayerBinding } from "../../../stores/sketch/SketchSessionStore";
import { SketchAIToolbar } from "./SketchAIToolbar";
import { VectorLayerPanel } from "./VectorLayerPanel";
import { SketchInspector } from "./SketchInspector";
import { sketchSectionSx } from "./sketchSectionSx";

const ConnectedGeneratedLayerSectionInner: React.FC = () => {
  const theme = useTheme();
  const activeLayerId = useSketchStore((s) => s.document.activeLayerId);
  const binding = useLayerBinding(activeLayerId);

  const layer = useSketchStore((s) => s.document.layers.find((entry) => entry.id === activeLayerId));
  const sectionSx = { ...sketchSectionSx(theme), minHeight: 0, flex: "1 0 auto", borderBottom: 0 };
  if (layer?.type === "vector") {
    return (
      <CollapsibleSection
        title={<InspectorSectionTitle title="Vector layer" />}
        defaultOpen
        compact
        sx={sectionSx}
      >
        <VectorLayerPanel key={layer.id} layer={layer} />
      </CollapsibleSection>
    );
  }
  if (!binding) {
    return null;
  }

  const isWorkflowBound = !binding.kind || binding.kind === "workflow";
  // Direct-gen layers (text-to-image / image-to-image) share the "Prompt"
  // section, matching the timeline inspector; workflow-bound layers keep
  // their own label.
  const titleText = isWorkflowBound ? "Generated layer" : "Prompt";

  return (
    <CollapsibleSection
      title={<InspectorSectionTitle title={titleText} />}
      defaultOpen
      compact
      sx={sectionSx}
    >
      {/* SketchAIToolbar (inpaint/regen) is workflow-binding only. */}
      {isWorkflowBound && <SketchAIToolbar />}
      <SketchInspector />
    </CollapsibleSection>
  );
};

export const ConnectedGeneratedLayerSection = memo(
  ConnectedGeneratedLayerSectionInner
);
ConnectedGeneratedLayerSection.displayName = "ConnectedGeneratedLayerSection";
