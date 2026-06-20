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

import { CheckerDropzone, BORDER_RADIUS } from "../../ui_primitives";
import HandleColumn from "../../node/HandleColumn";
import ImageRefPreview from "../../node/ImageRefPreview";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";

import type { NodeMetadata, Property } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import { useLiveSliderWriter } from "../../../hooks/nodes/useLiveSliderWriter";
import { useNodeOutput } from "../../../hooks/nodes/useNodeIO";
import {
  AdjustmentSlider,
  adjustmentSliderStyles,
  clamp,
  type SliderSpec
} from "./AdjustmentSlider";

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
      flex: "0 0 auto",
      display: "grid",
      gridTemplateColumns: "minmax(52px, auto) 1fr auto",
      alignItems: "center",
      columnGap: theme.spacing(1.5),
      rowGap: theme.spacing(1),
      padding: `${theme.spacing(1)} ${theme.spacing(1)} ${theme.spacing(1)}`
    },
    ".outputs-row": {
      flex: "0 0 auto"
    }
  });

const humanize = (name: string): string =>
  name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

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
  const cssStyles = useMemo(
    () => [styles(theme), adjustmentSliderStyles(theme)],
    [theme]
  );

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
