/** @jsxImportSource @emotion/react */
/**
 * GeneratingLayerOverlay
 *
 * Paints a "magic" animated overlay on top of every layer that is currently
 * generating (binding status "queued" or "generating"). Rendered inside the
 * canvas' document-space wrapper (see SketchCanvasPresentation), so each box is
 * positioned in raw document coordinates and the shared pan/zoom transform maps
 * it onto the artboard automatically.
 *
 * Pure CSS effects (emotion keyframes): a hue-flowing border, a breathing
 * multi-colour aura, a diagonal shimmer sweep, a soft inner tint, and a few
 * twinkling sparkles. All suppressed under prefers-reduced-motion.
 */

import { css, keyframes } from "@emotion/react";
import { memo } from "react";

import { useSketchStore } from "./state";
import { useSketchSessionStore } from "../../stores/sketch/SketchInstance";
import { computeTransformedCorners } from "./transform/geometry/layerGeometry";
import { BORDER_RADIUS, MagicGenerationFill, reducedMotion } from "../ui_primitives";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const isGenerating = (status: string | undefined): boolean =>
  status === "queued" || status === "generating";

const aabbOf = (corners: ReadonlyArray<{ x: number; y: number }>): Rect => {
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY
  };
};

// ─── Animations ────────────────────────────────────────────────────────────

const borderFlow = keyframes`
  0%   { border-color: rgba(110, 231, 255, 0.9); }
  33%  { border-color: rgba(168, 85, 247, 0.9); }
  66%  { border-color: rgba(236, 72, 153, 0.9); }
  100% { border-color: rgba(110, 231, 255, 0.9); }
`;

const auraPulse = keyframes`
  0%, 100% {
    box-shadow:
      0 0 0 1.5px rgba(167, 139, 250, 0.6),
      0 0 16px 2px rgba(99, 102, 241, 0.4),
      inset 0 0 22px rgba(168, 85, 247, 0.15);
  }
  50% {
    box-shadow:
      0 0 0 2px rgba(110, 231, 255, 0.85),
      0 0 34px 6px rgba(168, 85, 247, 0.55),
      inset 0 0 38px rgba(110, 231, 255, 0.25);
  }
`;

const sparkleTwinkle = keyframes`
  0%, 100% { opacity: 0; transform: scale(0.3); }
  50%      { opacity: 1; transform: scale(1); }
`;

// ─── Styles ──────────────────────────────────────────────────────────────────

const boxCss = css({
  position: "absolute",
  boxSizing: "border-box",
  borderRadius: BORDER_RADIUS.sm,
  border: "2px solid rgba(110, 231, 255, 0.9)",
  overflow: "hidden",
  pointerEvents: "none",
  willChange: "box-shadow, border-color",
  animation: `${borderFlow} 3s linear infinite, ${auraPulse} 1.8s ease-in-out infinite`,
  // The flowing wash + shimmer fill (MagicGenerationFill) is rendered as
  // children below; the box itself contributes the border + aura glow.
  ...reducedMotion({ animation: "none" })
});

const sparkleCss = css({
  position: "absolute",
  width: 6,
  height: 6,
  borderRadius: "50%",
  background:
    "radial-gradient(circle, #fff 0%, rgba(110, 231, 255, 0.9) 40%, transparent 70%)",
  animation: `${sparkleTwinkle} 1.4s ease-in-out infinite`,
  ...reducedMotion({ animation: "none", opacity: 0 })
});

const SPARKLES = [
  { top: "10%", left: "14%", delay: "0s" },
  { top: "20%", left: "80%", delay: "0.3s" },
  { top: "70%", left: "24%", delay: "0.6s" },
  { top: "62%", left: "72%", delay: "0.15s" },
  { top: "44%", left: "52%", delay: "0.45s" }
] as const;

// ─── Component ───────────────────────────────────────────────────────────────

const MagicBox = ({ rect }: { rect: Rect }) => (
  <div
    css={boxCss}
    style={{
      left: rect.x,
      top: rect.y,
      width: rect.width,
      height: rect.height
    }}
  >
    <MagicGenerationFill />
    {SPARKLES.map((s) => (
      <span
        key={`${s.top}-${s.left}`}
        css={sparkleCss}
        style={{ top: s.top, left: s.left, animationDelay: s.delay }}
      />
    ))}
  </div>
);

const GeneratingLayerOverlay = memo(function GeneratingLayerOverlay() {
  const layers = useSketchStore((s) => s.document.layers);
  const canvas = useSketchStore((s) => s.document.canvas);
  const bindings = useSketchSessionStore((s) => s.bindings);

  const boxes = layers
    .filter((layer) => layer.visible && isGenerating(bindings[layer.id]?.status))
    .map((layer) => {
      const corners = computeTransformedCorners(
        layer.transform,
        layer.contentBounds
      );
      const rect = aabbOf(corners);
      // Fresh layers can have an empty raster; fall back to the full artboard so
      // the effect still reads while the first result streams in.
      const usable =
        Number.isFinite(rect.width) &&
        Number.isFinite(rect.height) &&
        rect.width >= 1 &&
        rect.height >= 1;
      return {
        id: layer.id,
        rect: usable
          ? rect
          : { x: 0, y: 0, width: canvas.width, height: canvas.height }
      };
    });

  if (boxes.length === 0) {
    return null;
  }

  return (
    <>
      {boxes.map(({ id, rect }) => (
        <MagicBox key={id} rect={rect} />
      ))}
    </>
  );
});

export default GeneratingLayerOverlay;
