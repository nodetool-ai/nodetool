/** @jsxImportSource @emotion/react */
/**
 * BlurBody — bespoke body for `nodetool.image.Blur` (plan §9.E4, PR 12).
 *
 * Top: preview of the server output. Bottom: type dropdown (Gaussian /
 * Box / Motion) and a 0–100 size slider. The preview reflects whatever
 * the server most recently produced — no client-side approximation.
 */

import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import type { SelectChangeEvent } from "@mui/material/Select";
import ImageIcon from "@mui/icons-material/Image";

import { CheckerDropzone, NodeSlider, BORDER_RADIUS } from "../../ui_primitives";
import HandleColumn from "../../node/HandleColumn";
import ImageRefPreview from "../../node/ImageRefPreview";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";

import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import { useBespokePropertyWriter } from "../../../hooks/nodes/useBespokePropertyWriter";
import { useNodeOutput } from "../../../hooks/nodes/useNodeIO";
import { BLUR_NODE_TYPE } from "../../../constants/nodeTypes";

type BlurType = "gaussian" | "box" | "motion";

const BLUR_TYPES: ReadonlyArray<{ value: BlurType; label: string }> = [
  { value: "gaussian", label: "Gaussian" },
  { value: "box", label: "Box" },
  { value: "motion", label: "Motion" }
];

const styles = (theme: Theme) =>
  css({
    "&.blur-body": {
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
      minHeight: 160,
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
      gridTemplateColumns: "auto 1fr auto",
      columnGap: theme.spacing(1),
      rowGap: theme.spacing(1),
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
      minWidth: 24,
      textAlign: "right",
      lineHeight: 1
    },
    ".type-select": {
      gridColumn: "2 / span 2",
      width: "100%",
      fontSize: theme.fontSizeSmaller,
      ".MuiSelect-select": {
        padding: `${theme.spacing(0.5)} ${theme.spacing(1)} ${theme.spacing(0.5)} 0`
      }
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

const ImagePreview: React.FC<{ value: unknown }> = ({ value }) => (
  <ImageRefPreview
    value={value}
    placeholder={
      <CheckerDropzone message="Connect an image, then run" icon={<ImageIcon />} />
    }
  />
);

export interface BlurBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const BlurBodyInner: React.FC<BlurBodyProps> = ({
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
  const size = Math.max(0, Math.min(100, Number(props.size ?? 0)));
  const rawType = String(props.blur_type ?? "gaussian");
  const blurType: BlurType = (BLUR_TYPES.find((t) => t.value === rawType)
    ?.value ?? "gaussian") as BlurType;

  const previewValue = useNodeOutput(workflowId, id);

  const { setProperty, setPropertyComplete } = useBespokePropertyWriter({
    nodeId: id,
    nodeType
  });

  const handleTypeChange = useCallback(
    (event: SelectChangeEvent<BlurType>) => {
      setProperty("blur_type", event.target.value);
      setPropertyComplete();
    },
    [setProperty, setPropertyComplete]
  );

  const handleSizeChange = useCallback(
    (_: Event, v: number | number[]) => {
      const next = Array.isArray(v) ? v[0] : v;
      setProperty("size", Math.round(next));
    },
    [setProperty]
  );

  const handleSizeCommitted = useCallback(
    () => setPropertyComplete(),
    [setPropertyComplete]
  );

  return (
    <div css={cssStyles} className="blur-body" data-bespoke-body="Blur">
      <HandleColumn id={id} properties={imageProperty} />
      <div className="preview-area">
        <ImagePreview value={previewValue} />
      </div>

      <div className="controls">
        <span className="ctrl-label">Type</span>
        <Select
          className="type-select nodrag"
          size="small"
          variant="standard"
          value={blurType}
          onChange={handleTypeChange}
          aria-label="Blur type"
          disableUnderline
        >
          {BLUR_TYPES.map((t) => (
            <MenuItem key={t.value} value={t.value} dense>
              {t.label}
            </MenuItem>
          ))}
        </Select>

        <span className="ctrl-label">Size</span>
        <NodeSlider
          min={0}
          max={100}
          step={1}
          value={size}
          onChange={handleSizeChange}
          onChangeCommitted={handleSizeCommitted}
          aria-label="Blur size"
        />
        <span className="ctrl-value">{Math.round(size)}</span>
      </div>

      {!isOutputNode && (
        <div className="outputs-row">
          <NodeOutputs
            id={id}
            outputs={nodeMetadata.outputs}
          />
        </div>
      )}

      {status === "running" && <NodeProgress id={id} workflowId={workflowId} />}
    </div>
  );
};

export const BlurBody = memo(BlurBodyInner);
BlurBody.displayName = "BlurBody";

export { BLUR_NODE_TYPE };
export default BlurBody;
