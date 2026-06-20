/** @jsxImportSource @emotion/react */
/**
 * ChromaKeyBody — bespoke body for `lib.image.keyer.ChromaKey`.
 *
 * Preview on top, key-color picker, then three unipolar sliders:
 *   Tolerance, Softness, Spill suppression.
 */

import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ImageIcon from "@mui/icons-material/Image";

import { CheckerDropzone, BORDER_RADIUS } from "../../ui_primitives";
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

export const CHROMA_KEY_NODE_TYPE = "lib.image.keyer.ChromaKey";

const SLIDERS: ReadonlyArray<SliderSpec> = [
  { name: "tolerance", label: "Tolerance", min: 0, max: 1, step: 0.01, default: 0.1,  bipolar: false },
  { name: "softness",  label: "Softness",  min: 0, max: 1, step: 0.01, default: 0.05, bipolar: false },
  { name: "spill",     label: "Spill",     min: 0, max: 1, step: 0.01, default: 0.5,  bipolar: false }
];

const styles = (theme: Theme) =>
  css({
    "&.chroma-key-body": {
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
      display: "contents"
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

export interface ChromaKeyBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const ChromaKeyBodyInner: React.FC<ChromaKeyBodyProps> = ({
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

  const { setProperty, setPropertyComplete } = useLiveSliderWriter({
    nodeId: id,
    nodeType
  });

  const handleSliderChange = useCallback(
    (name: string, v: number) => {
      const spec = SLIDERS.find((s) => s.name === name);
      if (!spec) return;
      setProperty(name, clamp(v, spec.min, spec.max));
    },
    [setProperty]
  );

  const hexColor = String(
    (props["key_color"] as { value?: string } | undefined)?.value ?? "#00ff00"
  );

  const handleColorChange = useCallback(
    (newColor: string | null) => {
      setProperty("key_color", { type: "color", value: newColor ?? "#00ff00" });
      setPropertyComplete();
    },
    [setProperty, setPropertyComplete]
  );

  return (
    <div css={cssStyles} className="chroma-key-body" data-bespoke-body="ChromaKey">
      <HandleColumn id={id} properties={imageProperty} />
      <div className="preview-area">
        <ImagePreview value={previewValue} />
      </div>

      <div className="controls">
        {/* Color picker row */}
        <span className="ctrl-label">Key Color</span>
        <span style={{ gridColumn: "2 / 4", display: "flex", alignItems: "center" }}>
          <ColorPicker
            color={hexColor}
            onColorChange={handleColorChange}
            showCustom={true}
            isNodeProperty={true}
          />
        </span>

        {/* Slider rows */}
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

export const ChromaKeyBody = memo(ChromaKeyBodyInner);
ChromaKeyBody.displayName = "ChromaKeyBody";

export default ChromaKeyBody;
