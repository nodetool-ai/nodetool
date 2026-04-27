import { useEffect, useRef } from "react";
import type { RealtimeSessionRecord, VideoFrame } from "@nodetool/protocol";
import log from "loglevel";

import { realtimeSessionClient } from "../../lib/websocket/RealtimeSessionClient";

const DEFAULT_INTERVAL_MS = 500;
const DEFAULT_MAX_WIDTH = 320;

export interface CaptureVideoElementFrameOptions {
  sequence: number;
  timestampNs: number;
  canvas?: HTMLCanvasElement;
  maxWidth?: number;
}

export interface RealtimeCameraFramePublisherOptions {
  enabled: boolean;
  previewStream: MediaStream | null;
  session: RealtimeSessionRecord | null;
  intervalMs?: number;
  maxWidth?: number;
}

const selectVideoTrackId = (
  session: RealtimeSessionRecord,
  stream: MediaStream
): string | null => {
  const liveTrackIds = new Set(stream.getVideoTracks().map((track) => track.id));
  const matchingTrack = session.media_tracks.find(
    (track) =>
      track.kind === "video" &&
      track.enabled !== false &&
      liveTrackIds.has(track.track_id)
  );
  if (matchingTrack) {
    return matchingTrack.track_id;
  }

  return (
    session.media_tracks.find(
      (track) => track.kind === "video" && track.enabled !== false
    )?.track_id ?? null
  );
};

export const captureVideoElementFrame = (
  video: HTMLVideoElement,
  options: CaptureVideoElementFrameOptions
): VideoFrame | null => {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return null;
  }

  const maxWidth = options.maxWidth ?? DEFAULT_MAX_WIDTH;
  const scale = sourceWidth > maxWidth ? maxWidth / sourceWidth : 1;
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = options.canvas ?? document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }

  context.drawImage(video, 0, 0, width, height);
  const image = context.getImageData(0, 0, width, height);
  return {
    type: "realtime_video_frame",
    data: new Uint8Array(image.data),
    width,
    height,
    stride: width * 4,
    pixel_format: "rgba8",
    timestamp_ns: options.timestampNs,
    sequence: options.sequence
  };
};

export const useRealtimeCameraFramePublisher = ({
  enabled,
  previewStream,
  session,
  intervalMs = DEFAULT_INTERVAL_MS,
  maxWidth = DEFAULT_MAX_WIDTH
}: RealtimeCameraFramePublisherOptions): void => {
  const sequenceRef = useRef(0);

  useEffect(() => {
    if (!enabled || !previewStream || !session) {
      return;
    }

    const trackId = selectVideoTrackId(session, previewStream);
    if (!trackId) {
      log.warn("Realtime camera frame publisher has no enabled video track");
      return;
    }

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = previewStream;
    void video.play().catch((error: unknown) => {
      log.warn("Realtime camera frame publisher could not start video", error);
    });

    const publishFrame = (): void => {
      const nextSequence = sequenceRef.current + 1;
      const frame = captureVideoElementFrame(video, {
        sequence: nextSequence,
        timestampNs: Math.round(performance.now() * 1_000_000),
        maxWidth
      });
      if (!frame) {
        return;
      }

      sequenceRef.current = nextSequence;
      void realtimeSessionClient
        .pushInputFrame(session.session_id, session.workflow_id, {
          trackId,
          frame
        })
        .catch((error: unknown) => {
          log.warn("Realtime camera frame publish failed", error);
        });
    };

    const intervalId = window.setInterval(publishFrame, intervalMs);
    return () => {
      window.clearInterval(intervalId);
      video.pause();
      video.srcObject = null;
    };
  }, [enabled, intervalMs, maxWidth, previewStream, session]);
};
