/** @jsxImportSource @emotion/react */
/**
 * DropShadowBody — bespoke body for `lib.image.effects.DropShadow`.
 *
 * Preview on top, then controls:
 *   - Shadow Color picker
 *   - Offset X / Offset Y sliders (bipolar)
 *   - Radius (px) / Intensity sliders (unipolar)
 */

import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ImageIcon from "@mui/icons-material/Image";

import { CheckerDropzone, FlexRow, BORDER_RADIUS } from "../../ui_primitives";
import HandleColumn from "../../node/HandleColumn";
import ImageRefPreview from "../../node/ImageRefPreview";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";
import ColorPicker from "../../inputs/ColorPicker";

import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import { useLiveSliderWriter } from "../../../hooks/nodes/useLiveSliderWriter";
import { useNodeOutput } from "../../../hooks/nodes/useNodeIO";
import {
  AdjustmentSlider,
  adjustmentSliderStyles,
  clamp,
  type SliderSpec
} from "./AdjustmentSlider";

export const DROP_SHADOW_NODE_TYPE = "lib.image.effects.DropShadow";

const SLIDERS: ReadonlyArray<SliderSpec> = [
  { name: "offset_x",    label: "Offset X",    min: -0.5, max: 0.5, step: 0.01, default: 0.02, bipolar: true },
  { name: "offset_y",    label: "Offset Y",    min: -0.5, max: 0.5, step: 0.01, default: 0.02, bipolar: true },
  { name: "blur_radius", label: "Radius (px)", min: 0,    max: 40,  step: 0.5,  default: 8,    bipolar: false },
  { name: "intensity",   label: "Intensity",   min: 0,    max: 4,   step: 0.05, default: 0.6,  bipolar: false }
];

const styles = (theme: Theme) =>
  css({
    "&.drop-shadow-body": {
      position: "relative",
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.5),
      padding: theme.spacing(0.5),
      minHeight: 0
    },
    "& > .handle-column": {
      top: theme.spacing(1),
      bottom: theme.spacing(1),
      left: `calc(${theme.spacing(0)})`
    },
    ".preview-area": {
      position: "relative",
      flex: "1 1 auto",
      minHeight: 140,
      borderRadius: BORDER_RADIUS.sm,
      overflow: "hidden",
      backgroundColor: theme.vars.palette.grey[900],
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      "& img": {
        display: "block",
        maxWidth: "100%",
        maxHeight: "100%",
        objectFit: "contain"
      }
    },
    ".controls": {
      display: "grid",
      gridTemplateColumns: "auto 1fr auto",
      columnGap: theme.spacing(1),
      rowGap: theme.spacing(0.5),
      alignItems: "center",
      padding: `${theme.spacing(0.5)} ${theme.spacing(1)} ${theme.spacing(0.5)}`
    },
    ".color-row": {
      padding: `${theme.spacing(0.5)} ${theme.spacing(1)}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    },
    ".color-label": {
      fontSize: theme.fontSizeSmaller,
      fontWeight: 500,
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.045em",
      lineHeight: 1,
      whiteSpace: "nowrap"
    },
    ".outputs-row": {
      flex: "0 0 auto"
    }
  });

const ImagePreview: React.FC<{ value: unknown }> = ({ value }) => (
  <ImageRefPreview
    value={value}
    placeholder={
      <CheckerDropzone message="Connect an image, then run" icon={<ImageIcon />} />
    }
  />
);

export interface DropShadowBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const DropShadowBodyInner: React.FC<DropShadowBodyProps> = ({
  id,
  nodeType,
  nodeMetadata,
  data,
  workflowId,
  status,
  isOutputNode
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(
    () => [styles(theme), adjustmentSliderStyles(theme)],
    [theme]
  );

  const properties = nodeMetadata.properties ?? [];
  const imageProperty = useMemo(
    () => properties.filter((p) => p.name === "image"),
    [properties]
  );

  const props = data.properties ?? {};
  const previewValue = useNodeOutput(workflowId, id);

  const { setProperty, setPropertyComplete } =
    useLiveSliderWriter({ nodeId: id, nodeType });

  const handleSliderChange = useCallback(
    (name: string, v: number) => {
      const spec = SLIDERS.find((s) => s.name === name);
      if (!spec) return;
      setProperty(name, clamp(v, spec.min, spec.max));
    },
    [setProperty]
  );

  const shadowColor = String(
    (props["color"] as { value?: string } | undefined)?.value ?? "#000000"
  );

  const handleColorChange = useCallback(
    (newColor: string | null) => {
      setProperty("color", { type: "color", value: newColor ?? "#000000" });
      setPropertyComplete();
    },
    [setProperty, setPropertyComplete]
  );

  return (
    <div css={cssStyles} className="drop-shadow-body" data-bespoke-body="DropShadow">
      <HandleColumn id={id} properties={imageProperty} />
      <div className="preview-area">
        <ImagePreview value={previewValue} />
      </div>

      <FlexRow className="color-row" align="center" justify="space-between">
        <span className="color-label">Shadow Color</span>
        <ColorPicker
          color={shadowColor}
          onColorChange={handleColorChange}
          showCustom
        />
      </FlexRow>

      <div className="controls">
        {SLIDERS.map((spec) => {
          const raw = Number(props[spec.name] ?? spec.default);
          const value = clamp(raw, spec.min, spec.max);
          return (
            <AdjustmentSlider
              key={spec.name}
              spec={spec}
              value={value}
              onChange={handleSliderChange}
              onCommit={setPropertyComplete}
            />
          );
        })}
      </div>

      {!isOutputNode && (
        <div className="outputs-row">
          <NodeOutputs id={id} outputs={nodeMetadata.outputs} />
        </div>
      )}

      {status === "running" && <NodeProgress id={id} workflowId={workflowId} />}
    </div>
  );
};

export const DropShadowBody = memo(DropShadowBodyInner);
DropShadowBody.displayName = "DropShadowBody";

export default DropShadowBody;
