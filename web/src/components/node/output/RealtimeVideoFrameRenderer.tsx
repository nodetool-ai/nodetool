/** @jsxImportSource @emotion/react */
import React, { useEffect, useMemo, useRef } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

type RealtimeVideoPixelFormat = "rgba8" | "rgb8" | "yuv420p" | "nv12";

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

interface RealtimeVideoFrameRendererProps {
  frame: RealtimeVideoFrame;
}

const supportedFormats = new Set(["rgba8", "rgb8"]);

const frameStyles = (theme: Theme) =>
  {
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
  frame: RealtimeVideoFrame
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
  frame: RealtimeVideoFrame
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

const formatTimestamp = (timestampNs: number): string =>
  `${(timestampNs / 1_000_000).toFixed(3)} ms`;

export const RealtimeVideoFrameRenderer: React.FC<
  RealtimeVideoFrameRendererProps
> = ({ frame }) => {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { pixels, error } = useMemo(() => {
    if (!supportedFormats.has(frame.pixel_format)) {
      return {
        pixels: null,
        error: `Unsupported realtime video format: ${frame.pixel_format}`
      };
    }

    const data = coerceFrameData(frame.data);
    if (!data) {
      return { pixels: null, error: "Realtime video frame has no pixel data" };
    }

    const bytesPerPixel = frame.pixel_format === "rgba8" ? 4 : 3;
    if (frame.stride < frame.width * bytesPerPixel) {
      return {
        pixels: null,
        error: `Invalid realtime video stride: ${frame.stride}`
      };
    }

    const expectedLength = frame.stride * frame.height;
    if (data.length < expectedLength) {
      return {
        pixels: null,
        error: `Realtime video frame data is too short: ${data.length}/${expectedLength}`
      };
    }

    return {
      pixels:
        frame.pixel_format === "rgba8"
          ? copyRgbaRows(data, frame)
          : expandRgbRows(data, frame),
      error: null
    };
  }, [frame]);

  useEffect(() => {
    if (!pixels || !canvasRef.current) {
      return;
    }

    const context = canvasRef.current.getContext("2d");
    if (!context) {
      return;
    }

    const imageData =
      typeof ImageData !== "undefined"
        ? new ImageData(pixels, frame.width, frame.height)
        : ({
            data: pixels,
            width: frame.width,
            height: frame.height,
            colorSpace: "srgb"
          } as ImageData);
    context.putImageData(imageData, 0, 0);
  }, [frame.height, frame.width, pixels]);

  return (
    <div css={frameStyles(theme)}>
      {error && <div className="frame-error">{error}</div>}
      {!error && (
        <canvas
          ref={canvasRef}
          width={frame.width}
          height={frame.height}
          className="frame-canvas"
          aria-label="Realtime video frame"
        />
      )}
      <div className="frame-metadata">
        <span>{`${frame.width}x${frame.height}`}</span>
        <span>{frame.pixel_format}</span>
        <span>{`stride ${frame.stride}`}</span>
        <span>{`seq ${frame.sequence}`}</span>
        <span>{formatTimestamp(frame.timestamp_ns)}</span>
      </div>
    </div>
  );
};
