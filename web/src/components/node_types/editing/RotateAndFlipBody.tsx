/** @jsxImportSource @emotion/react */
/**
 * RotateAndFlipBody — bespoke body for `nodetool.image.RotateAndFlip`
 * (plan §9.E7, PR 10).
 *
 * Image preview at top with the current transform applied via CSS for
 * instant visual feedback. Bottom: free-rotate slider (0/90/180/270 snap
 * marks), Flip H and Flip V toggles, Reset.
 */

import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ImageIcon from "@mui/icons-material/Image";
import FlipIcon from "@mui/icons-material/Flip";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { shallow } from "zustand/shallow";

import {
  CheckerDropzone,
  FlexColumn,
  FlexRow,
  NodeSlider,
  StateIconButton
} from "../../ui_primitives";
import HandleColumn from "../../node/HandleColumn";
import ImageView from "../../node/ImageView";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";

import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import useResultsStore from "../../../stores/ResultsStore";
import { useBespokePropertyWriter } from "../../../hooks/nodes/useBespokePropertyWriter";

const ROTATE_AND_FLIP_NODE_TYPE = "nodetool.image.RotateAndFlip";

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
      "& > .handle-column": {
        top: 0,
        bottom: 0,
        left: `calc(${theme.spacing(-0.5)})`
      },
      ".transform-wrap": {
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "transform 60ms linear",
        willChange: "transform"
      },
      "& img": {
        display: "block",
        maxWidth: "100%",
        maxHeight: "100%",
        objectFit: "contain"
      }
    },
    ".controls": {
      flex: "0 0 auto",
      paddingTop: theme.spacing(0.25)
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
      paddingTop: theme.spacing(0.25)
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

  // Live preview transform — applies the current params to whatever image
  // the upstream most recently produced. Snaps to integer degrees.
  const transform = useMemo(() => {
    const a = Number.isFinite(angle) ? Math.round(angle) : 0;
    const sx = flipH ? -1 : 1;
    const sy = flipV ? -1 : 1;
    return `rotate(${a}deg) scale(${sx}, ${sy})`;
  }, [angle, flipH, flipV]);

  const result = useResultsStore(
    (state) => state.getResult(workflowId, id),
    shallow
  );
  const previewValue = useMemo(() => {
    if (result && typeof result === "object" && !Array.isArray(result)) {
      const r = result as Record<string, unknown>;
      if ("output" in r) {
        return r.output;
      }
    }
    return result;
  }, [result]);

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
      <div className="preview-area">
        <div className="transform-wrap" style={{ transform }}>
          <ImagePreview value={previewValue} />
        </div>
        <HandleColumn id={id} properties={imageProperty} />
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
          <FlexRow align="center" gap={0.25}>
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
            isStreamingOutput={nodeMetadata.is_streaming_output}
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
