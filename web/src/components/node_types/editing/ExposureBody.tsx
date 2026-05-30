/** @jsxImportSource @emotion/react */
/**
 * ExposureBody — bespoke body for `lib.image.color_grading.Exposure`.
 *
 * Preview on top, six tonal sliders below (exposure / contrast / highlights
 * / shadows / whites / blacks). The preview reflects whatever the server
 * most recently produced — no client-side approximation.
 */

import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ImageIcon from "@mui/icons-material/Image";

import { CheckerDropzone, NodeSlider } from "../../ui_primitives";
import HandleColumn from "../../node/HandleColumn";
import ImageView from "../../node/ImageView";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";

import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import { useBespokePropertyWriter } from "../../../hooks/nodes/useBespokePropertyWriter";
import { useNodeOutput } from "../../../hooks/nodes/useNodeIO";
import { EXPOSURE_NODE_TYPE } from "../../../constants/nodeTypes";

interface SliderSpec {
  name: string;
  label: string;
  min: number;
  max: number;
}

const SLIDERS: ReadonlyArray<SliderSpec> = [
  { name: "exposure", label: "Exposure", min: -5, max: 5 },
  { name: "contrast", label: "Contrast", min: -1, max: 1 },
  { name: "highlights", label: "Highlights", min: -1, max: 1 },
  { name: "shadows", label: "Shadows", min: -1, max: 1 },
  { name: "whites", label: "Whites", min: -1, max: 1 },
  { name: "blacks", label: "Blacks", min: -1, max: 1 }
];

const styles = (theme: Theme) =>
  css({
    "&.exposure-body": {
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
    ".controls": {
      flex: "0 0 auto",
      display: "grid",
      gridTemplateColumns: "auto 1fr auto",
      columnGap: theme.spacing(1),
      rowGap: theme.spacing(0.5),
      alignItems: "center",
      padding: `${theme.spacing(0.5)} ${theme.spacing(1)} ${theme.spacing(0.5)}`
    },
    ".ctrl-label": {
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.04em",
      lineHeight: 1
    },
    ".ctrl-value": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.primary,
      minWidth: 36,
      textAlign: "right",
      lineHeight: 1
    },
    ".outputs-row": {
      flex: "0 0 auto"
    }
  });

const extractImageRef = (
  value: unknown
): { uri?: string; data?: unknown } => {
  if (!value || typeof value !== "object") {
    return {};
  }
  const v = value as Record<string, unknown>;
  return {
    uri: typeof v.uri === "string" ? (v.uri as string) : undefined,
    data: v.data
  };
};

const ImagePreview: React.FC<{ value: unknown }> = ({ value }) => {
  if (typeof value === "string" && value) {
    return <ImageView source={value} />;
  }
  const v = extractImageRef(value);
  if (v.uri) {
    return <ImageView source={v.uri} />;
  }
  if (v.data instanceof Uint8Array) {
    return <ImageView source={v.data} />;
  }
  if (Array.isArray(v.data)) {
    return <ImageView source={new Uint8Array(v.data as number[])} />;
  }
  return (
    <CheckerDropzone
      message="Connect an image, then run"
      icon={<ImageIcon />}
    />
  );
};

export interface ExposureBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

const TonalSlider: React.FC<{
  spec: SliderSpec;
  value: number;
  onChange: (name: string, v: number) => void;
  onCommit: () => void;
}> = ({ spec, value, onChange, onCommit }) => {
  const handleChange = useCallback(
    (_: Event, v: number | number[]) => {
      const next = Array.isArray(v) ? v[0] : v;
      onChange(spec.name, Math.round(next * 100) / 100);
    },
    [onChange, spec.name]
  );
  return (
    <>
      <span className="ctrl-label">{spec.label}</span>
      <NodeSlider
        min={spec.min}
        max={spec.max}
        step={0.01}
        value={value}
        onChange={handleChange}
        onChangeCommitted={onCommit}
        aria-label={`${spec.label} adjustment`}
      />
      <span className="ctrl-value">
        {value > 0 ? "+" : ""}
        {value.toFixed(2)}
      </span>
    </>
  );
};

const ExposureBodyInner: React.FC<ExposureBodyProps> = ({
  id,
  nodeType,
  nodeMetadata,
  data,
  workflowId,
  status,
  isOutputNode
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  const properties = nodeMetadata.properties ?? [];
  const imageProperty = useMemo(
    () => properties.filter((p) => p.name === "image"),
    [properties]
  );

  const props = data.properties ?? {};
  const previewValue = useNodeOutput(workflowId, id);

  const { setProperty, setPropertyComplete } = useBespokePropertyWriter({
    nodeId: id,
    nodeType
  });

  const handleChange = useCallback(
    (name: string, v: number) => {
      const spec = SLIDERS.find((s) => s.name === name);
      if (!spec) return;
      setProperty(name, clamp(v, spec.min, spec.max));
    },
    [setProperty]
  );

  return (
    <div css={cssStyles} className="exposure-body" data-bespoke-body="Exposure">
      <HandleColumn id={id} properties={imageProperty} />
      <div className="preview-area">
        <ImagePreview value={previewValue} />
      </div>

      <div className="controls">
        {SLIDERS.map((spec) => {
          const raw = Number(props[spec.name] ?? 0);
          const value = clamp(raw, spec.min, spec.max);
          return (
            <TonalSlider
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

export const ExposureBody = memo(ExposureBodyInner);
ExposureBody.displayName = "ExposureBody";

export { EXPOSURE_NODE_TYPE };
export default ExposureBody;
