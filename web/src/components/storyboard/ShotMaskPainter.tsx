/**
 * ShotMaskPainter
 *
 * Paint the part of a still an edit may change. The creator brushes over the
 * area, and the result is a black-and-white mask at the still's own pixel
 * size: white where the model may repaint, black where it must keep the
 * still. That is the mask an `inpaint` request takes.
 *
 * The canvas is the still's natural size and is scaled down to fit, so the
 * brush size is converted from screen pixels to still pixels on every stroke:
 * a 40 px brush covers the same area whatever the dialog's width.
 */

import React, { memo, useCallback, useEffect, useRef, useState } from "react";

import {
  Box,
  Caption,
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  Slider,
  ToggleGroup,
  ToggleOption,
  BORDER_RADIUS,
  SPACING
} from "../ui_primitives";
import type { ResolvedMediaUrl } from "../../utils/resolveMediaUri";

interface ShotMaskPainterProps {
  /** The resolved URL of the still being masked. */
  stillUrl: ResolvedMediaUrl;
  /** A mask painted before, to keep painting on. */
  initialMask?: HTMLCanvasElement | null;
  onCancel: () => void;
  /** The painted strokes (white on transparent), or null when nothing is painted. */
  onDone: (strokes: HTMLCanvasElement | null) => void;
}

type Tool = "brush" | "eraser";

const MIN_BRUSH = 8;
const MAX_BRUSH = 160;
const DEFAULT_BRUSH = 48;

/** The strokes are painted white and shown through a tinted, see-through layer. */
const STROKE_COLOR = "white";

const frameSx = {
  position: "relative",
  maxWidth: "100%",
  maxHeight: "65vh",
  lineHeight: 0,
  borderRadius: BORDER_RADIUS.md,
  overflow: "hidden",
  touchAction: "none",
  cursor: "crosshair"
} as const;

const layerSx = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  opacity: 0.55,
  mixBlendMode: "screen"
} as const;

/** True when any pixel of the canvas has paint on it. */
export const hasPaint = (canvas: HTMLCanvasElement): boolean => {
  const context = canvas.getContext("2d");
  if (!context) {
    return false;
  }
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) {
      return true;
    }
  }
  return false;
};

/**
 * The mask a provider takes: black everywhere, white where the strokes are.
 * Returned as a PNG file at the strokes' size, which is the still's.
 */
export const maskFileFromStrokes = (
  strokes: HTMLCanvasElement,
  name: string
): Promise<File> =>
  new Promise((resolve, reject) => {
    const mask = document.createElement("canvas");
    mask.width = strokes.width;
    mask.height = strokes.height;
    const context = mask.getContext("2d");
    if (!context) {
      reject(new Error("This browser has no 2D canvas."));
      return;
    }
    context.fillStyle = "black";
    context.fillRect(0, 0, mask.width, mask.height);
    context.drawImage(strokes, 0, 0);
    mask.toBlob((blob) => {
      if (blob) {
        resolve(new File([blob], name, { type: "image/png" }));
      } else {
        reject(new Error("The mask could not be encoded."));
      }
    }, "image/png");
  });

const ShotMaskPainterInner: React.FC<ShotMaskPainterProps> = ({
  stillUrl,
  initialMask,
  onCancel,
  onDone
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [tool, setTool] = useState<Tool>("brush");
  const [brush, setBrush] = useState(DEFAULT_BRUSH);
  const [ready, setReady] = useState(false);

  // Size the canvas to the still once it has decoded, and carry over a mask
  // painted on an earlier open.
  const handleImageLoad = useCallback(() => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas) {
      return;
    }
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    if (initialMask) {
      canvas.getContext("2d")?.drawImage(initialMask, 0, 0);
    }
    setReady(true);
  }, [initialMask]);

  useEffect(() => {
    if (imageRef.current?.complete && imageRef.current.naturalWidth > 0) {
      handleImageLoad();
    }
  }, [handleImageLoad]);

  /** A pointer position in still pixels, and the brush radius in them. */
  const toCanvas = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = event.currentTarget;
      const rect = canvas.getBoundingClientRect();
      const scale = rect.width > 0 ? canvas.width / rect.width : 1;
      return {
        x: (event.clientX - rect.left) * scale,
        y: (event.clientY - rect.top) * scale,
        radius: (brush / 2) * scale
      };
    },
    [brush]
  );

  const strokeTo = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const context = event.currentTarget.getContext("2d");
      if (!context) {
        return;
      }
      const { x, y, radius } = toCanvas(event);
      const from = last.current ?? { x, y };
      context.save();
      context.globalCompositeOperation =
        tool === "eraser" ? "destination-out" : "source-over";
      context.strokeStyle = STROKE_COLOR;
      context.fillStyle = STROKE_COLOR;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = radius * 2;
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(x, y);
      context.stroke();
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      context.restore();
      last.current = { x, y };
    },
    [toCanvas, tool]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (event.button !== 0 || !ready) {
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      last.current = null;
      strokeTo(event);
    },
    [ready, strokeTo]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (last.current) {
        strokeTo(event);
      }
    },
    [strokeTo]
  );

  const handlePointerUp = useCallback(() => {
    last.current = null;
  }, []);

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const handleDone = useCallback(() => {
    const canvas = canvasRef.current;
    onDone(canvas && hasPaint(canvas) ? canvas : null);
  }, [onDone]);

  return (
    <Dialog
      open
      onClose={onCancel}
      title="Paint the area to change"
      maxWidth="lg"
      actions={
        <FlexRow align="center" gap={SPACING.sm}>
          <EditorButton onClick={onCancel}>Cancel</EditorButton>
          <EditorButton
            variant="contained"
            color="primary"
            onClick={handleDone}
            disabled={!ready}
          >
            Use this area
          </EditorButton>
        </FlexRow>
      }
    >
      <FlexColumn gap={SPACING.md} align="center">
        <FlexRow align="center" gap={SPACING.md} wrap sx={{ alignSelf: "stretch" }}>
          <ToggleGroup
            exclusive
            size="small"
            segmented
            value={tool}
            onChange={(_event, next: Tool | null) => {
              if (next) {
                setTool(next);
              }
            }}
            aria-label="Painting tool"
          >
            <ToggleOption value="brush">Brush</ToggleOption>
            <ToggleOption value="eraser">Eraser</ToggleOption>
          </ToggleGroup>
          <FlexRow align="center" gap={SPACING.sm}>
            <Caption color="secondary" id="shot-mask-brush-label">
              Brush size
            </Caption>
            <Slider
              density="compact"
              sx={{ width: "8rem" }}
              value={brush}
              min={MIN_BRUSH}
              max={MAX_BRUSH}
              onChange={(_event, value) =>
                setBrush(Array.isArray(value) ? value[0] : value)
              }
              aria-labelledby="shot-mask-brush-label"
            />
          </FlexRow>
          <EditorButton size="small" onClick={handleClear}>
            Clear
          </EditorButton>
        </FlexRow>
        <Box sx={frameSx}>
          {/* The still is the backdrop the strokes are judged against. */}
          <Box
            component="img"
            ref={imageRef}
            src={stillUrl}
            alt="Still to paint on"
            crossOrigin="anonymous"
            onLoad={handleImageLoad}
            sx={{ maxWidth: "100%", maxHeight: "65vh", display: "block" }}
          />
          <Box
            component="canvas"
            ref={canvasRef}
            aria-label="Mask painting area"
            data-testid="shot-mask-canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            sx={layerSx}
          />
        </Box>
        <Caption color="secondary">
          Paint over what should change. The rest of the still is kept.
        </Caption>
      </FlexColumn>
    </Dialog>
  );
};

export const ShotMaskPainter = memo(ShotMaskPainterInner);
ShotMaskPainter.displayName = "ShotMaskPainter";

export default ShotMaskPainter;
