import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from "react";
import type { RealtimeSessionRecord, VideoFrame } from "@nodetool/protocol";
import log from "loglevel";

import { realtimeSessionClient } from "../../lib/websocket/RealtimeSessionClient";

export const DEFAULT_REALTIME_FRAME_INTERVAL_MS = 500;
export const DEFAULT_REALTIME_FRAME_MAX_WIDTH = 320;

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

export type RealtimeCameraFramePublisherSkippedReason =
  | "disabled"
  | "waiting_for_preview"
  | "waiting_for_session"
  | "no_enabled_video_track";

export interface RealtimeCameraFramePublisherStatus {
  enabled: boolean;
  active: boolean;
  trackId: string | null;
  nodeId: string | null;
  inputName: string | null;
  sourceHandle: string | null;
  intervalMs: number;
  targetFps: number;
  framesPublished: number;
  lastPublishedAt: number | null;
  lastError: string | null;
  skippedReason: RealtimeCameraFramePublisherSkippedReason | null;
}

type RealtimeMediaTrack = RealtimeSessionRecord["media_tracks"][number];

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const inactiveStatus = (
  skippedReason: RealtimeCameraFramePublisherSkippedReason,
  intervalMs: number,
  enabled: boolean
): RealtimeCameraFramePublisherStatus => ({
  enabled,
  active: false,
  trackId: null,
  nodeId: null,
  inputName: null,
  sourceHandle: null,
  intervalMs,
  targetFps: Math.round((1000 / intervalMs) * 10) / 10,
  framesPublished: 0,
  lastPublishedAt: null,
  lastError: null,
  skippedReason
});

const sameStatus = (
  left: RealtimeCameraFramePublisherStatus,
  right: RealtimeCameraFramePublisherStatus
): boolean =>
  left.enabled === right.enabled &&
  left.active === right.active &&
  left.trackId === right.trackId &&
  left.nodeId === right.nodeId &&
  left.inputName === right.inputName &&
  left.sourceHandle === right.sourceHandle &&
  left.intervalMs === right.intervalMs &&
  left.targetFps === right.targetFps &&
  left.framesPublished === right.framesPublished &&
  left.lastPublishedAt === right.lastPublishedAt &&
  left.lastError === right.lastError &&
  left.skippedReason === right.skippedReason;

const setStatusIfChanged = (
  setStatus: Dispatch<SetStateAction<RealtimeCameraFramePublisherStatus>>,
  nextStatus: RealtimeCameraFramePublisherStatus
): void => {
  setStatus((current) => (sameStatus(current, nextStatus) ? current : nextStatus));
};

const selectVideoTrack = (
  session: RealtimeSessionRecord,
  stream: MediaStream
): RealtimeMediaTrack | null => {
  const liveTrackIds = new Set(stream.getVideoTracks().map((track) => track.id));
  const matchingTrack = session.media_tracks.find(
    (track) =>
      track.kind === "video" &&
      track.enabled !== false &&
      liveTrackIds.has(track.track_id)
  );
  if (matchingTrack) {
    return matchingTrack;
  }

  return (
    session.media_tracks.find(
      (track) => track.kind === "video" && track.enabled !== false
    ) ?? null
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

  const maxWidth = options.maxWidth ?? DEFAULT_REALTIME_FRAME_MAX_WIDTH;
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
  intervalMs = DEFAULT_REALTIME_FRAME_INTERVAL_MS,
  maxWidth = DEFAULT_REALTIME_FRAME_MAX_WIDTH
}: RealtimeCameraFramePublisherOptions): RealtimeCameraFramePublisherStatus => {
  const sequenceRef = useRef(0);
  const firstFrameLogRef = useRef(false);
  const statusLogKeyRef = useRef<string | null>(null);
  const [status, setStatus] = useState<RealtimeCameraFramePublisherStatus>(() =>
    inactiveStatus("disabled", intervalMs, enabled)
  );

  useEffect(() => {
    const statusLogKey = JSON.stringify({
      enabled: status.enabled,
      active: status.active,
      trackId: status.trackId,
      nodeId: status.nodeId,
      inputName: status.inputName,
      sourceHandle: status.sourceHandle,
      skippedReason: status.skippedReason,
      lastError: status.lastError
    });
    if (statusLogKeyRef.current === statusLogKey) {
      return;
    }
    statusLogKeyRef.current = statusLogKey;
    console.info("TEMP_LOG realtime camera publisher status", status);
  }, [status]);

  useEffect(() => {
    if (!enabled) {
      setStatusIfChanged(setStatus, inactiveStatus("disabled", intervalMs, false));
      return;
    }

    if (!previewStream) {
      setStatusIfChanged(
        setStatus,
        inactiveStatus("waiting_for_preview", intervalMs, true)
      );
      return;
    }

    if (!session) {
      setStatusIfChanged(
        setStatus,
        inactiveStatus("waiting_for_session", intervalMs, true)
      );
      return;
    }

    const track = selectVideoTrack(session, previewStream);
    if (!track) {
      setStatusIfChanged(
        setStatus,
        inactiveStatus("no_enabled_video_track", intervalMs, true)
      );
      return;
    }

    firstFrameLogRef.current = false;
    setStatus((current) => {
      const nextStatus = {
        ...current,
        enabled: true,
        active: true,
        trackId: track.track_id,
        nodeId: track.node_id,
        inputName: track.input_name,
        sourceHandle: track.source_handle ?? "frame",
        intervalMs,
        targetFps: Math.round((1000 / intervalMs) * 10) / 10,
        lastError: null,
        skippedReason: null
      };

      return sameStatus(current, nextStatus) ? current : nextStatus;
    });

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = previewStream;
    void video.play().catch((error: unknown) => {
      log.warn("Realtime camera frame publisher could not start video", error);
      setStatus((current) => ({
        ...current,
        lastError: errorMessage(error)
      }));
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
      const publishedAt = Date.now();
      if (!firstFrameLogRef.current) {
        firstFrameLogRef.current = true;
        console.info("TEMP_LOG realtime camera first frame publish", {
          sessionId: session.session_id,
          workflowId: session.workflow_id,
          trackId: track.track_id,
          nodeId: track.node_id,
          inputName: track.input_name,
          sourceHandle: track.source_handle ?? "frame",
          sequence: frame.sequence,
          width: frame.width,
          height: frame.height,
          pixelFormat: frame.pixel_format,
          stride: frame.stride
        });
      }
      setStatus((current) => ({
        ...current,
        framesPublished: current.framesPublished + 1,
        lastPublishedAt: publishedAt,
        lastError: null
      }));
      void realtimeSessionClient
        .pushInputFrame(session.session_id, session.workflow_id, {
          trackId: track.track_id,
          frame
        })
        .catch((error: unknown) => {
          log.warn("Realtime camera frame publish failed", error);
          setStatus((current) => ({
            ...current,
            lastError: errorMessage(error)
          }));
        });
    };

    const intervalId = window.setInterval(publishFrame, intervalMs);
    return () => {
      window.clearInterval(intervalId);
      video.pause();
      video.srcObject = null;
    };
  }, [enabled, intervalMs, maxWidth, previewStream, session]);

  return status;
};
