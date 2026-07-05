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

import { CollapsibleSection, Text } from "../../ui_primitives";
import { useSketchStore } from "../state/useSketchStore";
import { useLayerBinding } from "../../../stores/sketch/SketchSessionStore";
import { SKETCH_FONT } from "../sketchStyles";
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
  // Direct-gen layers (text-to-image / image-to-image) share the "Prompt"
  // section, matching the timeline inspector; workflow-bound layers keep
  // their own label.
  const titleText = isWorkflowBound ? "Generated Layer" : "Prompt";

  return (
    <CollapsibleSection
      title={
        // Match the other right-panel section headers (COLOR / LAYERS):
        // small, bright, uppercase, letter-spaced — not the default body size.
        <Text
          size="small"
          sx={{
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontWeight: 600,
            color: "text.primary",
            fontSize: SKETCH_FONT.section
          }}
        >
          {titleText}
        </Text>
      }
      defaultOpen
      compact
      sx={{
        minHeight: 0,
        flex: 1,
        "& > [role='button']": {
          padding: theme.spacing(1, 1),
          backgroundColor: theme.vars.palette.background.paper,
          borderBottom: `1px solid ${theme.vars.palette.divider}`
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
