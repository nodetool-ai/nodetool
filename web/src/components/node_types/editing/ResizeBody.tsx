/** @jsxImportSource @emotion/react */
/**
 * ResizeBody — bespoke body for `nodetool.image.Resize` (plan §9.E8, PR 9).
 *
 * Image preview on top (current result or empty checker), W/H number inputs
 * on the bottom with a chain-lock toggle that constrains H when W changes
 * (and vice versa) using the W/H aspect ratio captured when the lock engages.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import LinkIcon from "@mui/icons-material/Link";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import ImageIcon from "@mui/icons-material/Image";

import { CheckerDropzone, FlexRow, StateIconButton, BORDER_RADIUS } from "../../ui_primitives";
import HandleColumn from "../../node/HandleColumn";
import ImageView from "../../node/ImageView";
import ImageRefPreview from "../../node/ImageRefPreview";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";
import NumberInput from "../../inputs/NumberInput";

import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import { useBespokePropertyWriter } from "../../../hooks/nodes/useBespokePropertyWriter";
import { useNodeOutput } from "../../../hooks/nodes/useNodeIO";
import { RESIZE_NODE_TYPE } from "../../../constants/nodeTypes";

const styles = (theme: Theme) =>
  css({
    "&.resize-body": {
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
      borderRadius: BORDER_RADIUS.sm,
      overflow: "visible",
      backgroundColor: theme.vars.palette.grey[900],
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      "& > .handle-column": {
        top: 0,
        bottom: 0,
        left: `calc(${theme.spacing(0)})`
      },
      "& img": {
        display: "block",
        width: "100%",
        height: "100%",
        objectFit: "contain"
      },
      ".dimensions-badge": {
        position: "absolute",
        bottom: theme.spacing(0.5),
        right: theme.spacing(0.5),
        padding: `${theme.spacing(0.5)} ${theme.spacing(1)}`,
        background: "rgba(0,0,0,0.6)",
        color: theme.vars.palette.common.white,
        fontFamily: theme.fontFamily2,
        fontSize: theme.fontSizeSmaller,
        borderRadius: BORDER_RADIUS.sm,
        pointerEvents: "none"
      }
    },
    ".controls-row": {
      flex: "0 0 auto",
      display: "flex",
      alignItems: "flex-end",
      gap: theme.spacing(0.5)
    },
    ".dim-field": {
      flex: "1 1 50%",
      minWidth: 0
    },
    ".outputs-row": {
      flex: "0 0 auto"
    }
  });

const extractDims = (
  value: unknown
): { width?: number; height?: number; uri?: string; data?: unknown } => {
  if (!value || typeof value !== "object") {
    return {};
  }
  const v = value as Record<string, unknown>;
  return {
    width: typeof v.width === "number" ? (v.width as number) : undefined,
    height: typeof v.height === "number" ? (v.height as number) : undefined,
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

export interface ResizeBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const ResizeBodyInner: React.FC<ResizeBodyProps> = ({
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
  // Image input — rendered as a left-edge handle.
  const imageProperty = useMemo(
    () => properties.filter((p) => p.name === "image"),
    [properties]
  );
  const widthProperty = useMemo(
    () => properties.find((p) => p.name === "width"),
    [properties]
  );
  const heightProperty = useMemo(
    () => properties.find((p) => p.name === "height"),
    [properties]
  );

  const widthValue = Number(data.properties?.width ?? widthProperty?.default ?? 512);
  const heightValue = Number(data.properties?.height ?? heightProperty?.default ?? 512);

  const previewValue = useNodeOutput(workflowId, id);
  const previewDims = useMemo(() => extractDims(previewValue), [previewValue]);

  const { setProperties, setPropertyComplete } = useBespokePropertyWriter({
    nodeId: id,
    nodeType
  });

  const [chainLocked, setChainLocked] = useState(false);
  // Aspect captured when the lock engages — kept as a ref so it survives
  // re-renders without re-triggering effects.
  const aspectRef = useRef<number | null>(null);
  useEffect(() => {
    if (chainLocked && aspectRef.current === null && widthValue > 0 && heightValue > 0) {
      aspectRef.current = widthValue / heightValue;
    }
    if (!chainLocked) {
      aspectRef.current = null;
    }
  }, [chainLocked, widthValue, heightValue]);

  const setWidth = useCallback(
    (next: number) => {
      const w = Math.max(1, Math.round(next));
      if (chainLocked && aspectRef.current && aspectRef.current > 0) {
        const h = Math.max(1, Math.round(w / aspectRef.current));
        setProperties({ width: w, height: h });
      } else {
        setProperties({ width: w });
      }
    },
    [chainLocked, setProperties]
  );

  const setHeight = useCallback(
    (next: number) => {
      const h = Math.max(1, Math.round(next));
      if (chainLocked && aspectRef.current && aspectRef.current > 0) {
        const w = Math.max(1, Math.round(h * aspectRef.current));
        setProperties({ width: w, height: h });
      } else {
        setProperties({ height: h });
      }
    },
    [chainLocked, setProperties]
  );

  const handleWidthChange = useCallback(
    (_: React.ChangeEvent<HTMLInputElement> | null, value: number) => setWidth(value),
    [setWidth]
  );
  const handleHeightChange = useCallback(
    (_: React.ChangeEvent<HTMLInputElement> | null, value: number) => setHeight(value),
    [setHeight]
  );

  return (
    <div css={cssStyles} className="resize-body" data-bespoke-body="Resize">
      <div className="preview-area">
        <ImagePreview value={previewValue} />
        {previewDims.width != null && previewDims.height != null && (
          <span className="dimensions-badge">
            {previewDims.width} × {previewDims.height}
          </span>
        )}
        <HandleColumn id={id} properties={imageProperty} />
      </div>

      <FlexRow className="controls-row" align="flex-end" gap={0.5}>
        <div className="dim-field">
          {widthProperty && (
            <NumberInput
              id={`resize-width-${id}`}
              nodeId={id}
              name="width"
              description={widthProperty.description ?? "Target width"}
              value={widthValue}
              min={widthProperty.min ?? 1}
              max={widthProperty.max ?? 8192}
              size="small"
              color="secondary"
              inputType="int"
              showSlider={false}
              onChange={handleWidthChange}
              onChangeComplete={setPropertyComplete}
            />
          )}
        </div>
        <StateIconButton
          size="small"
          isActive={chainLocked}
          icon={<LinkOffIcon fontSize="small" />}
          activeIcon={<LinkIcon fontSize="small" />}
          tooltip={chainLocked ? "Unlock aspect ratio" : "Lock aspect ratio"}
          ariaLabel={chainLocked ? "Unlock aspect ratio" : "Lock aspect ratio"}
          onClick={() => setChainLocked((v) => !v)}
        />
        <div className="dim-field">
          {heightProperty && (
            <NumberInput
              id={`resize-height-${id}`}
              nodeId={id}
              name="height"
              description={heightProperty.description ?? "Target height"}
              value={heightValue}
              min={heightProperty.min ?? 1}
              max={heightProperty.max ?? 8192}
              size="small"
              color="secondary"
              inputType="int"
              showSlider={false}
              onChange={handleHeightChange}
              onChangeComplete={setPropertyComplete}
            />
          )}
        </div>
      </FlexRow>

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

export const ResizeBody = memo(ResizeBodyInner);
ResizeBody.displayName = "ResizeBody";

export { RESIZE_NODE_TYPE };
export default ResizeBody;
