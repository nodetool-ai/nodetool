/** @jsxImportSource @emotion/react */
/**
 * OffsetBody — bespoke body for `lib.image.warp.Offset`.
 *
 * Preview on top, two bipolar sliders (dx, dy) and a compact wrap-mode
 * toggle group (Clamp / Repeat / Mirror) below.
 */

import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ImageIcon from "@mui/icons-material/Image";

import {
  CheckerDropzone,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx,
  ToggleOption,
  ToggleGroup
} from "../../ui_primitives";
import HandleColumn from "../../node/HandleColumn";
import ImageRefPreview from "../../node/ImageRefPreview";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";

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

export const OFFSET_NODE_TYPE = "lib.image.warp.Offset";

const SLIDERS: ReadonlyArray<SliderSpec> = [
  { name: "dx", label: "Offset X", min: -1, max: 1, step: 0.01, default: 0, bipolar: true },
  { name: "dy", label: "Offset Y", min: -1, max: 1, step: 0.01, default: 0, bipolar: true }
];

const WRAP_LABELS = ["Clamp", "Repeat", "Mirror"] as const;

const styles = (theme: Theme) =>
  css({
    "&.offset-body": {
      position: "relative",
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(SPACING.micro),
      padding: theme.spacing(SPACING.micro),
      minHeight: 0
    },
    "& > .handle-column": {
      top: theme.spacing(SPACING.xs),
      bottom: theme.spacing(SPACING.xs),
      left: `calc(${theme.spacing(0)})`
    },
    ".preview-area": {
      position: "relative",
      flex: "1 1 auto",
      minHeight: 96,
      borderRadius: BORDER_RADIUS.sm,
      overflow: "hidden",
      backgroundColor: theme.vars.palette.background.default,
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
      flex: "0 0 auto",
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) minmax(48px, 1.4fr) auto",
      columnGap: theme.spacing(SPACING.xs),
      rowGap: theme.spacing(SPACING.micro),
      alignItems: "center",
      padding: `${theme.spacing(SPACING.micro)} ${theme.spacing(SPACING.xs)} ${theme.spacing(SPACING.micro)}`
    },
    ".wrap-row": {
      gridColumn: "1 / -1",
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(SPACING.xs),
      paddingTop: theme.spacing(SPACING.micro)
    },
    ".wrap-label": {
      fontSize: theme.fontSizeSmaller,
      fontWeight: 500,
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.045em",
      lineHeight: 1,
      whiteSpace: "nowrap",
      minWidth: "minmax(52px, auto)"
    },
    ".wrap-row .MuiToggleButton-root": {
      fontSize: theme.fontSizeSmaller,
      padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.md)}`,
      textTransform: "none"
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

interface OffsetBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const OffsetBodyInner: React.FC<OffsetBodyProps> = ({
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

  const wrapValue = clamp(Number(props.wrap ?? 1), 0, 2);

  const handleWrapChange = useCallback(
    (_: React.MouseEvent<HTMLElement>, v: string | null) => {
      if (v !== null) {
        setProperty("wrap", Number(v));
        setPropertyComplete();
      }
    },
    [setProperty, setPropertyComplete]
  );

  return (
    <div css={cssStyles} className="offset-body" data-bespoke-body="Offset">
      <HandleColumn id={id} properties={imageProperty} />
      <div className="preview-area">
        <ImagePreview value={previewValue} />
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
              onChange={handleSliderChange}
              onCommit={setPropertyComplete}
            />
          );
        })}

        <div className="wrap-row">
          <span className="wrap-label">Wrap</span>
          <ToggleGroup
            quiet
            value={String(Math.round(wrapValue))}
            exclusive
            onChange={handleWrapChange}
            size="small"
            aria-label="Wrap mode"
          >
            {WRAP_LABELS.map((label, i) => (
              <ToggleOption key={i} value={String(i)} aria-label={label}>
                {label}
              </ToggleOption>
            ))}
          </ToggleGroup>
        </div>
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

export const OffsetBody = memo(OffsetBodyInner);
OffsetBody.displayName = "OffsetBody";

export default OffsetBody;
