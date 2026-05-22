/** @jsxImportSource @emotion/react */
/**
 * LayerTransformFields — numeric transform controls for the selected layer.
 *
 * Mirrors the canvas gizmo: position (X/Y of the layer center, canvas px),
 * scale (per axis), and rotation (degrees). Editing here and dragging on the
 * canvas write the same transform.
 */

import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { Caption, FlexColumn, FlexRow } from "../ui_primitives";
import NumberInput from "../inputs/NumberInput";
import type { LayerTransform2D } from "./types";

const DEG = 180 / Math.PI;

/** Round to 2 decimals for display so scale fields don't show raw float noise. */
const round2 = (v: number): number => Math.round(v * 100) / 100;

const styles = (theme: Theme) =>
  css({
    "&.transform-fields": {
      gap: theme.spacing(0.5)
    },
    ".field": {
      flex: 1,
      minWidth: 0
    },
    ".field-label": {
      color: theme.vars.palette.text.secondary,
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      marginBottom: 2
    }
  });

export interface LayerTransformFieldsProps {
  transform: LayerTransform2D;
  onChange: (transform: LayerTransform2D, complete: boolean) => void;
}

const LayerTransformFieldsInner: React.FC<LayerTransformFieldsProps> = ({
  transform,
  onChange
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  const patch = useCallback(
    (next: Partial<LayerTransform2D>, complete: boolean) =>
      onChange({ ...transform, ...next }, complete),
    [transform, onChange]
  );

  const field = (
    label: string,
    name: string,
    value: number,
    apply: (v: number) => Partial<LayerTransform2D>,
    opts: { min?: number; max?: number } = {}
  ) => (
    <div className="field">
      <div className="field-label">{label}</div>
      <NumberInput
        id={`compositor-transform-${name}`}
        nodeId=""
        name={name}
        description={label}
        value={value}
        min={opts.min}
        max={opts.max}
        size="small"
        color="secondary"
        inputType="float"
        showSlider={false}
        hideLabel
        onChange={(_, v) => patch(apply(v), false)}
        onChangeComplete={(v) => patch(apply(v), true)}
      />
    </div>
  );

  return (
    <FlexColumn css={cssStyles} className="transform-fields">
      <Caption>Transform</Caption>
      <FlexRow gap={0.5}>
        {field("X", "x", Math.round(transform.x), (v) => ({ x: v }))}
        {field("Y", "y", Math.round(transform.y), (v) => ({ y: v }))}
      </FlexRow>
      <FlexRow gap={0.5}>
        {field("Scale X", "scaleX", round2(transform.scaleX), (v) => ({
          scaleX: Math.max(0.02, v)
        }), { min: 0.02, max: 64 })}
        {field("Scale Y", "scaleY", round2(transform.scaleY), (v) => ({
          scaleY: Math.max(0.02, v)
        }), { min: 0.02, max: 64 })}
      </FlexRow>
      <FlexRow gap={0.5}>
        {field(
          "Rotation°",
          "rotation",
          Math.round(transform.rotation * DEG),
          (v) => ({ rotation: (v / DEG) }),
          { min: -360, max: 360 }
        )}
      </FlexRow>
    </FlexColumn>
  );
};

export const LayerTransformFields = memo(LayerTransformFieldsInner);
LayerTransformFields.displayName = "LayerTransformFields";

export default LayerTransformFields;
