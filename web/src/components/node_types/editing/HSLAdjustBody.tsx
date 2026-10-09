/** @jsxImportSource @emotion/react */
/**
 * HSLAdjustBody — bespoke body for `lib.image.color_grading.HSLAdjust`.
 *
 * Preview on top, a color-range dropdown plus three sliders (hue shift,
 * saturation, luminance) below. Sliders operate on the currently selected
 * color range; switching range leaves slider values intact.
 */

import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ImageIcon from "@mui/icons-material/Image";

import { SPACING,
  CheckerDropzone,
  NodeSlider,
  BORDER_RADIUS,
  MenuItem,
  Select,
  type SelectChangeEvent
} from "../../ui_primitives";
import HandleColumn from "../../node/HandleColumn";
import ImageRefPreview from "../../node/ImageRefPreview";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";

import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import { useBespokePropertyWriter } from "../../../hooks/nodes/useBespokePropertyWriter";
import { useNodeOutput } from "../../../hooks/nodes/useNodeIO";
import { HSL_ADJUST_NODE_TYPE } from "../../../constants/nodeTypes";

const COLOR_RANGES = [
  "all",
  "reds",
  "oranges",
  "yellows",
  "greens",
  "cyans",
  "blues",
  "purples",
  "magentas"
] as const;
type ColorRange = (typeof COLOR_RANGES)[number];

interface SliderSpec {
  name: string;
  label: string;
}

const SLIDERS: ReadonlyArray<SliderSpec> = [
  { name: "hue_shift", label: "Hue" },
  { name: "saturation", label: "Sat" },
  { name: "luminance", label: "Lum" }
];

const styles = (theme: Theme) =>
  css({
    "&.hsl-adjust-body": {
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
      gridTemplateColumns: "minmax(0, auto) minmax(40px, 1fr) auto",
      columnGap: theme.spacing(SPACING.xs),
      rowGap: theme.spacing(SPACING.micro),
      alignItems: "center",
      padding: `${theme.spacing(SPACING.micro)} ${theme.spacing(SPACING.xs)} ${theme.spacing(SPACING.micro)}`
    },
    ".ctrl-label": {
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.secondary,
      letterSpacing: "normal",
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
    ".range-select": {
      gridColumn: "2 / span 2",
      width: "100%",
      fontSize: theme.fontSizeSmaller,
      textTransform: "capitalize",
      ".MuiSelect-select": {
        padding: `${theme.spacing(SPACING.micro)} ${theme.spacing(SPACING.xs)} ${theme.spacing(SPACING.micro)} 0`
      }
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

interface HSLAdjustBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

const HSLAdjustBodyInner: React.FC<HSLAdjustBodyProps> = ({
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
  const rawRange = String(props.color_range ?? "all");
  const colorRange: ColorRange = (COLOR_RANGES as readonly string[]).includes(
    rawRange
  )
    ? (rawRange as ColorRange)
    : "all";

  const previewValue = useNodeOutput(workflowId, id);

  const { setProperty, setPropertyComplete } = useBespokePropertyWriter({
    nodeId: id,
    nodeType
  });

  const handleRangeChange = useCallback(
    (event: SelectChangeEvent<ColorRange>) => {
      setProperty("color_range", event.target.value);
      setPropertyComplete();
    },
    [setProperty, setPropertyComplete]
  );

  const handleSliderChange = useCallback(
    (name: string, v: number) => {
      setProperty(name, clamp1(Math.round(v * 100) / 100));
    },
    [setProperty]
  );

  return (
    <div
      css={cssStyles}
      className="hsl-adjust-body"
      data-bespoke-body="HSLAdjust"
    >
      <HandleColumn id={id} properties={imageProperty} />
      <div className="preview-area">
        <ImagePreview value={previewValue} />
      </div>

      <div className="controls">
        <span className="ctrl-label">Range</span>
        <Select
          className="range-select nodrag"
          size="small"
          variant="standard"
          value={colorRange}
          onChange={handleRangeChange}
          aria-label="Color range"
          disableUnderline
        >
          {COLOR_RANGES.map((r) => (
            <MenuItem key={r} value={r} dense sx={{ textTransform: "capitalize" }}>
              {r}
            </MenuItem>
          ))}
        </Select>

        {SLIDERS.map((spec) => {
          const value = clamp1(Number(props[spec.name] ?? 0));
          return (
            <React.Fragment key={spec.name}>
              <span className="ctrl-label">{spec.label}</span>
              <NodeSlider
                min={-1}
                max={1}
                step={0.01}
                value={value}
                onChange={(_: Event, v: number | number[]) =>
                  handleSliderChange(
                    spec.name,
                    Array.isArray(v) ? v[0] : v
                  )
                }
                onChangeCommitted={setPropertyComplete}
                aria-label={`${spec.label} adjustment`}
              />
              <span className="ctrl-value">
                {value > 0 ? "+" : ""}
                {value.toFixed(2)}
              </span>
            </React.Fragment>
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

export const HSLAdjustBody = memo(HSLAdjustBodyInner);
HSLAdjustBody.displayName = "HSLAdjustBody";

export { HSL_ADJUST_NODE_TYPE };
export default HSLAdjustBody;
