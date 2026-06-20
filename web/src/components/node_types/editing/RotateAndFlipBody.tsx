/** @jsxImportSource @emotion/react */
/**
 * RotateAndFlipBody — bespoke body for `nodetool.image.RotateAndFlip`
 * (plan §9.E7, PR 10).
 *
 * Top: preview of the server output. Bottom: free-rotate slider
 * (0/90/180/270 snap marks), Flip H and Flip V toggles, Reset.
 */

import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ImageIcon from "@mui/icons-material/Image";
import FlipIcon from "@mui/icons-material/Flip";
import RestartAltIcon from "@mui/icons-material/RestartAlt";

import {
  CheckerDropzone,
  FlexColumn,
  FlexRow,
  NodeSlider,
  StateIconButton, BORDER_RADIUS } from "../../ui_primitives";
import HandleColumn from "../../node/HandleColumn";
import ImageRefPreview from "../../node/ImageRefPreview";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";

import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import { useBespokePropertyWriter } from "../../../hooks/nodes/useBespokePropertyWriter";
import { useNodeOutput } from "../../../hooks/nodes/useNodeIO";
import { ROTATE_AND_FLIP_NODE_TYPE } from "../../../constants/nodeTypes";

// 90° snap marks across the slider's full -360..360 range. Material UI's
// `Slider` shows ticks for `marks`; the user can still drag freely between.
const ANGLE_MARKS = [
  { value: -360, label: "-360" },
  { value: -270 },
  { value: -180 },
  { value: -90 },
  { value: 0, label: "0" },
  { value: 90 },
  { value: 180 },
  { value: 270 },
  { value: 360, label: "360" }
];

const styles = (theme: Theme) =>
  css({
    "&.rotate-flip-body": {
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
      paddingTop: theme.spacing(0.5)
    },
    ".angle-row": {
      paddingLeft: theme.spacing(0.5),
      paddingRight: theme.spacing(0.5)
    },
    ".angle-readout": {
      flex: "0 0 auto",
      minWidth: 48,
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.secondary,
      textAlign: "right"
    },
    ".action-row": {
      paddingTop: theme.spacing(0.5)
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

export interface RotateAndFlipBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const RotateAndFlipBodyInner: React.FC<RotateAndFlipBodyProps> = ({
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
  const angle = Number(props.angle ?? 0);
  const flipH = !!props.flip_horizontal;
  const flipV = !!props.flip_vertical;

  const previewValue = useNodeOutput(workflowId, id);

  const { setProperty, setProperties, setPropertyComplete } =
    useBespokePropertyWriter({ nodeId: id, nodeType });

  const handleAngleChange = useCallback(
    (_: Event, v: number | number[]) => {
      const next = Array.isArray(v) ? v[0] : v;
      setProperty("angle", Math.round(next));
    },
    [setProperty]
  );

  const handleAngleCommitted = useCallback(() => setPropertyComplete(), [
    setPropertyComplete
  ]);

  const toggleFlipH = useCallback(() => {
    setProperties({ flip_horizontal: !flipH });
    setPropertyComplete();
  }, [flipH, setProperties, setPropertyComplete]);

  const toggleFlipV = useCallback(() => {
    setProperties({ flip_vertical: !flipV });
    setPropertyComplete();
  }, [flipV, setProperties, setPropertyComplete]);

  const handleReset = useCallback(() => {
    setProperties({ angle: 0, flip_horizontal: false, flip_vertical: false });
    setPropertyComplete();
  }, [setProperties, setPropertyComplete]);

  return (
    <div
      css={cssStyles}
      className="rotate-flip-body"
      data-bespoke-body="RotateAndFlip"
    >
      <HandleColumn id={id} properties={imageProperty} />
      <div className="preview-area">
        <ImagePreview value={previewValue} />
      </div>

      <FlexColumn className="controls" gap={0.5}>
        <FlexRow className="angle-row" align="center" gap={0.5}>
          <NodeSlider
            min={-360}
            max={360}
            step={1}
            marks={ANGLE_MARKS}
            value={angle}
            onChange={handleAngleChange}
            onChangeCommitted={handleAngleCommitted}
            aria-label="Rotation angle"
          />
          <span className="angle-readout">{Math.round(angle)}°</span>
        </FlexRow>
        <FlexRow className="action-row" align="center" justify="space-between" gap={0.5}>
          <FlexRow align="center" gap={0.5}>
            <StateIconButton
              size="small"
              isActive={flipH}
              icon={<FlipIcon fontSize="small" />}
              activeIcon={<FlipIcon fontSize="small" />}
              tooltip="Flip horizontally"
              ariaLabel="Flip horizontally"
              onClick={toggleFlipH}
            />
            <StateIconButton
              size="small"
              isActive={flipV}
              icon={
                <FlipIcon
                  fontSize="small"
                  style={{ transform: "rotate(90deg)" }}
                />
              }
              activeIcon={
                <FlipIcon
                  fontSize="small"
                  style={{ transform: "rotate(90deg)" }}
                />
              }
              tooltip="Flip vertically"
              ariaLabel="Flip vertically"
              onClick={toggleFlipV}
            />
          </FlexRow>
          <StateIconButton
            size="small"
            icon={<RestartAltIcon fontSize="small" />}
            tooltip="Reset rotation and flips"
            ariaLabel="Reset rotation and flips"
            onClick={handleReset}
          />
        </FlexRow>
      </FlexColumn>

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

export const RotateAndFlipBody = memo(RotateAndFlipBodyInner);
RotateAndFlipBody.displayName = "RotateAndFlipBody";

export { ROTATE_AND_FLIP_NODE_TYPE };
export default RotateAndFlipBody;
