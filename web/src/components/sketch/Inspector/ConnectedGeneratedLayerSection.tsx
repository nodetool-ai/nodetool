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

import { CollapsibleSection, Text, SPACING, TYPOGRAPHY, FONT_SIZE_SANS} from "../../ui_primitives";
import { useSketchStore } from "../state/useSketchStore";
import { useLayerBinding } from "../../../stores/sketch/SketchSessionStore";
import { SketchAIToolbar } from "./SketchAIToolbar";
import { VectorLayerPanel } from "./VectorLayerPanel";
import { SketchInspector } from "./SketchInspector";

const ConnectedGeneratedLayerSectionInner: React.FC = () => {
  const theme = useTheme();
  const activeLayerId = useSketchStore((s) => s.document.activeLayerId);
  const binding = useLayerBinding(activeLayerId);

  const layer = useSketchStore((s) => s.document.layers.find((entry) => entry.id === activeLayerId));
  const sectionSx = {
    minHeight: 0,
    flex: "1 0 auto",
    "& > [role='button']": {
      padding: theme.spacing(SPACING.md, SPACING.lg),
      "&:focus-visible": {
        outline: `2px solid ${theme.vars.palette.primary.main}`,
        outlineOffset: "-2px"
      }
    }
  };
  // Match the other right-panel section headers (COLOR / LAYERS):
  // small, bright, uppercase, letter-spaced — not the default body size.
  const sectionTitle = (text: string): React.ReactNode => (
    <Text
      size="small"
      sx={{
        ...TYPOGRAPHY.sans.label,
        color: "text.primary",
        fontSize: FONT_SIZE_SANS.label
      }}
    >
      {text}
    </Text>
  );
  if (layer?.type === "vector") {
    return (
      <CollapsibleSection
        title={sectionTitle("Vector layer")}
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
  const titleText = isWorkflowBound ? "Generated Layer" : "Prompt";

  return (
    <CollapsibleSection
      title={sectionTitle(titleText)}
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
