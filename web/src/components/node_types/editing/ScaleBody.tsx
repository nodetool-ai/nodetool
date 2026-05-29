/** @jsxImportSource @emotion/react */
/**
 * ScaleBody — bespoke body for `nodetool.image.Scale`.
 *
 * Preview on top, single 0–10 scale slider below. The badge shows the
 * resulting dimensions whenever the upstream image carries width/height,
 * so users can preview the geometric effect before running.
 */

import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ImageIcon from "@mui/icons-material/Image";

import { CheckerDropzone } from "../../ui_primitives/CheckerDropzone";
import { NodeSlider } from "../../ui_primitives/NodeSlider";
import HandleColumn from "../../node/HandleColumn";
import ImageView from "../../node/ImageView";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";

import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import { useBespokePropertyWriter } from "../../../hooks/nodes/useBespokePropertyWriter";
import { useNodeOutput } from "../../../hooks/nodes/useNodeIO";

const SCALE_NODE_TYPE = "nodetool.image.Scale";

const styles = (theme: Theme) =>
  css({
    "&.scale-body": {
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
      left: `calc(${theme.spacing(-0.5)})`
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
      },
      ".dimensions-badge": {
        position: "absolute",
        bottom: theme.spacing(0.5),
        right: theme.spacing(0.5),
        padding: `${theme.spacing(0.25)} ${theme.spacing(0.75)}`,
        background: "rgba(0,0,0,0.6)",
        color: theme.vars.palette.common.white,
        fontFamily: theme.fontFamily2,
        fontSize: theme.fontSizeSmaller,
        borderRadius: "var(--rounded-sm)",
        pointerEvents: "none"
      }
    },
    ".controls": {
      flex: "0 0 auto",
      display: "grid",
      gridTemplateColumns: "auto 1fr auto",
      columnGap: theme.spacing(1),
      rowGap: theme.spacing(0.75),
      alignItems: "center",
      padding: `${theme.spacing(0.5)} ${theme.spacing(0.75)} ${theme.spacing(0.25)}`
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
      minWidth: 32,
      textAlign: "right",
      lineHeight: 1
    },
    ".outputs-row": {
      flex: "0 0 auto"
    }
  });

const extractImageRef = (
  value: unknown
): { uri?: string; data?: unknown; width?: number; height?: number } => {
  if (!value || typeof value !== "object") {
    return {};
  }
  const v = value as Record<string, unknown>;
  return {
    uri: typeof v.uri === "string" ? (v.uri as string) : undefined,
    data: v.data,
    width: typeof v.width === "number" ? (v.width as number) : undefined,
    height: typeof v.height === "number" ? (v.height as number) : undefined
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

export interface ScaleBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const SCALE_MIN = 0;
const SCALE_MAX = 10;

const ScaleBodyInner: React.FC<ScaleBodyProps> = ({
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
  const scale = Math.max(
    SCALE_MIN,
    Math.min(SCALE_MAX, Number(props.scale ?? 1))
  );

  const previewValue = useNodeOutput(workflowId, id);
  const previewDims = useMemo(() => extractImageRef(previewValue), [previewValue]);

  const { setProperty, setPropertyComplete } = useBespokePropertyWriter({
    nodeId: id,
    nodeType
  });

  const handleScaleChange = useCallback(
    (_: Event, v: number | number[]) => {
      const next = Array.isArray(v) ? v[0] : v;
      setProperty("scale", Math.round(next * 100) / 100);
    },
    [setProperty]
  );

  const handleScaleCommitted = useCallback(
    () => setPropertyComplete(),
    [setPropertyComplete]
  );

  return (
    <div css={cssStyles} className="scale-body" data-bespoke-body="Scale">
      <HandleColumn id={id} properties={imageProperty} />
      <div className="preview-area">
        <ImagePreview value={previewValue} />
        {previewDims.width != null && previewDims.height != null && (
          <span className="dimensions-badge">
            {previewDims.width} × {previewDims.height}
          </span>
        )}
      </div>

      <div className="controls">
        <span className="ctrl-label">Scale</span>
        <NodeSlider
          min={SCALE_MIN}
          max={SCALE_MAX}
          step={0.1}
          value={scale}
          onChange={handleScaleChange}
          onChangeCommitted={handleScaleCommitted}
          aria-label="Scale factor"
        />
        <span className="ctrl-value">{scale.toFixed(2)}×</span>
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

export const ScaleBody = memo(ScaleBodyInner);
ScaleBody.displayName = "ScaleBody";

export { SCALE_NODE_TYPE };
export default ScaleBody;
