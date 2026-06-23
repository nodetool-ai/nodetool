/** @jsxImportSource @emotion/react */
/**
 * ResizeImageBody — bespoke body for `nodetool.image.ResizeImage`.
 *
 * Unified Scale / Resize / Fit controls behind a mode toggle.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import LinkIcon from "@mui/icons-material/Link";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import ImageIcon from "@mui/icons-material/Image";

import {
  CheckerDropzone,
  FlexRow,
  NodeSlider,
  StateIconButton,
  ToggleGroup,
  ToggleOption, BORDER_RADIUS } from "../../ui_primitives";
import HandleColumn from "../../node/HandleColumn";
import ImageView from "../../node/ImageView";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";
import NumberInput from "../../inputs/NumberInput";

import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import { useBespokePropertyWriter } from "../../../hooks/nodes/useBespokePropertyWriter";
import { useNodeOutput } from "../../../hooks/nodes/useNodeIO";
import { asImageRef } from "../../../utils/imageRef";
import { RESIZE_IMAGE_NODE_TYPE } from "../../../constants/nodeTypes";

type ResizeImageMode = "scale" | "dimensions" | "fit";

const PRESETS: ReadonlyArray<number> = [256, 512, 768, 1024];
const SCALE_MIN = 0.1;
const SCALE_MAX = 10;

const styles = (theme: Theme) =>
  css({
    "&.resize-image-body": {
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
        background: theme.vars.palette.c_scrim,
        color: theme.vars.palette.common.white,
        fontFamily: theme.fontFamily2,
        fontSize: theme.fontSizeSmaller,
        borderRadius: BORDER_RADIUS.sm,
        pointerEvents: "none"
      }
    },
    ".mode-row": {
      flex: "0 0 auto",
      padding: `0 ${theme.spacing(0.5)}`
    },
    ".controls-row": {
      flex: "0 0 auto",
      display: "flex",
      alignItems: "flex-end",
      gap: theme.spacing(0.5)
    },
    ".scale-controls": {
      flex: "0 0 auto",
      display: "grid",
      gridTemplateColumns: "auto 1fr auto",
      columnGap: theme.spacing(1),
      alignItems: "center",
      padding: `0 ${theme.spacing(1)} ${theme.spacing(0.5)}`
    },
    ".ctrl-label": {
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.04em"
    },
    ".ctrl-value": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.primary,
      minWidth: 32,
      textAlign: "right"
    },
    ".dim-field": {
      flex: "1 1 50%",
      minWidth: 0
    },
    ".presets-row": {
      flex: "0 0 auto",
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.5),
      padding: `${theme.spacing(0.5)} ${theme.spacing(0.5)} 0`
    },
    ".presets-label": {
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.04em"
    },
    ".preset-chip": {
      cursor: "pointer",
      padding: `${theme.spacing(0.5)} ${theme.spacing(1)}`,
      borderRadius: BORDER_RADIUS.sm,
      border: `1px solid ${theme.vars.palette.divider}`,
      background: "transparent",
      color: theme.vars.palette.text.primary,
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      lineHeight: 1,
      "&:hover": {
        borderColor: theme.vars.palette.primary.main
      },
      "&.active": {
        borderColor: theme.vars.palette.primary.main,
        color: theme.vars.palette.primary.main
      }
    },
    ".outputs-row": {
      flex: "0 0 auto"
    }
  });

const ImagePreview: React.FC<{ value: unknown }> = ({ value }) => {
  if (typeof value === "string" && value) {
    return <ImageView source={value} />;
  }
  const ref = asImageRef(value);
  if (ref?.uri) {
    return <ImageView source={ref.uri} />;
  }
  if (ref?.data instanceof Uint8Array) {
    return <ImageView source={ref.data} />;
  }
  if (Array.isArray(ref?.data)) {
    return <ImageView source={new Uint8Array(ref!.data as number[])} />;
  }
  return (
    <CheckerDropzone message="Connect an image, then run" icon={<ImageIcon />} />
  );
};

export interface ResizeImageBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const ResizeImageBodyInner: React.FC<ResizeImageBodyProps> = ({
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
  const widthProperty = useMemo(
    () => properties.find((p) => p.name === "width"),
    [properties]
  );
  const heightProperty = useMemo(
    () => properties.find((p) => p.name === "height"),
    [properties]
  );

  const props = data.properties ?? {};
  const mode = (String(props.mode ?? "dimensions") as ResizeImageMode) || "dimensions";
  const scale = Math.max(
    SCALE_MIN,
    Math.min(SCALE_MAX, Number(props.scale ?? 1))
  );
  const widthValue = Number(props.width ?? widthProperty?.default ?? 512);
  const heightValue = Number(props.height ?? heightProperty?.default ?? 512);

  const previewValue = useNodeOutput(workflowId, id);
  const previewRef = useMemo(() => asImageRef(previewValue), [previewValue]);

  const { setProperty, setProperties, setPropertyComplete } = useBespokePropertyWriter({
    nodeId: id,
    nodeType
  });

  const [chainLocked, setChainLocked] = useState(false);
  const aspectRef = useRef<number | null>(null);
  useEffect(() => {
    if (chainLocked && aspectRef.current === null && widthValue > 0 && heightValue > 0) {
      aspectRef.current = widthValue / heightValue;
    }
    if (!chainLocked) {
      aspectRef.current = null;
    }
  }, [chainLocked, widthValue, heightValue]);

  const handleModeChange = useCallback(
    (_: React.MouseEvent<HTMLElement>, value: ResizeImageMode | null) => {
      if (value) {
        setProperty("mode", value);
        setPropertyComplete();
      }
    },
    [setProperty, setPropertyComplete]
  );

  const handleScaleChange = useCallback(
    (_: Event, v: number | number[]) => {
      const raw = Array.isArray(v) ? v[0] : v;
      const next = Math.max(SCALE_MIN, Math.min(SCALE_MAX, raw));
      setProperty("scale", Math.round(next * 100) / 100);
    },
    [setProperty]
  );

  const dimMin = mode === "dimensions" ? 0 : 1;

  const setWidth = useCallback(
    (next: number) => {
      const w = Math.max(dimMin, Math.round(next));
      if (chainLocked && aspectRef.current && aspectRef.current > 0) {
        const h = Math.max(dimMin, Math.round(w / aspectRef.current));
        setProperties({ width: w, height: h });
      } else {
        setProperties({ width: w });
      }
    },
    [chainLocked, dimMin, setProperties]
  );

  const setHeight = useCallback(
    (next: number) => {
      const h = Math.max(dimMin, Math.round(next));
      if (chainLocked && aspectRef.current && aspectRef.current > 0) {
        const w = Math.max(dimMin, Math.round(h * aspectRef.current));
        setProperties({ width: w, height: h });
      } else {
        setProperties({ height: h });
      }
    },
    [chainLocked, dimMin, setProperties]
  );

  const applyPreset = useCallback(
    (size: number) => {
      setProperties({ width: size, height: size });
      setPropertyComplete();
    },
    [setProperties, setPropertyComplete]
  );

  return (
    <div css={cssStyles} className="resize-image-body" data-bespoke-body="ResizeImage">
      <div className="preview-area">
        <ImagePreview value={previewValue} />
        {previewRef?.width != null && previewRef.height != null && (
          <span className="dimensions-badge">
            {previewRef.width} × {previewRef.height}
          </span>
        )}
        <HandleColumn id={id} properties={imageProperty} />
      </div>

      <div className="mode-row">
        <ToggleGroup
          value={mode}
          exclusive
          onChange={handleModeChange}
          aria-label="Resize mode"
        >
          <ToggleOption value="scale">Scale</ToggleOption>
          <ToggleOption value="dimensions">Dimensions</ToggleOption>
          <ToggleOption value="fit">Fit</ToggleOption>
        </ToggleGroup>
      </div>

      {mode === "scale" ? (
        <div className="scale-controls">
          <span className="ctrl-label">Scale</span>
          <NodeSlider
            min={SCALE_MIN}
            max={SCALE_MAX}
            step={0.1}
            value={scale}
            onChange={handleScaleChange}
            onChangeCommitted={setPropertyComplete}
            aria-label="Scale factor"
          />
          <span className="ctrl-value">{scale.toFixed(2)}×</span>
        </div>
      ) : (
        <>
          <FlexRow className="controls-row" align="flex-end" gap={0.5}>
            <div className="dim-field">
              {widthProperty && (
                <NumberInput
                  id={`resize-image-width-${id}`}
                  nodeId={id}
                  name="width"
                  description={widthProperty.description ?? "Target width"}
                  value={widthValue}
                  min={mode === "dimensions" ? 0 : (widthProperty.min ?? 1)}
                  max={widthProperty.max ?? 8192}
                  size="small"
                  color="secondary"
                  inputType="int"
                  showSlider={false}
                  onChange={(_, value) => setWidth(value)}
                  onChangeComplete={setPropertyComplete}
                />
              )}
            </div>
            {mode === "dimensions" && (
              <StateIconButton
                size="small"
                isActive={chainLocked}
                icon={<LinkOffIcon fontSize="small" />}
                activeIcon={<LinkIcon fontSize="small" />}
                tooltip={chainLocked ? "Unlock aspect ratio" : "Lock aspect ratio"}
                ariaLabel={chainLocked ? "Unlock aspect ratio" : "Lock aspect ratio"}
                onClick={() => setChainLocked((v) => !v)}
              />
            )}
            <div className="dim-field">
              {heightProperty && (
                <NumberInput
                  id={`resize-image-height-${id}`}
                  nodeId={id}
                  name="height"
                  description={heightProperty.description ?? "Target height"}
                  value={heightValue}
                  min={mode === "dimensions" ? 0 : (heightProperty.min ?? 1)}
                  max={heightProperty.max ?? 8192}
                  size="small"
                  color="secondary"
                  inputType="int"
                  showSlider={false}
                  onChange={(_, value) => setHeight(value)}
                  onChangeComplete={setPropertyComplete}
                />
              )}
            </div>
          </FlexRow>

          {mode === "fit" && (
            <div className="presets-row">
              <span className="presets-label">Presets</span>
              {PRESETS.map((size) => {
                const active = widthValue === size && heightValue === size;
                return (
                  <button
                    key={size}
                    type="button"
                    className={`preset-chip nodrag${active ? " active" : ""}`}
                    onClick={() => applyPreset(size)}
                    aria-label={`Set ${size} by ${size}`}
                  >
                    {size}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {!isOutputNode && (
        <div className="outputs-row">
          <NodeOutputs id={id} outputs={nodeMetadata.outputs} />
        </div>
      )}

      {status === "running" && <NodeProgress id={id} workflowId={workflowId} />}
    </div>
  );
};

export const ResizeImageBody = memo(ResizeImageBodyInner);
ResizeImageBody.displayName = "ResizeImageBody";

export { RESIZE_IMAGE_NODE_TYPE };
export default ResizeImageBody;
