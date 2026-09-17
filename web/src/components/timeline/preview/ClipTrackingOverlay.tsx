import React, { useSyncExternalStore } from "react";
import {
  clipSourceMsAt,
  isMediaTrackStale,
  sampleMediaTrackAt,
  type TimelineClip,
  type ClipCrop,
  type ClipTransform
} from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import { TrackingOverlay } from "./TrackingOverlay";
import { useTrackingSelection } from "./useTrackingSelection";

interface ClipTrackingOverlayProps {
  clip: TimelineClip;
  crop?: ClipCrop;
  transform?: ClipTransform;
  parentMatrix?: Float32Array;
  sourceWidth: number;
  sourceHeight: number;
  sequenceWidth: number;
  sequenceHeight: number;
  frameWidth: number;
  frameHeight: number;
}

const UNCROPPED = { left: 0, right: 0, top: 0, bottom: 0 };

export function ClipTrackingOverlay({
  clip,
  crop,
  ...geometry
}: ClipTrackingOverlayProps): React.ReactElement | null {
  const { selection, select } = useTrackingSelection();
  const subscribeTime = useTimelinePlaybackStore(
    (state) => state.subscribeTime
  );
  const getTimeMs = useTimelinePlaybackStore((state) => state.getTimeMs);
  const currentTimeMs = useSyncExternalStore(
    subscribeTime,
    getTimeMs,
    getTimeMs
  );
  const tracks = useTimelineStore((state) => state.mediaTracks);
  const sourceMs = clipSourceMsAt(clip, currentTimeMs);
  const active =
    selection?.clipId === clip.id &&
    selection.sourceAssetId === clip.currentAssetId
      ? selection
      : null;
  if (
    clip.mediaType !== "video" ||
    !clip.currentAssetId ||
    currentTimeMs < clip.startMs ||
    currentTimeMs >= clip.startMs + clip.durationMs
  ) {
    return null;
  }
  if (active && Math.abs(active.sourceMs - sourceMs) < 1) {
    return (
      <TrackingOverlay
        {...geometry}
        crop={crop ?? UNCROPPED}
        region={active.region}
        onChange={(region) => select({ ...active, region })}
        onCancel={() => select(null)}
      />
    );
  }
  return (
    <>
      {tracks
        .filter(
          (track) =>
            track.clipId === clip.id &&
            track.kind === "box" &&
            track.status === "ready" &&
            !isMediaTrackStale(track, clip) &&
            sourceMs >= track.sourceStartMs &&
            sourceMs <= track.sourceEndMs
        )
        .map((track) => {
          const sample = sampleMediaTrackAt(track, sourceMs);
          if (
            sample?.x === undefined ||
            sample.y === undefined ||
            sample.width === undefined ||
            sample.height === undefined
          ) {
            return null;
          }
          return (
            <TrackingOverlay
              key={track.id}
              {...geometry}
              crop={crop ?? UNCROPPED}
              region={{
                x: sample.x,
                y: sample.y,
                width: sample.width,
                height: sample.height
              }}
            />
          );
        })}
    </>
  );
}
