/** @jsxImportSource @emotion/react */
/**
 * AdjustmentBody — generic bespoke body for slider-only image adjustment nodes
 * (Brightness/Contrast, HSB, Saturation/Vibrance, Color Balance, Vignette,
 * Exposure, …).
 *
 * Preview on top, one slider per numeric property below. Unlike the per-node
 * bodies (Curves, Levels, …) nothing here is hardcoded: the image/mask handles
 * and every slider's range, default and step are derived from
 * `nodeMetadata.properties`. Registered for the node types in
 * `ADJUSTMENT_NODE_TYPES`.
 *
 * Bipolar sliders (range straddling 0, neutral at 0 — temperature, tint,
 * exposure, …) fill outward from the centre so the control reads as a signed
 * adjustment, not a 0–100% level. The preview reflects whatever the server
 * most recently produced — no client-side approximation.
 */

import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ImageIcon from "@mui/icons-material/Image";

import { CheckerDropzone, NodeSlider } from "../../ui_primitives";
import HandleColumn from "../../node/HandleColumn";
import ImageRefPreview from "../../node/ImageRefPreview";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";

import type { NodeMetadata, Property } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import { useLiveSliderWriter } from "../../../hooks/nodes/useLiveSliderWriter";
import { useNodeOutput } from "../../../hooks/nodes/useNodeIO";

const TRACK_HEIGHT = 4;
const THUMB_SIZE = 12;

const styles = (theme: Theme) =>
  css({
    "&.adjustment-body": {
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
      gridTemplateColumns: "minmax(52px, auto) 1fr auto",
      alignItems: "center",
      columnGap: theme.spacing(1.25),
      rowGap: theme.spacing(0.75),
      padding: `${theme.spacing(0.75)} ${theme.spacing(1)} ${theme.spacing(1)}`
    },
    ".ctrl-label": {
      fontSize: theme.fontSizeSmaller,
      fontWeight: 500,
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.045em",
      lineHeight: 1,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    },
    // Wraps the slider so the centre tick + bipolar fill can be positioned
    // over the rail. Zero vertical jitter: the slider's rail sits at 50%.
    ".slider-wrap": {
      position: "relative",
      display: "flex",
      alignItems: "center",
      width: "100%",
      height: 16
    },
    ".slider-wrap .center-tick": {
      position: "absolute",
      top: "50%",
      transform: "translate(-50%, -50%)",
      width: 2,
      height: 9,
      borderRadius: 1,
      backgroundColor: theme.vars.palette.grey[600],
      pointerEvents: "none",
      zIndex: 0
    },
    ".slider-wrap .bipolar-fill": {
      position: "absolute",
      top: "50%",
      transform: "translateY(-50%)",
      height: TRACK_HEIGHT,
      borderRadius: TRACK_HEIGHT / 2,
      backgroundColor: theme.vars.palette.primary.main,
      pointerEvents: "none",
      zIndex: 1
    },
    ".ctrl-value": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      fontVariantNumeric: "tabular-nums",
      color: theme.vars.palette.text.primary,
      minWidth: 46,
      textAlign: "right",
      lineHeight: 1,
      padding: "3px 6px",
      borderRadius: "var(--rounded-sm)",
      backgroundColor: theme.vars.palette.grey[800]
    },
    // Slider polish — rounded rail/track, ring-style thumb. Scoped here so the
    // app's square editor sliders elsewhere are untouched.
    ".controls .MuiSlider-root": {
      padding: 0,
      margin: 0
    },
    ".controls .MuiSlider-rail": {
      height: TRACK_HEIGHT,
      borderRadius: TRACK_HEIGHT / 2,
      opacity: 1,
      backgroundColor: theme.vars.palette.grey[700]
    },
    ".controls .MuiSlider-track": {
      height: TRACK_HEIGHT,
      borderRadius: TRACK_HEIGHT / 2,
      border: "none",
      backgroundColor: theme.vars.palette.primary.main
    },
    // backgroundColor is left to NodeSlider (grey when neutral, primary when
    // changed) so an unchanged thumb reads as a ring and a changed one fills in.
    ".controls .MuiSlider-thumb": {
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      borderRadius: "50%",
      border: `2px solid ${theme.vars.palette.primary.main}`,
      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.45)",
      "&:hover, &.Mui-focusVisible, &.Mui-active": {
        boxShadow: `0 0 0 6px color-mix(in srgb, ${theme.vars.palette.primary.main} 20%, transparent)`
      }
    }
  });

interface SliderSpec {
  name: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  /** Range straddles 0 with a neutral midpoint — fill outward from centre. */
  bipolar: boolean;
}

const humanize = (name: string): string =>
  name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

const isNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/**
 * Derive the slider specs from the node's numeric (`float` / `int`) properties.
 * Image-typed properties become handles instead (see `imageProps`).
 */
const toSliderSpecs = (properties: Property[]): SliderSpec[] =>
  properties.reduce<SliderSpec[]>((specs, p) => {
    const kind = (p.type as { type?: string } | undefined)?.type;
    if ((kind !== "float" && kind !== "int") || !isNumber(p.min) || !isNumber(p.max)) {
      return specs;
    }
    const isInt = kind === "int";
    specs.push({
      name: p.name,
      label: p.title ?? humanize(p.name),
      min: p.min,
      max: p.max,
      step: isInt ? 1 : 0.01,
      default: isNumber(p.default) ? p.default : 0,
      // Neutral-at-zero with headroom both ways — the signed adjustments.
      bipolar: p.min < 0 && p.max > 0
    });
    return specs;
  }, []);

const formatValue = (spec: SliderSpec, value: number): string => {
  if (spec.step >= 1) {
    return String(Math.round(value));
  }
  const sign = spec.bipolar && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
};

/** Fraction 0..1 of where `value` sits in `[min, max]`. */
const fraction = (spec: SliderSpec, value: number): number =>
  spec.max === spec.min ? 0 : (value - spec.min) / (spec.max - spec.min);

const AdjustmentSlider: React.FC<{
  spec: SliderSpec;
  value: number;
  onChange: (name: string, v: number) => void;
  onCommit: () => void;
}> = ({ spec, value, onChange, onCommit }) => {
  const handleChange = useCallback(
    (_: Event, v: number | number[]) => {
      const next = Array.isArray(v) ? v[0] : v;
      const rounded = spec.step >= 1 ? Math.round(next) : Math.round(next * 100) / 100;
      onChange(spec.name, rounded);
    },
    [onChange, spec.name, spec.step]
  );

  // Centre fill geometry (bipolar only): from the neutral point (where 0 sits)
  // out to the thumb. Slider padding is 0, so rail spans 0–100% and these
  // percentages line up with the thumb.
  const centreFrac = clamp(fraction(spec, 0), 0, 1);
  const valueFrac = clamp(fraction(spec, value), 0, 1);
  const fillLeft = Math.min(centreFrac, valueFrac) * 100;
  const fillWidth = Math.abs(valueFrac - centreFrac) * 100;

  return (
    <>
      <span className="ctrl-label">{spec.label}</span>
      <span className={`slider-wrap${spec.bipolar ? " is-bipolar" : ""}`}>
        {spec.bipolar && (
          <>
            <span className="center-tick" style={{ left: `${centreFrac * 100}%` }} />
            <span
              className="bipolar-fill"
              style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }}
            />
          </>
        )}
        <NodeSlider
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={value}
          changed={value !== spec.default}
          // Native fill hidden for bipolar — the centre fill replaces it.
          track={spec.bipolar ? false : "normal"}
          onChange={handleChange}
          onChangeCommitted={onCommit}
          aria-label={`${spec.label} adjustment`}
        />
      </span>
      <span className="ctrl-value">{formatValue(spec, value)}</span>
    </>
  );
};

export interface AdjustmentBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const AdjustmentBodyInner: React.FC<AdjustmentBodyProps> = ({
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
  const imageProps = useMemo(
    () =>
      properties.filter(
        (p) => (p.type as { type?: string } | undefined)?.type === "image"
      ),
    [properties]
  );
  const sliders = useMemo(() => toSliderSpecs(properties), [properties]);

  const props = data.properties ?? {};
  const previewValue = useNodeOutput(workflowId, id);

  const { setProperty, setPropertyComplete } = useLiveSliderWriter({
    nodeId: id,
    nodeType
  });

  const handleChange = useCallback(
    (name: string, v: number) => {
      const spec = sliders.find((s) => s.name === name);
      if (!spec) return;
      setProperty(name, clamp(v, spec.min, spec.max));
    },
    [setProperty, sliders]
  );

  return (
    <div css={cssStyles} className="adjustment-body" data-bespoke-body="Adjustment">
      <HandleColumn id={id} properties={imageProps} />
      <div className="preview-area">
        <ImageRefPreview
          value={previewValue}
          placeholder={
            <CheckerDropzone
              message="Connect an image, then run"
              icon={<ImageIcon />}
            />
          }
        />
      </div>

      <div className="controls">
        {sliders.map((spec) => {
          const raw = Number(props[spec.name] ?? spec.default);
          const value = clamp(isNumber(raw) ? raw : spec.default, spec.min, spec.max);
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

export const AdjustmentBody = memo(AdjustmentBodyInner);
AdjustmentBody.displayName = "AdjustmentBody";

export default AdjustmentBody;
