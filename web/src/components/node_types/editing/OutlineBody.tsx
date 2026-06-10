/** @jsxImportSource @emotion/react */
/**
 * OutlineBody — bespoke body for `lib.image.effects.Outline`.
 *
 * Preview on top, then a color row and two sliders:
 *   - Width (px): 0–32
 *   - Alpha threshold: 0–1
 */

import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ImageIcon from "@mui/icons-material/Image";

import { CheckerDropzone } from "../../ui_primitives";
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

export const OUTLINE_NODE_TYPE = "lib.image.effects.Outline";

const SLIDERS: ReadonlyArray<SliderSpec> = [
  { name: "width",     label: "Width (px)",     min: 0, max: 32, step: 0.5,  default: 2,   bipolar: false },
  { name: "threshold", label: "Alpha threshold", min: 0, max: 1,  step: 0.01, default: 0.5, bipolar: false }
];

const styles = (theme: Theme) =>
  css({
    "&.outline-body": {
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
      borderRadius: "var(--rounded-sm)",
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
    ".color-row": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: `${theme.spacing(0.5)} ${theme.spacing(1)}`
    },
    ".color-row-label": {
      fontSize: theme.fontSizeSmaller,
      fontWeight: 500,
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.045em",
      lineHeight: 1,
      whiteSpace: "nowrap"
    },
    ".controls": {
      display: "grid",
      gridTemplateColumns: "auto 1fr auto",
      columnGap: theme.spacing(1),
      rowGap: theme.spacing(0.5),
      alignItems: "center",
      padding: `${theme.spacing(0.5)} ${theme.spacing(1)} ${theme.spacing(0.5)}`
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

export interface OutlineBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const OutlineBodyInner: React.FC<OutlineBodyProps> = ({
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

  const { setProperty, setPropertyComplete } = useLiveSliderWriter({ nodeId: id, nodeType });

  const colorHex = String(
    (props["color"] as { value?: string })?.value ?? "#000000"
  );

  const handleColorChange = useCallback(
    (newColor: string | null) => {
      setProperty("color", { type: "color", value: newColor ?? "#000000" });
      setPropertyComplete();
    },
    [setProperty, setPropertyComplete]
  );

  const handleChange = useCallback(
    (name: string, v: number) => {
      const spec = SLIDERS.find((s) => s.name === name);
      if (!spec) return;
      setProperty(name, clamp(v, spec.min, spec.max));
    },
    [setProperty]
  );

  return (
    <div css={cssStyles} className="outline-body" data-bespoke-body="Outline">
      <HandleColumn id={id} properties={imageProperty} />
      <div className="preview-area">
        <ImagePreview value={previewValue} />
      </div>

      <div className="color-row">
        <span className="color-row-label">Color</span>
        <ColorPicker
          color={colorHex}
          onColorChange={handleColorChange}
          showCustom={true}
          isNodeProperty={true}
        />
      </div>

      <div className="controls">
        {SLIDERS.map((spec) => {
          const raw = Number(props[spec.name] ?? spec.default);
          const value = clamp(raw, spec.min, spec.max);
          return (
            <AdjustmentSlider
              key={spec.name}
              spec={spec}
              value={value}
              onChange={handleChange}
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

export const OutlineBody = memo(OutlineBodyInner);
OutlineBody.displayName = "OutlineBody";

export default OutlineBody;
