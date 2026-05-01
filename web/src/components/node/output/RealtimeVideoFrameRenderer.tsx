/** @jsxImportSource @emotion/react */
import React, { useEffect, useMemo, useRef } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type { VideoFrame } from "@nodetool/protocol";

import { readRealtimeMediaSlot } from "../../../lib/realtime/realtimeMediaFrameSlots";

type RealtimeVideoPixelFormat = "rgba8" | "rgb8" | "jpeg" | "yuv420p" | "nv12";

export interface RealtimeVideoFrame {
  type: "realtime_video_frame";
  data: Uint8Array | number[] | Record<string, number>;
  width: number;
  height: number;
  stride: number;
  pixel_format: RealtimeVideoPixelFormat | string;
  timestamp_ns: number;
  sequence: number;
}

export interface RealtimeVideoFrameRendererProps {
  /** Workflow editor / legacy `output_update` path. */
  frame?: VideoFrame | RealtimeVideoFrame | null;
  /**
   * Realtime page: samples `readRealtimeMediaSlot(mediaSessionId)` every animation frame
   * so inbound video does not trigger React renders per frame.
   */
  mediaSessionId?: string | null;
}

const supportedFormats = new Set(["rgba8", "rgb8"]);

const frameStyles = (theme: Theme) => {
  const palette = theme.vars?.palette ?? theme.palette;
  return css({
    "&": {
      width: "100%",
      height: "100%",
      minHeight: "120px",
      padding: theme.spacing(1),
      backgroundColor: palette.grey[900],
      color: palette.grey[100],
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
      overflow: "auto"
    },
    ".frame-canvas": {
      display: "block",
      maxWidth: "100%",
      height: "auto",
      imageRendering: "pixelated",
      backgroundColor: palette.common.black
    },
    ".frame-metadata": {
      marginTop: theme.spacing(0.75),
      display: "flex",
      flexWrap: "wrap",
      gap: theme.spacing(1),
      color: palette.grey[300]
    },
    ".frame-error": {
      marginBottom: theme.spacing(0.75),
      color: palette.warning.main
    }
  });
};

const coerceFrameData = (
  data: RealtimeVideoFrame["data"]
): Uint8Array | null => {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (Array.isArray(data) && data.every((value) => Number.isInteger(value))) {
    return new Uint8Array(data);
  }
  if (data && typeof data === "object") {
    const entries = Object.entries(data)
      .filter(([key, value]) => /^\d+$/.test(key) && Number.isInteger(value))
      .sort((a, b) => Number(a[0]) - Number(b[0]));
    if (entries.length > 0) {
      return new Uint8Array(entries.map(([, value]) => value));
    }
  }
  return null;
};

const copyRgbaRows = (
  source: Uint8Array,
  frame: Pick<RealtimeVideoFrame, "width" | "height" | "stride">
): Uint8ClampedArray => {
  const rgba = new Uint8ClampedArray(frame.width * frame.height * 4);
  for (let row = 0; row < frame.height; row++) {
    const sourceOffset = row * frame.stride;
    const targetOffset = row * frame.width * 4;
    rgba.set(
      source.subarray(sourceOffset, sourceOffset + frame.width * 4),
      targetOffset
    );
  }
  return rgba;
};

const expandRgbRows = (
  source: Uint8Array,
  frame: Pick<RealtimeVideoFrame, "width" | "height" | "stride">
): Uint8ClampedArray => {
  const rgba = new Uint8ClampedArray(frame.width * frame.height * 4);
  for (let row = 0; row < frame.height; row++) {
    const sourceRow = row * frame.stride;
    const targetRow = row * frame.width * 4;
    for (let x = 0; x < frame.width; x++) {
      const sourceOffset = sourceRow + x * 3;
      const targetOffset = targetRow + x * 4;
      rgba[targetOffset] = source[sourceOffset] ?? 0;
      rgba[targetOffset + 1] = source[sourceOffset + 1] ?? 0;
      rgba[targetOffset + 2] = source[sourceOffset + 2] ?? 0;
      rgba[targetOffset + 3] = 255;
    }
  }
  return rgba;
};

type DecodeOk = {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
};
type DecodeResult =
  | { ok: true; value: DecodeOk }
  | { ok: false; error: string };

const decodeRealtimeVideoFrame = (
  frame: RealtimeVideoFrame | VideoFrame
): DecodeResult => {
  if (frame.pixel_format === "jpeg") {
    return {
      ok: false,
      error:
        "JPEG realtime frames use GPU decode via createImageBitmap on the media slot path"
    };
  }

  if (!supportedFormats.has(frame.pixel_format)) {
    return {
      ok: false,
      error: `Unsupported realtime video format: ${frame.pixel_format}`
    };
  }

  const data = coerceFrameData(frame.data as RealtimeVideoFrame["data"]);
  if (!data) {
    return { ok: false, error: "Realtime video frame has no pixel data" };
  }

  const bytesPerPixel = frame.pixel_format === "rgba8" ? 4 : 3;
  if (frame.stride < frame.width * bytesPerPixel) {
    return {
      ok: false,
      error: `Invalid realtime video stride: ${frame.stride}`
    };
  }

  const expectedLength = frame.stride * frame.height;
  if (data.length < expectedLength) {
    return {
      ok: false,
      error: `Realtime video frame data is too short: ${data.length}/${expectedLength}`
    };
  }

  const pixels =
    frame.pixel_format === "rgba8"
      ? copyRgbaRows(data, frame)
      : expandRgbRows(data, frame);

  return {
    ok: true,
    value: { pixels, width: frame.width, height: frame.height }
  };
};

const paintDecodedOnCanvas = (
  canvas: HTMLCanvasElement,
  decoded: DecodeOk
): void => {
  if (canvas.width !== decoded.width) {
    canvas.width = decoded.width;
  }
  if (canvas.height !== decoded.height) {
    canvas.height = decoded.height;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  const imagePixels = new Uint8ClampedArray(decoded.pixels.length);
  imagePixels.set(decoded.pixels);
  const imageData =
    typeof ImageData !== "undefined"
      ? new ImageData(imagePixels, decoded.width, decoded.height)
      : ({
          data: imagePixels,
          width: decoded.width,
          height: decoded.height,
          colorSpace: "srgb"
        } as ImageData);
  context.putImageData(imageData, 0, 0);
};

/** Publisher puts `performance.now()` (ms) × 1e6 here — not latency since capture. */
const formatPublisherPerfTimestampLabel = (timestampNs: number): string =>
  `${(timestampNs / 1_000_000).toFixed(1)} perf.ms`;

export const RealtimeVideoFrameRenderer: React.FC<
  RealtimeVideoFrameRendererProps
> = ({ frame = null, mediaSessionId = null }) => {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dimsRef = useRef<HTMLSpanElement>(null);
  const formatRef = useRef<HTMLSpanElement>(null);
  const strideRef = useRef<HTMLSpanElement>(null);
  const seqRef = useRef<HTMLSpanElement>(null);
  const tsRef = useRef<HTMLSpanElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const legacyDecode = useMemo(() => {
    if (mediaSessionId || !frame) {
      return null;
    }
    return decodeRealtimeVideoFrame(frame);
  }, [frame, mediaSessionId]);

  useEffect(() => {
    if (mediaSessionId) {
      return;
    }

    if (!legacyDecode?.ok || !canvasRef.current) {
      return;
    }

    paintDecodedOnCanvas(canvasRef.current, legacyDecode.value);
  }, [legacyDecode, mediaSessionId]);

  useEffect(() => {
    if (!mediaSessionId) {
      return;
    }

    let stopped = false;
    let raf = 0;
    let lastPaintedSeq = -1;
    let jpegDecodeGeneration = 0;

    const tick = (): void => {
      if (stopped) {
        return;
      }

      const canvas = canvasRef.current;
      const slot = readRealtimeMediaSlot(mediaSessionId);
      const activeFrame = slot?.frame ?? frame ?? null;

      if (!activeFrame || !canvas) {
        raf = window.requestAnimationFrame(tick);
        return;
      }

      const seq = slot?.sequence ?? activeFrame.sequence;
      if (seq === lastPaintedSeq) {
        raf = window.requestAnimationFrame(tick);
        return;
      }

      lastPaintedSeq = seq;

      const pf = String(activeFrame.pixel_format);
      if (pf === "jpeg") {
        const data = coerceFrameData(
          activeFrame.data as RealtimeVideoFrame["data"]
        );
        if (!data) {
          if (errorRef.current) {
            errorRef.current.textContent = "JPEG frame has no pixel data";
          }
          raf = window.requestAnimationFrame(tick);
          return;
        }

        const gen = ++jpegDecodeGeneration;
        void createImageBitmap(new Blob([data], { type: "image/jpeg" }))
          .then((bmp) => {
            if (stopped || gen !== jpegDecodeGeneration) {
              bmp.close();
              return;
            }
            const canvasEl = canvasRef.current;
            const ctx = canvasEl?.getContext("2d");
            if (!canvasEl || !ctx) {
              bmp.close();
              return;
            }
            if (canvasEl.width !== bmp.width) {
              canvasEl.width = bmp.width;
            }
            if (canvasEl.height !== bmp.height) {
              canvasEl.height = bmp.height;
            }
            ctx.drawImage(bmp, 0, 0);
            bmp.close();

            if (errorRef.current) {
              errorRef.current.textContent = "";
            }
            if (dimsRef.current) {
              dimsRef.current.textContent = `${activeFrame.width}x${activeFrame.height}`;
            }
            if (formatRef.current) {
              formatRef.current.textContent = String(activeFrame.pixel_format);
            }
            if (strideRef.current) {
              strideRef.current.textContent = `stride ${activeFrame.stride}`;
            }
            if (seqRef.current) {
              seqRef.current.textContent = `seq ${activeFrame.sequence}`;
            }
            if (tsRef.current) {
              tsRef.current.textContent =
                formatPublisherPerfTimestampLabel(activeFrame.timestamp_ns);
            }
          })
          .catch((err: unknown) => {
            if (errorRef.current) {
              errorRef.current.textContent =
                err instanceof Error ? err.message : String(err);
            }
          });

        raf = window.requestAnimationFrame(tick);
        return;
      }

      const decoded = decodeRealtimeVideoFrame(activeFrame);
      if (decoded.ok) {
        paintDecodedOnCanvas(canvas, decoded.value);
        if (errorRef.current) {
          errorRef.current.textContent = "";
        }
        if (dimsRef.current) {
          dimsRef.current.textContent = `${activeFrame.width}x${activeFrame.height}`;
        }
        if (formatRef.current) {
          formatRef.current.textContent = String(activeFrame.pixel_format);
        }
        if (strideRef.current) {
          strideRef.current.textContent = `stride ${activeFrame.stride}`;
        }
        if (seqRef.current) {
          seqRef.current.textContent = `seq ${activeFrame.sequence}`;
        }
        if (tsRef.current) {
          tsRef.current.textContent =
            formatPublisherPerfTimestampLabel(activeFrame.timestamp_ns);
        }
      } else if (errorRef.current) {
        errorRef.current.textContent = decoded.error;
      }

      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);
    return () => {
      stopped = true;
      window.cancelAnimationFrame(raf);
    };
  }, [mediaSessionId, frame]);

  if (!mediaSessionId) {
    if (!frame) {
      return null;
    }

    const error = legacyDecode && !legacyDecode.ok ? legacyDecode.error : null;

    return (
      <div css={frameStyles(theme)}>
        {error && <div className="frame-error">{error}</div>}
        {!error && legacyDecode?.ok && (
          <canvas
            ref={canvasRef}
            width={legacyDecode.value.width}
            height={legacyDecode.value.height}
            className="frame-canvas"
            aria-label="Realtime video frame"
          />
        )}
        <div className="frame-metadata">
          <span>{`${frame.width}x${frame.height}`}</span>
          <span>{frame.pixel_format}</span>
          <span>{`stride ${frame.stride}`}</span>
          <span>{`seq ${frame.sequence}`}</span>
          <span>{formatPublisherPerfTimestampLabel(frame.timestamp_ns)}</span>
        </div>
      </div>
    );
  }

  return (
    <div css={frameStyles(theme)}>
      <div ref={errorRef} className="frame-error" />
      <canvas
        ref={canvasRef}
        width={1}
        height={1}
        className="frame-canvas"
        aria-label="Realtime video frame"
      />
      <div className="frame-metadata">
        <span ref={dimsRef}>—</span>
        <span ref={formatRef}>—</span>
        <span ref={strideRef}>—</span>
        <span ref={seqRef}>—</span>
        <span ref={tsRef}>—</span>
      </div>
    </div>
  );
};
