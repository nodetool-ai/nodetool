/** @jsxImportSource @emotion/react */
/**
 * CanvasResizeBody — bespoke body for `nodetool.image.CanvasResize`.
 *
 * Preview with dashed overlay showing source placement on the expanded canvas.
 * Mode toggle switches between fixed, scale, and padding controls.
 */

import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ImageIcon from "@mui/icons-material/Image";

import {
  CheckerDropzone,
  FlexColumn,
  FlexRow,
  NodeSlider,
  ToggleGroup,
  ToggleOption, BORDER_RADIUS } from "../../ui_primitives";
import HandleColumn from "../../node/HandleColumn";
import ImageView from "../../node/ImageView";
import ImageRefPreview from "../../node/ImageRefPreview";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";
import NumberInput from "../../inputs/NumberInput";

import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import { useBespokePropertyWriter } from "../../../hooks/nodes/useBespokePropertyWriter";
import { useNodeOutput, useUpstreamValue } from "../../../hooks/nodes/useNodeIO";
import { asImageRef } from "../../../utils/imageRef";
import { CANVAS_RESIZE_NODE_TYPE } from "../../../constants/nodeTypes";

type CanvasMode = "fixed" | "scale" | "padding";
type PaddingUnit = "px" | "percent";

const styles = (theme: Theme) =>
  css({
    "&.canvas-resize-body": {
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
      overflow: "hidden",
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
        maxWidth: "100%",
        maxHeight: "100%",
        objectFit: "contain"
      },
      ".overlay-rect": {
        position: "absolute",
        boxSizing: "border-box",
        border: `1px dashed ${theme.vars.palette.primary.main}`,
        background: `color-mix(in srgb, ${theme.vars.palette.primary.main} 12%, transparent)`,
        pointerEvents: "none"
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
    ".mode-row": {
      flex: "0 0 auto"
    },
    ".controls-row": {
      flex: "0 0 auto",
      display: "flex",
      flexWrap: "wrap",
      alignItems: "flex-end",
      gap: theme.spacing(0.5)
    },
    ".field": {
      flex: "1 1 45%",
      minWidth: 72
    },
    ".outputs-row": {
      flex: "0 0 auto"
    }
  });

function toPx(val: number, dim: number, unit: PaddingUnit): number {
  return unit === "percent"
    ? Math.max(0, Math.round((dim * val) / 100))
    : Math.max(0, Math.floor(val));
}

function computeLayout(
  srcW: number,
  srcH: number,
  mode: CanvasMode,
  props: Record<string, unknown>
): { canvasW: number; canvasH: number; offsetX: number; offsetY: number } {
  if (mode === "fixed") {
    const canvasW = Math.max(1, Math.floor(Number(props.width ?? srcW)));
    const canvasH = Math.max(1, Math.floor(Number(props.height ?? srcH)));
    return {
      canvasW,
      canvasH,
      offsetX: Math.floor((canvasW - srcW) / 2),
      offsetY: Math.floor((canvasH - srcH) / 2)
    };
  }
  if (mode === "scale") {
    const scale = Number(props.scale ?? 0) > 0 ? Number(props.scale ?? 1) : 1;
    const canvasW = Math.max(1, Math.round(srcW * scale));
    const canvasH = Math.max(1, Math.round(srcH * scale));
    return {
      canvasW,
      canvasH,
      offsetX: Math.floor((canvasW - srcW) / 2),
      offsetY: Math.floor((canvasH - srcH) / 2)
    };
  }
  const unit = (String(props.padding_unit ?? "px") as PaddingUnit) || "px";
  const left = toPx(Number(props.left ?? 0), srcW, unit);
  const right = toPx(Number(props.right ?? 0), srcW, unit);
  const top = toPx(Number(props.top ?? 0), srcH, unit);
  const bottom = toPx(Number(props.bottom ?? 0), srcH, unit);
  return {
    canvasW: Math.max(1, srcW + left + right),
    canvasH: Math.max(1, srcH + top + bottom),
    offsetX: left,
    offsetY: top
  };
}

const PreviewImage: React.FC<{ value: unknown }> = ({ value }) => (
  <ImageRefPreview
    value={value}
    placeholder={
      <CheckerDropzone message="Connect an image, then run" icon={<ImageIcon />} />
    }
  />
);

export interface CanvasResizeBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const CanvasResizeBodyInner: React.FC<CanvasResizeBodyProps> = ({
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
  const mode = (String(props.mode ?? "padding") as CanvasMode) || "padding";
  const paddingUnit = (String(props.padding_unit ?? "px") as PaddingUnit) || "px";

  const previewValue = useNodeOutput(workflowId, id);
  const sourceValue = useUpstreamValue(workflowId, id, "image", props.image);
  const sourceRef = useMemo(() => asImageRef(sourceValue), [sourceValue]);
  const previewRef = useMemo(() => asImageRef(previewValue), [previewValue]);

  const badgeDims = useMemo(() => {
    const w = previewRef?.width;
    const h = previewRef?.height;
    if (w && h) return { width: w, height: h };
    const srcW = sourceRef?.width;
    const srcH = sourceRef?.height;
    if (!srcW || !srcH) return undefined;
    const layout = computeLayout(srcW, srcH, mode, props);
    return { width: layout.canvasW, height: layout.canvasH };
  }, [previewRef?.width, previewRef?.height, sourceRef?.width, sourceRef?.height, mode, props]);

  const overlayRect = useMemo(() => {
    const srcW = sourceRef?.width;
    const srcH = sourceRef?.height;
    if (!srcW || !srcH) return undefined;
    const { canvasW, canvasH, offsetX, offsetY } = computeLayout(
      srcW,
      srcH,
      mode,
      props
    );
    if (canvasW <= 0 || canvasH <= 0) return undefined;
    return {
      leftPct: (offsetX / canvasW) * 100,
      topPct: (offsetY / canvasH) * 100,
      widthPct: (srcW / canvasW) * 100,
      heightPct: (srcH / canvasH) * 100
    };
  }, [sourceRef?.width, sourceRef?.height, mode, props]);

  const { setProperties, setPropertyComplete } = useBespokePropertyWriter({
    nodeId: id,
    nodeType
  });

  const handleModeChange = useCallback(
    (_: React.MouseEvent<HTMLElement>, value: CanvasMode | null) => {
      if (value) setProperties({ mode: value });
    },
    [setProperties]
  );

  const handlePaddingUnitChange = useCallback(
    (_: React.MouseEvent<HTMLElement>, value: PaddingUnit | null) => {
      if (value) setProperties({ padding_unit: value });
    },
    [setProperties]
  );

  const setNumberProp = useCallback(
    (name: string, value: number) => {
      setProperties({ [name]: value });
    },
    [setProperties]
  );

  return (
    <div css={cssStyles} className="canvas-resize-body" data-bespoke-body="CanvasResize">
      <div className="preview-area">
        <PreviewImage value={previewValue ?? sourceValue} />
        {overlayRect && (
          <div
            className="overlay-rect"
            style={{
              left: `${overlayRect.leftPct}%`,
              top: `${overlayRect.topPct}%`,
              width: `${overlayRect.widthPct}%`,
              height: `${overlayRect.heightPct}%`
            }}
          />
        )}
        {badgeDims && (
          <span className="dimensions-badge">
            {badgeDims.width} × {badgeDims.height}
          </span>
        )}
        <HandleColumn id={id} properties={imageProperty} />
      </div>

      <FlexColumn className="mode-row" gap={0.5}>
        <ToggleGroup
          value={mode}
          exclusive
          onChange={handleModeChange}
          fullWidth
          compact
          size="small"
        >
          <ToggleOption value="fixed">Fixed</ToggleOption>
          <ToggleOption value="scale">Scale</ToggleOption>
          <ToggleOption value="padding">Padding</ToggleOption>
        </ToggleGroup>

        {mode === "fixed" && (
          <FlexRow className="controls-row" align="flex-end" gap={0.5}>
            <div className="field">
              <NumberInput
                id={`canvas-width-${id}`}
                nodeId={id}
                name="width"
                description="Target canvas width"
                value={Number(props.width ?? 512)}
                onChange={(_, v) => setNumberProp("width", Math.max(1, Math.round(v)))}
                onChangeComplete={() => setPropertyComplete()}
                min={1}
                max={8192}
                inputType="int"
                showSlider={false}
              />
            </div>
            <div className="field">
              <NumberInput
                id={`canvas-height-${id}`}
                nodeId={id}
                name="height"
                description="Target canvas height"
                value={Number(props.height ?? 512)}
                onChange={(_, v) => setNumberProp("height", Math.max(1, Math.round(v)))}
                onChangeComplete={() => setPropertyComplete()}
                min={1}
                max={8192}
                inputType="int"
                showSlider={false}
              />
            </div>
          </FlexRow>
        )}

        {mode === "scale" && (
          <div className="controls-row">
            <NodeSlider
              min={0.01}
              max={4}
              step={0.01}
              value={Number(props.scale ?? 1.25)}
              onChange={(_, v) => {
                const next = Array.isArray(v) ? v[0] : v;
                setNumberProp("scale", Math.round(next * 100) / 100);
              }}
              onChangeCommitted={() => setPropertyComplete()}
              aria-label="Canvas scale factor"
            />
          </div>
        )}

        {mode === "padding" && (
          <FlexColumn gap={0.5}>
            <ToggleGroup
              value={paddingUnit}
              exclusive
              onChange={handlePaddingUnitChange}
              compact
              size="small"
            >
              <ToggleOption value="px">px</ToggleOption>
              <ToggleOption value="percent">%</ToggleOption>
            </ToggleGroup>
            <FlexRow className="controls-row" align="flex-end" gap={0.5}>
              {(["top", "bottom", "left", "right"] as const).map((edge) => (
                <div className="field" key={edge}>
                  <NumberInput
                    id={`canvas-${edge}-${id}`}
                    nodeId={id}
                    name={edge}
                    description={`Padding ${edge}`}
                    value={Number(props[edge] ?? 0)}
                    onChange={(_, v) => setNumberProp(edge, Math.max(0, v))}
                    onChangeComplete={() => setPropertyComplete()}
                    min={0}
                    max={4096}
                    inputType="float"
                    showSlider={false}
                  />
                </div>
              ))}
            </FlexRow>
          </FlexColumn>
        )}
      </FlexColumn>

      {!isOutputNode && (
        <div className="outputs-row">
          <NodeOutputs id={id} outputs={nodeMetadata.outputs} />
        </div>
      )}

      {status === "running" && <NodeProgress id={id} workflowId={workflowId} />}
    </div>
  );
};

const CanvasResizeBody = memo(CanvasResizeBodyInner);
CanvasResizeBody.displayName = "CanvasResizeBody";

export { CANVAS_RESIZE_NODE_TYPE };
export default CanvasResizeBody;