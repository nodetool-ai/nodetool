/**
 * GeneratingLayerOverlay
 *
 * Paints a "magic" animated overlay on top of every layer that is currently
 * generating (binding status "queued" or "generating"). Rendered inside the
 * canvas' document-space wrapper (see SketchCanvasPresentation), so each box is
 * positioned in raw document coordinates and the shared pan/zoom transform maps
 * it onto the artboard automatically.
 *
 * Each box is the shared framed `MagicGenerationFill`, the same effect every
 * other generating surface shows.
 */

import { memo } from "react";

import { useSketchStore } from "./state";
import { useSketchSessionStore } from "../../stores/sketch/SketchInstance";
import { computeTransformedCorners } from "./transform/geometry/layerGeometry";
import { BORDER_RADIUS, MagicGenerationFill } from "../ui_primitives";

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

const MagicBox = ({ rect }: { rect: Rect }) => (
  <div
    style={{
      position: "absolute",
      left: rect.x,
      top: rect.y,
      width: rect.width,
      height: rect.height
    }}
  >
    <MagicGenerationFill framed borderRadius={BORDER_RADIUS.sm} />
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
