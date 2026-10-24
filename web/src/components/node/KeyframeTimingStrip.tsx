/** @jsxImportSource @emotion/react */
/**
 * KeyframeTimingStrip
 *
 * A time axis under a keyframe model node (FLUX 3 Keyframes To Video) showing
 * each connected Keyframe node's image at its time. Dragging a thumbnail
 * writes the new time back to that Keyframe node, so timing is set where the
 * keyframes are seen together, as in the fal playground.
 */

import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { useNodes } from "../../contexts/NodeContext";
import type { NodeMetadata } from "../../stores/ApiTypes";
import type { NodeData } from "../../stores/NodeData";
import { useNodeResultValue } from "../../hooks/nodes/useNodeExecState";
import { edgesTargeting } from "../../hooks/nodes/edgeIndex";
import type { MediaLocator } from "../../hooks/useResolvedMediaUri";
import {
  BORDER_RADIUS,
  CONTROL,
  Caption,
  FlexColumn,
  FlexRow,
  MOTION,
  ResponsiveImage,
  SPACING,
  Tooltip,
  Z_INDEX
} from "../ui_primitives";
import {
  KEYFRAME_NODE_TYPE,
  formatKeyframeTime,
  keyframePosition,
  keyframeProperty,
  stripDuration,
  timeAtPosition
} from "../../utils/keyframeTiming";

const THUMB = CONTROL.height.md;

const styles = (theme: Theme) =>
  css({
    "&.keyframe-strip": {
      width: "100%",
      padding: theme.spacing(SPACING.xs, SPACING.md)
    },
    ".keyframe-track": {
      position: "relative",
      width: "100%",
      height: CONTROL.height.xl,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: theme.vars.palette.action.hover,
      touchAction: "none"
    },
    // Markers are centred on their time, so the rail they move along is
    // inset by half a thumbnail: one at 0 s or at the end stays inside.
    ".keyframe-rail": {
      position: "absolute",
      top: 0,
      bottom: 0,
      left: THUMB / 2,
      right: THUMB / 2
    },
    ".keyframe-marker": {
      position: "absolute",
      top: "50%",
      width: THUMB,
      height: THUMB,
      transform: "translate(-50%, -50%)",
      borderRadius: BORDER_RADIUS.xs,
      overflow: "hidden",
      cursor: "grab",
      border: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.paper,
      zIndex: Z_INDEX.raised,
      transition: MOTION.border,
      "&:hover, &.dragging": {
        borderColor: theme.vars.palette.primary.main
      },
      "&.dragging": {
        cursor: "grabbing"
      },
      img: {
        width: "100%",
        height: "100%",
        objectFit: "cover",
        pointerEvents: "none"
      }
    },
    ".keyframe-marker-empty": {
      width: "100%",
      height: "100%"
    }
  });

/** The image a Keyframe node will pass on: its own, or what its upstream made. */
function useKeyframeImage(
  workflowId: string,
  keyframeNodeId: string
): MediaLocator | null {
  const own = useNodes(
    (state) => state.findNode(keyframeNodeId)?.data.properties?.image
  ) as MediaLocator | undefined;
  const upstream = useNodes((state) => {
    const edge = edgesTargeting(state.edges, keyframeNodeId).find(
      (candidate) => candidate.targetHandle === "image"
    );
    return edge
      ? { id: edge.source, handle: edge.sourceHandle ?? undefined }
      : null;
  });
  const upstreamProperties = useNodes((state) =>
    upstream ? state.findNode(upstream.id)?.data.properties : undefined
  );
  const result = useNodeResultValue(
    workflowId,
    upstream?.id ?? "",
    upstream?.handle
  );

  return useMemo(() => {
    const candidates = [
      result,
      upstreamProperties?.value,
      upstreamProperties?.image,
      own
    ];
    for (const candidate of candidates) {
      const value = Array.isArray(candidate) ? candidate[0] : candidate;
      if (
        value &&
        typeof value === "object" &&
        ((typeof value.uri === "string" && value.uri !== "") ||
          (typeof value.asset_id === "string" && value.asset_id !== ""))
      ) {
        return value as MediaLocator;
      }
    }
    return null;
  }, [result, upstreamProperties, own]);
}

interface KeyframeMarkerProps {
  workflowId: string;
  keyframeNodeId: string;
  duration: number;
  trackRef: React.RefObject<HTMLDivElement | null>;
}

const KeyframeMarker: React.FC<KeyframeMarkerProps> = memo(
  function KeyframeMarker({ workflowId, keyframeNodeId, duration, trackRef }) {
    const storedTime = useNodes((state) =>
      Number(state.findNode(keyframeNodeId)?.data.properties?.time ?? 0)
    );
    const updateNodeProperties = useNodes(
      (state) => state.updateNodeProperties
    );
    const image = useKeyframeImage(workflowId, keyframeNodeId);
    const [dragTime, setDragTime] = useState<number | null>(null);
    const time = dragTime ?? storedTime;

    const timeAt = useCallback(
      (clientX: number): number => {
        const rect = trackRef.current?.getBoundingClientRect();
        if (!rect || rect.width === 0) {
          return storedTime;
        }
        return timeAtPosition((clientX - rect.left) / rect.width, duration);
      },
      [trackRef, duration, storedTime]
    );

    const onPointerDown = useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setDragTime(timeAt(event.clientX));
      },
      [timeAt]
    );
    const onPointerMove = useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
        if (dragTime === null) {
          return;
        }
        setDragTime(timeAt(event.clientX));
      },
      [dragTime, timeAt]
    );
    const onPointerUp = useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
        if (dragTime === null) {
          return;
        }
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        const next = timeAt(event.clientX);
        setDragTime(null);
        if (next !== storedTime) {
          updateNodeProperties(keyframeNodeId, { time: next });
        }
      },
      [dragTime, timeAt, storedTime, updateNodeProperties, keyframeNodeId]
    );

    return (
      <Tooltip title={`${formatKeyframeTime(time)}. Drag to change the time.`}>
        <div
          className={`keyframe-marker nodrag${dragTime !== null ? " dragging" : ""}`}
          style={{ left: `${keyframePosition(time, duration) * 100}%` }}
          role="slider"
          aria-label="Keyframe time"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={time}
          aria-valuetext={formatKeyframeTime(time)}
          data-testid="keyframe-marker"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setDragTime(null)}
        >
          {image ? (
            <ResponsiveImage locator={image} alt="" />
          ) : (
            <div className="keyframe-marker-empty" />
          )}
        </div>
      </Tooltip>
    );
  }
);

interface KeyframeTimingStripProps {
  id: string;
  workflowId: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
}

const KeyframeTimingStripImpl: React.FC<KeyframeTimingStripProps> = ({
  id,
  workflowId,
  nodeMetadata,
  data
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const trackRef = useRef<HTMLDivElement>(null);
  const property = useMemo(() => keyframeProperty(nodeMetadata), [nodeMetadata]);
  const durationProperty = useMemo(
    () => nodeMetadata.properties?.find((p) => p.name === "duration"),
    [nodeMetadata]
  );

  // Keyframe nodes wired into the keyframes input, in edge order.
  const keyframeNodeIds = useNodes((state) => {
    if (!property) {
      return [] as string[];
    }
    return edgesTargeting(state.edges, id)
      .filter((edge) => edge.targetHandle === property.name)
      .map((edge) => edge.source)
      .filter(
        (source) => state.findNode(source)?.type === KEYFRAME_NODE_TYPE
      );
  });
  const keyframeTimes = useNodes((state) =>
    keyframeNodeIds.map((nodeId) =>
      Number(state.findNode(nodeId)?.data.properties?.time ?? 0)
    )
  );

  if (!property || keyframeNodeIds.length === 0) {
    return null;
  }

  const duration = stripDuration(
    data.properties?.duration,
    durationProperty?.default,
    keyframeTimes
  );

  return (
    <FlexColumn
      css={cssStyles}
      className="keyframe-strip nodrag"
      gap={SPACING.micro}
      data-testid="keyframe-timing-strip"
    >
      <div className="keyframe-track">
        <div className="keyframe-rail" ref={trackRef}>
          {keyframeNodeIds.map((nodeId) => (
            <KeyframeMarker
              key={nodeId}
              workflowId={workflowId}
              keyframeNodeId={nodeId}
              duration={duration}
              trackRef={trackRef}
            />
          ))}
        </div>
      </div>
      <FlexRow justify="space-between" fullWidth>
        <Caption size="smaller" color="muted">
          {formatKeyframeTime(0)}
        </Caption>
        <Caption size="smaller" color="muted">
          {formatKeyframeTime(duration)}
        </Caption>
      </FlexRow>
    </FlexColumn>
  );
};

export const KeyframeTimingStrip = memo(KeyframeTimingStripImpl);

export default KeyframeTimingStrip;
