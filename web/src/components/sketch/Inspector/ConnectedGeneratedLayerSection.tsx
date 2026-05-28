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

import { CollapsibleSection } from "../../ui_primitives";
import { useSketchStore } from "../state/useSketchStore";
import { useLayerBinding } from "../../../stores/sketch/SketchSessionStore";
import { SketchAIToolbar } from "./SketchAIToolbar";
import { SketchInspector } from "./SketchInspector";

const ConnectedGeneratedLayerSectionInner: React.FC = () => {
  const theme = useTheme();
  const activeLayerId = useSketchStore((s) => s.document.activeLayerId);
  const binding = useLayerBinding(activeLayerId);

  if (!binding) {
    return null;
  }

  const isWorkflowBound = !binding.kind || binding.kind === "workflow";
  // Direct-gen layers (text-to-image / image-to-image) share the "GENERATE"
  // section of the mockup; workflow-bound layers keep their own label.
  const title = isWorkflowBound ? "Generated Layer" : "GENERATE";

  return (
    <CollapsibleSection
      title={title}
      defaultOpen
      compact
      sx={{
        minHeight: 0,
        flex: 1,
        "& > [role='button']": {
          padding: theme.spacing(0.75, 1),
          backgroundColor: theme.vars.palette.grey[800],
          borderBottom: `1px solid ${theme.vars.palette.grey[700]}`
        }
      }}
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
