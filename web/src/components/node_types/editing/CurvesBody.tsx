/** @jsxImportSource @emotion/react */
/**
 * CurvesBody — bespoke body for `lib.image.color_grading.Curves`.
 *
 * Preview on top, eight sliders organized into two sections:
 *   - Tonal: Black Point, White Point, Shadows, Midtones, Highlights
 *   - RGB Midtones: Red, Green, Blue
 * Plus a reset button that returns every slider to its defaults.
 */

import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ImageIcon from "@mui/icons-material/Image";
import RestartAltIcon from "@mui/icons-material/RestartAlt";

import {
  CheckerDropzone,
  FlexRow,
  NodeSlider,
  StateIconButton
} from "../../ui_primitives";
import HandleColumn from "../../node/HandleColumn";
import ImageView from "../../node/ImageView";
import ImageRefPreview from "../../node/ImageRefPreview";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";

import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import { useBespokePropertyWriter } from "../../../hooks/nodes/useBespokePropertyWriter";
import { useNodeOutput } from "../../../hooks/nodes/useNodeIO";
import { asImageRef } from "../../../utils/imageRef";
import { CURVES_NODE_TYPE } from "../../../constants/nodeTypes";

interface SliderSpec {
  name: string;
  label: string;
  min: number;
  max: number;
  default: number;
}

const TONAL_SLIDERS: ReadonlyArray<SliderSpec> = [
  { name: "black_point", label: "Black Point", min: 0, max: 0.5, default: 0 },
  { name: "white_point", label: "White Point", min: 0.5, max: 1, default: 1 },
  { name: "shadows", label: "Shadows", min: -0.5, max: 0.5, default: 0 },
  { name: "midtones", label: "Midtones", min: -0.5, max: 0.5, default: 0 },
  { name: "highlights", label: "Highlights", min: -0.5, max: 0.5, default: 0 }
];

const RGB_SLIDERS: ReadonlyArray<SliderSpec> = [
  { name: "red_midtones", label: "Red", min: -0.5, max: 0.5, default: 0 },
  { name: "green_midtones", label: "Green", min: -0.5, max: 0.5, default: 0 },
  { name: "blue_midtones", label: "Blue", min: -0.5, max: 0.5, default: 0 }
];

const ALL_SLIDERS: ReadonlyArray<SliderSpec> = [...TONAL_SLIDERS, ...RGB_SLIDERS];

const styles = (theme: Theme) =>
  css({
    "&.curves-body": {
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
    ".section": {
      flex: "0 0 auto",
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.5)
    },
    ".section-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: `${theme.spacing(0.5)} ${theme.spacing(1)}`
    },
    ".section-title": {
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      lineHeight: 1
    },
    ".controls": {
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
    ".ctrl-label.red": { color: theme.vars.palette.error.main },
    ".ctrl-label.green": { color: theme.vars.palette.success.main },
    ".ctrl-label.blue": { color: theme.vars.palette.info.main },
    ".ctrl-value": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.primary,
      minWidth: 40,
      textAlign: "right",
      lineHeight: 1
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

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

const formatValue = (spec: SliderSpec, v: number): string => {
  // Black/white points are absolute levels (0..1); show plain. Other sliders
  // are signed deltas; show with explicit sign so users can read "+0.10".
  if (spec.name === "black_point" || spec.name === "white_point") {
    return v.toFixed(2);
  }
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}`;
};

const channelClass = (name: string): string => {
  if (name === "red_midtones") return "red";
  if (name === "green_midtones") return "green";
  if (name === "blue_midtones") return "blue";
  return "";
};

interface CurvesSliderProps {
  spec: SliderSpec;
  value: number;
  onChange: (name: string, v: number) => void;
  onCommit: () => void;
}

const CurvesSlider: React.FC<CurvesSliderProps> = ({
  spec,
  value,
  onChange,
  onCommit
}) => {
  const handleChange = useCallback(
    (_: Event, v: number | number[]) => {
      const next = Array.isArray(v) ? v[0] : v;
      onChange(spec.name, Math.round(next * 100) / 100);
    },
    [onChange, spec.name]
  );
  const cls = channelClass(spec.name);
  return (
    <>
      <span className={`ctrl-label${cls ? ` ${cls}` : ""}`}>{spec.label}</span>
      <NodeSlider
        min={spec.min}
        max={spec.max}
        step={0.01}
        value={value}
        onChange={handleChange}
        onChangeCommitted={onCommit}
        aria-label={`${spec.label} adjustment`}
      />
      <span className="ctrl-value">{formatValue(spec, value)}</span>
    </>
  );
};

export interface CurvesBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const CurvesBodyInner: React.FC<CurvesBodyProps> = ({
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

  const { setProperty, setProperties, setPropertyComplete } =
    useBespokePropertyWriter({ nodeId: id, nodeType });

  const handleChange = useCallback(
    (name: string, v: number) => {
      const spec = ALL_SLIDERS.find((s) => s.name === name);
      if (!spec) return;
      setProperty(name, clamp(v, spec.min, spec.max));
    },
    [setProperty]
  );

  const handleReset = useCallback(() => {
    const defaults: Record<string, unknown> = {};
    for (const s of ALL_SLIDERS) defaults[s.name] = s.default;
    setProperties(defaults);
    setPropertyComplete();
  }, [setProperties, setPropertyComplete]);

  return (
    <div css={cssStyles} className="curves-body" data-bespoke-body="Curves">
      <HandleColumn id={id} properties={imageProperty} />
      <div className="preview-area">
        <ImagePreview value={previewValue} />
      </div>

      <div className="section">
        <FlexRow className="section-header" align="center" justify="space-between">
          <span className="section-title">Tonal</span>
          <StateIconButton
            size="small"
            icon={<RestartAltIcon fontSize="small" />}
            tooltip="Reset all curves"
            ariaLabel="Reset all curves"
            onClick={handleReset}
          />
        </FlexRow>
        <div className="controls">
          {TONAL_SLIDERS.map((spec) => {
            const raw = Number(props[spec.name] ?? spec.default);
            const value = clamp(raw, spec.min, spec.max);
            return (
              <CurvesSlider
                key={spec.name}
                spec={spec}
                value={value}
                onChange={handleChange}
                onCommit={setPropertyComplete}
              />
            );
          })}
        </div>
      </div>

      <div className="section">
        <FlexRow className="section-header" align="center" justify="space-between">
          <span className="section-title">RGB Midtones</span>
        </FlexRow>
        <div className="controls">
          {RGB_SLIDERS.map((spec) => {
            const raw = Number(props[spec.name] ?? spec.default);
            const value = clamp(raw, spec.min, spec.max);
            return (
              <CurvesSlider
                key={spec.name}
                spec={spec}
                value={value}
                onChange={handleChange}
                onCommit={setPropertyComplete}
              />
            );
          })}
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

export const CurvesBody = memo(CurvesBodyInner);
CurvesBody.displayName = "CurvesBody";

export { CURVES_NODE_TYPE };
export default CurvesBody;
