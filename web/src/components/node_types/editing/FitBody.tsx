/** @jsxImportSource @emotion/react */
/**
 * FitBody — bespoke body for `nodetool.image.Fit`.
 *
 * Preview on top with a dimensions badge, W/H number inputs underneath,
 * and a row of common-size presets (256, 512, 768, 1024) that write both
 * dimensions in one commit. Fit's underlying transform is a cover-fit
 * resize, so there is no aspect-ratio toggle — the user is choosing the
 * target frame.
 */

import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ImageIcon from "@mui/icons-material/Image";

import { CheckerDropzone, FlexRow } from "../../ui_primitives";
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
import { asImageRef } from "../../../utils/imageRef";
import { FIT_NODE_TYPE } from "../../../constants/nodeTypes";

const PRESETS: ReadonlyArray<number> = [256, 512, 768, 1024];

const styles = (theme: Theme) =>
  css({
    "&.fit-body": {
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
        borderRadius: "var(--rounded-sm)",
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
    ".presets-row": {
      flex: "0 0 auto",
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.5),
      paddingTop: theme.spacing(0.5),
      paddingLeft: theme.spacing(0.5),
      paddingRight: theme.spacing(0.5)
    },
    ".presets-label": {
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.04em",
      lineHeight: 1
    },
    ".preset-chip": {
      cursor: "pointer",
      padding: `${theme.spacing(0.5)} ${theme.spacing(1)}`,
      borderRadius: "var(--rounded-sm)",
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

const ImagePreview: React.FC<{ value: unknown }> = ({ value }) => (
  <ImageRefPreview
    value={value}
    placeholder={
      <CheckerDropzone message="Connect an image, then run" icon={<ImageIcon />} />
    }
  />
);

export interface FitBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const FitBodyInner: React.FC<FitBodyProps> = ({
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

  const widthValue = Number(
    data.properties?.width ?? widthProperty?.default ?? 512
  );
  const heightValue = Number(
    data.properties?.height ?? heightProperty?.default ?? 512
  );

  const previewValue = useNodeOutput(workflowId, id);
  const previewRef = useMemo(() => asImageRef(previewValue), [previewValue]);

  const { setProperties, setPropertyComplete } = useBespokePropertyWriter({
    nodeId: id,
    nodeType
  });

  const handleWidthChange = useCallback(
    (_: React.ChangeEvent<HTMLInputElement> | null, value: number) => {
      setProperties({ width: Math.max(1, Math.round(value)) });
    },
    [setProperties]
  );
  const handleHeightChange = useCallback(
    (_: React.ChangeEvent<HTMLInputElement> | null, value: number) => {
      setProperties({ height: Math.max(1, Math.round(value)) });
    },
    [setProperties]
  );

  const applyPreset = useCallback(
    (size: number) => {
      setProperties({ width: size, height: size });
      setPropertyComplete();
    },
    [setProperties, setPropertyComplete]
  );

  return (
    <div css={cssStyles} className="fit-body" data-bespoke-body="Fit">
      <div className="preview-area">
        <ImagePreview value={previewValue} />
        {previewRef?.width != null && previewRef.height != null && (
          <span className="dimensions-badge">
            {previewRef.width} × {previewRef.height}
          </span>
        )}
        <HandleColumn id={id} properties={imageProperty} />
      </div>

      <FlexRow className="controls-row" align="flex-end" gap={0.5}>
        <div className="dim-field">
          {widthProperty && (
            <NumberInput
              id={`fit-width-${id}`}
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
        <div className="dim-field">
          {heightProperty && (
            <NumberInput
              id={`fit-height-${id}`}
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

      {!isOutputNode && (
        <div className="outputs-row">
          <NodeOutputs id={id} outputs={nodeMetadata.outputs} />
        </div>
      )}

      {status === "running" && <NodeProgress id={id} workflowId={workflowId} />}
    </div>
  );
};

export const FitBody = memo(FitBodyInner);
FitBody.displayName = "FitBody";

export { FIT_NODE_TYPE };
export default FitBody;
