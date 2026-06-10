import React, { useEffect, useRef } from "react";

interface BitmapCanvasProps {
  bitmap: ImageBitmap;
  style?: React.CSSProperties;
  className?: string;
  onDoubleClick?: React.MouseEventHandler<HTMLCanvasElement>;
  "aria-label"?: string;
}

/**
 * Paints a preview `ImageBitmap` (the in-browser runner's zero-copy transport
 * format) straight onto a canvas. This is the fast display path for live GPU
 * image outputs: drawImage of an already-decoded bitmap, no PNG encode/decode,
 * no `<img>` preload round-trip — a new frame is on screen within a paint.
 */
const BitmapCanvas: React.FC<BitmapCanvasProps> = ({
  bitmap,
  style,
  className,
  onDoubleClick,
  "aria-label": ariaLabel
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    try {
      ctx.drawImage(bitmap, 0, 0);
    } catch {
      // Bitmap was closed elsewhere — keep the previous frame.
    }
  }, [bitmap]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={ariaLabel}
      className={className}
      style={style}
      onDoubleClick={onDoubleClick}
    />
  );
};

export default React.memo(BitmapCanvas);
