/** @jsxImportSource @emotion/react */
/**
 * GeneratorBody — bespoke body for image generator nodes that produce images
 * but take NO image input (gradient fills, checkerboard, noise, etc.).
 *
 * Layout:
 *   - Preview area (ImageRefPreview with "Run to preview" placeholder)
 *   - Color pickers (one row per `color`-typed property)
 *   - Sliders grid (one row per `float`/`int` property with min+max)
 *   - NodeOutputs (when not an output node)
 *   - NodeProgress (when running)
 *
 * All controls are derived from `nodeMetadata.properties`. GaussianNoise's
 * mean / stddev lack min/max in metadata — they are injected via PARAM_OVERRIDES.
 */

import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { CheckerDropzone, FlexRow } from "../../ui_primitives";
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
import ColorPicker from "../../inputs/ColorPicker";

// ---------------------------------------------------------------------------
// Param overrides for nodes whose metadata lacks min/max on some properties
// ---------------------------------------------------------------------------

const PARAM_OVERRIDES: Record<string, Partial<SliderSpec>> = {
  "lib.image.draw.GaussianNoise::mean": {
    min: -1,
    max: 1,
    step: 0.01,
    default: 0,
    bipolar: true
  },
  "lib.image.draw.GaussianNoise::stddev": {
    min: 0,
    max: 3,
    step: 0.01,
    default: 1,
    bipolar: false
  }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const humanize = (name: string): string =>
  name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const isNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

interface ColorSpec {
  name: string;
  label: string;
  default: string;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = (theme: Theme) =>
  css({
    "&.generator-body": {
      position: "relative",
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.5),
      padding: theme.spacing(0.5),
      minHeight: 0
    },
    ".preview-area": {
      position: "relative",
      flex: "1 1 auto",
      minHeight: 160,
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
      padding: `${theme.spacing(0.5)} ${theme.spacing(1)}`,
      flex: "0 0 auto"
    },
    // `.controls` (not a custom name) so the shared adjustmentSliderStyles'
    // MUI overrides (`.controls .MuiSlider-*`) actually apply.
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

// ---------------------------------------------------------------------------
// Exported node types
// ---------------------------------------------------------------------------

export const GENERATOR_NODE_TYPES = [
  "lib.image.draw.LinearGradient",
  "lib.image.draw.RadialGradient",
  "lib.image.draw.AngularGradient",
  "lib.image.draw.DiamondGradient",
  "lib.image.draw.Checkerboard",
  "lib.image.draw.GaussianNoise"
] as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface GeneratorBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const GeneratorBodyInner: React.FC<GeneratorBodyProps> = ({
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
  const props = data.properties ?? {};
  const previewValue = useNodeOutput(workflowId, id);

  const { setProperty, setPropertyComplete } = useLiveSliderWriter({
    nodeId: id,
    nodeType
  });

  // Derive color specs from metadata
  const colorSpecs = useMemo<ColorSpec[]>(
    () =>
      properties
        .filter(
          (p) => (p.type as { type?: string } | undefined)?.type === "color"
        )
        .map((p) => ({
          name: p.name,
          label: p.title ?? humanize(p.name),
          default: String(
            (p.default as { value?: string } | undefined)?.value ?? "#000000"
          )
        })),
    [properties]
  );

  // Derive slider specs from metadata, applying overrides where needed
  const sliderSpecs = useMemo<SliderSpec[]>(
    () =>
      properties.reduce<SliderSpec[]>((acc, p) => {
        const kind = (p.type as { type?: string } | undefined)?.type;
        if (kind !== "float" && kind !== "int") return acc;
        const key = `${nodeType}::${p.name}`;
        const override = PARAM_OVERRIDES[key] ?? {};
        const min = override.min ?? (isNumber(p.min) ? p.min : undefined);
        const max = override.max ?? (isNumber(p.max) ? p.max : undefined);
        if (min === undefined || max === undefined) return acc;
        const isInt = kind === "int";
        acc.push({
          name: p.name,
          label: p.title ?? humanize(p.name),
          min,
          max,
          step: override.step ?? (isInt ? 1 : 0.01),
          default:
            override.default ??
            (isNumber(p.default) ? p.default : 0),
          bipolar: override.bipolar ?? (min < 0 && max > 0)
        });
        return acc;
      }, []),
    [properties, nodeType]
  );

  // Color helpers
  const getColor = useCallback(
    (name: string, fallback: string): string =>
      String(
        (props[name] as { value?: string } | undefined)?.value ?? fallback
      ),
    [props]
  );

  const handleColorChange = useCallback(
    (name: string, newColor: string | null, fallback: string) => {
      setProperty(name, { type: "color", value: newColor ?? fallback });
      setPropertyComplete();
    },
    [setProperty, setPropertyComplete]
  );

  // Slider handler
  const handleSliderChange = useCallback(
    (name: string, v: number) => {
      const spec = sliderSpecs.find((s) => s.name === name);
      if (!spec) return;
      setProperty(name, clamp(v, spec.min, spec.max));
    },
    [setProperty, sliderSpecs]
  );

  return (
    <div css={cssStyles} className="generator-body" data-bespoke-body="Generator">
      <div className="preview-area">
        <ImageRefPreview
          value={previewValue}
          placeholder={
            <CheckerDropzone message="Run to preview" />
          }
        />
      </div>

      {colorSpecs.map((spec) => (
        <FlexRow
          key={spec.name}
          className="color-row"
          align="center"
          justify="space-between"
        >
          <span className="ctrl-label">{spec.label}</span>
          <ColorPicker
            color={getColor(spec.name, spec.default)}
            onColorChange={(v) =>
              handleColorChange(spec.name, v, spec.default)
            }
            showCustom
            isNodeProperty
          />
        </FlexRow>
      ))}

      <div className="controls">
        {sliderSpecs.map((spec) => {
          const raw = Number(props[spec.name] ?? spec.default);
          const value = clamp(
            Number.isFinite(raw) ? raw : spec.default,
            spec.min,
            spec.max
          );
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

export const GeneratorBody = memo(GeneratorBodyInner);
GeneratorBody.displayName = "GeneratorBody";

export default GeneratorBody;
