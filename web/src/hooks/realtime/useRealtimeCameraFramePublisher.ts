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
export const REALTIME_FRAME_60FPS_INTERVAL_MS = 1000 / 60;
export const REALTIME_FRAME_PACED_INTERVAL_MS = 1000 / 30;
export const DEFAULT_REALTIME_FRAME_MAX_WIDTH = 320;
export const DEFAULT_REALTIME_MAX_IN_FLIGHT_FRAMES = 8;

/** JPEG quality for realtime ingress when `canvas.toBlob` is available (smaller wire payloads than RGBA). */
export const REALTIME_INGRESS_JPEG_QUALITY = 0.82;

const ACK_SLOW_MS = 250;

export type RealtimeFramePushMode = "interval" | "60fps" | "paced" | "uncapped";

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
  framePushMode?: RealtimeFramePushMode;
  maxInFlightFrames?: number;
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
  framesSkipped: number;
  inFlightFrames: number;
  lastPublishedAt: number | null;
  lastError: string | null;
  skippedReason: RealtimeCameraFramePublisherSkippedReason | null;
}

type RealtimeMediaTrack = RealtimeSessionRecord["media_tracks"][number];

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const targetFpsForMode = (
  framePushMode: RealtimeFramePushMode,
  intervalMs: number
): number => {
  if (framePushMode === "uncapped") {
    return 0;
  }
  if (framePushMode === "paced") {
    return 30;
  }
  if (framePushMode === "60fps") {
    return 60;
  }
  return Math.round((1000 / intervalMs) * 10) / 10;
};

const intervalMsForMode = (
  framePushMode: RealtimeFramePushMode,
  intervalMs: number
): number => {
  if (framePushMode === "paced") {
    return REALTIME_FRAME_PACED_INTERVAL_MS;
  }
  if (framePushMode === "60fps") {
    return REALTIME_FRAME_60FPS_INTERVAL_MS;
  }
  return intervalMs;
};

const inactiveStatus = (
  skippedReason: RealtimeCameraFramePublisherSkippedReason,
  intervalMs: number,
  enabled: boolean,
  framePushMode: RealtimeFramePushMode = "interval"
): RealtimeCameraFramePublisherStatus => ({
  enabled,
  active: false,
  trackId: null,
  nodeId: null,
  inputName: null,
  sourceHandle: null,
  intervalMs,
  targetFps: targetFpsForMode(framePushMode, intervalMs),
  framesPublished: 0,
  framesSkipped: 0,
  inFlightFrames: 0,
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
  left.framesSkipped === right.framesSkipped &&
  left.inFlightFrames === right.inFlightFrames &&
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

/** Prefer MJPEG ingress whenever safe — skips `getImageData` (major main-thread win). */
export const shouldRealtimeCapturePreferJpeg = (
  framePushMode: RealtimeFramePushMode
): boolean => {
  if (framePushMode === "uncapped") {
    return false;
  }
  if (typeof HTMLCanvasElement === "undefined") {
    return false;
  }
  if (typeof HTMLCanvasElement.prototype.toBlob !== "function") {
    return false;
  }
  if (process.env.NODE_ENV === "test") {
    return false;
  }
  return true;
};

export const captureVideoElementFrameAsJpeg = async (
  video: HTMLVideoElement,
  options: CaptureVideoElementFrameOptions & { quality?: number }
): Promise<VideoFrame | null> => {
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
  if (canvas.width !== width) {
    canvas.width = width;
  }
  if (canvas.height !== height) {
    canvas.height = height;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  context.drawImage(video, 0, 0, width, height);

  const blob: Blob | null = await new Promise((resolve) => {
    canvas.toBlob(
      (b) => resolve(b),
      "image/jpeg",
      options.quality ?? REALTIME_INGRESS_JPEG_QUALITY
    );
  });
  if (!blob) {
    return null;
  }

  const buf = new Uint8Array(await blob.arrayBuffer());
  return {
    type: "realtime_video_frame",
    data: buf,
    width,
    height,
    stride: buf.byteLength,
    pixel_format: "jpeg",
    timestamp_ns: options.timestampNs,
    sequence: options.sequence
  };
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
  if (canvas.width !== width) {
    canvas.width = width;
  }
  if (canvas.height !== height) {
    canvas.height = height;
  }

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
  maxWidth = DEFAULT_REALTIME_FRAME_MAX_WIDTH,
  framePushMode = "interval",
  maxInFlightFrames = DEFAULT_REALTIME_MAX_IN_FLIGHT_FRAMES
}: RealtimeCameraFramePublisherOptions): RealtimeCameraFramePublisherStatus => {
  const sequenceRef = useRef(0);
  const inFlightRef = useRef(0);
  const slowAckStreakRef = useRef(0);
  const [status, setStatus] = useState<RealtimeCameraFramePublisherStatus>(() =>
    inactiveStatus("disabled", intervalMs, enabled, framePushMode)
  );

  useEffect(() => {
    const resolvedIntervalMs = intervalMsForMode(framePushMode, intervalMs);

    if (!enabled) {
      setStatusIfChanged(
        setStatus,
        inactiveStatus("disabled", resolvedIntervalMs, false, framePushMode)
      );
      return;
    }

    if (!previewStream) {
      setStatusIfChanged(
        setStatus,
        inactiveStatus(
          "waiting_for_preview",
          resolvedIntervalMs,
          true,
          framePushMode
        )
      );
      return;
    }

    if (!session) {
      setStatusIfChanged(
        setStatus,
        inactiveStatus(
          "waiting_for_session",
          resolvedIntervalMs,
          true,
          framePushMode
        )
      );
      return;
    }

    const track = selectVideoTrack(session, previewStream);
    if (!track) {
      setStatusIfChanged(
        setStatus,
        inactiveStatus(
          "no_enabled_video_track",
          resolvedIntervalMs,
          true,
          framePushMode
        )
      );
      return;
    }

    inFlightRef.current = 0;
    slowAckStreakRef.current = 0;
    setStatus((current) => {
      const nextStatus = {
        ...current,
        enabled: true,
        active: true,
        trackId: track.track_id,
        nodeId: track.node_id,
        inputName: track.input_name,
        sourceHandle: track.source_handle ?? "frame",
        intervalMs: resolvedIntervalMs,
        targetFps: targetFpsForMode(framePushMode, resolvedIntervalMs),
        inFlightFrames: 0,
        lastError: null,
        skippedReason: null
      };

      return sameStatus(current, nextStatus) ? current : nextStatus;
    });

    let disposed = false;
    let intervalId: number | null = null;
    let videoFrameCallbackId: number | null = null;
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const callbackVideo = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (
        callback: (now: number, metadata?: unknown) => void
      ) => number;
      cancelVideoFrameCallback?: (handle: number) => void;
    };
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

    let lastPublishedNow = 0;
    const preferJpeg = shouldRealtimeCapturePreferJpeg(framePushMode);

    const publishFrame = (now = performance.now()): void => {
      if (inFlightRef.current >= maxInFlightFrames) {
        setStatus((current) => ({
          ...current,
          framesSkipped: current.framesSkipped + 1,
          inFlightFrames: inFlightRef.current
        }));
        return;
      }

      const nextSequence = sequenceRef.current + 1;
      const timestampNs = Math.round(now * 1_000_000);

      const beginSend = (frame: VideoFrame): void => {
        const publishStartedAt = Date.now();
        sequenceRef.current = nextSequence;
        lastPublishedNow = now;
        inFlightRef.current += 1;
        setStatus((current) => ({
          ...current,
          framesPublished: current.framesPublished + 1,
          inFlightFrames: inFlightRef.current,
          lastPublishedAt: Date.now(),
          lastError: null
        }));
        void realtimeSessionClient
          .pushInputFrame(session.session_id, session.workflow_id, {
            trackId: track.track_id,
            frame
          })
          .then(() => {
            inFlightRef.current = Math.max(0, inFlightRef.current - 1);
            const elapsed = Date.now() - publishStartedAt;
            if (elapsed > ACK_SLOW_MS) {
              slowAckStreakRef.current += 1;
              if (slowAckStreakRef.current >= 2) {
                inFlightRef.current = 0;
                slowAckStreakRef.current = 0;
              }
            } else {
              slowAckStreakRef.current = 0;
            }
            if (!disposed) {
              setStatus((current) => ({
                ...current,
                inFlightFrames: inFlightRef.current
              }));
            }
          })
          .catch((error: unknown) => {
            inFlightRef.current = Math.max(0, inFlightRef.current - 1);
            slowAckStreakRef.current = 0;
            log.warn("Realtime camera frame publish failed", error);
            if (!disposed) {
              setStatus((current) => ({
                ...current,
                inFlightFrames: inFlightRef.current,
                lastError: errorMessage(error)
              }));
            }
          });
      };

      if (preferJpeg) {
        void captureVideoElementFrameAsJpeg(video, {
          sequence: nextSequence,
          timestampNs,
          canvas,
          maxWidth,
          quality: REALTIME_INGRESS_JPEG_QUALITY
        })
          .then((frame) => {
            if (!frame || disposed) {
              return;
            }
            beginSend(frame);
          })
          .catch((error: unknown) => {
            log.warn("Realtime JPEG capture failed; caller may retry next frame", error);
          });
        return;
      }

      const frame = captureVideoElementFrame(video, {
        sequence: nextSequence,
        timestampNs,
        canvas,
        maxWidth
      });
      if (!frame) {
        return;
      }

      beginSend(frame);
    };

    const scheduleVideoFrame = (): void => {
      if (disposed || typeof callbackVideo.requestVideoFrameCallback !== "function") {
        return;
      }
      videoFrameCallbackId = callbackVideo.requestVideoFrameCallback((now) => {
        if (
          framePushMode === "uncapped" ||
          lastPublishedNow === 0 ||
          now - lastPublishedNow >= resolvedIntervalMs
        ) {
          publishFrame(now);
        }
        scheduleVideoFrame();
      });
    };

    if (typeof callbackVideo.requestVideoFrameCallback === "function") {
      scheduleVideoFrame();
    } else {
      intervalId = window.setInterval(publishFrame, resolvedIntervalMs);
    }

    return () => {
      disposed = true;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
      if (
        videoFrameCallbackId !== null &&
        typeof callbackVideo.cancelVideoFrameCallback === "function"
      ) {
        callbackVideo.cancelVideoFrameCallback(videoFrameCallbackId);
      }
      video.pause();
      video.srcObject = null;
    };
  }, [
    enabled,
    framePushMode,
    intervalMs,
    maxInFlightFrames,
    maxWidth,
    previewStream,
    session
  ]);

  return status;
};
