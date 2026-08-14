/**
 * @jest-environment jsdom
 *
 * Agent-driven painting: `SketchAgentHandler.paintStrokes`.
 *
 * Two levels, because a stroke that draws pixels into a detached canvas is not
 * the same as a stroke the user can see:
 *
 * 1. `paintAgentStroke` — the pixels themselves. Brush, pencil and eraser each
 *    change the layer bitmap, alpha lock still clamps transparency, and a
 *    one-point stroke lays a dab.
 * 2. The live editor — a real `SketchEditor` is mounted, the agent handler it
 *    registers is called, and the assertion is made against the *display*
 *    canvas, so a stroke that never reaches the composite fails here.
 *
 * jsdom renders canvas 2D for real in this project's Jest setup (the radial
 * brush stamp included), so no headless canvas shim is needed.
 */

import React from "react";
import { act, render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import SketchEditor from "../SketchEditor";
import { SketchProvider } from "../../../stores/sketch/SketchInstance";
import { useSketchSessionStore } from "../../../stores/sketch/SketchSessionStore";
import { useSketchStore } from "../state/useSketchStore";
import { getSketchAgentHandler } from "../sketchAgentBridge";
import { paintAgentStroke } from "../painting/agentStrokes";
import { createDefaultDocument, type Layer } from "../types";

jest.mock("../SketchAgentPanel", () => ({
  __esModule: true,
  default: () => null
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

const DOC_ID = "sketch-agent-paint-doc";

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = window.document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function pixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

/** Count pixels with any alpha at all. */
function opaqueCount(canvas: HTMLCanvasElement): number {
  const data = pixels(canvas);
  let count = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) count++;
  }
  return count;
}

/** Count pixels that read as the given channel-dominant color. */
function redCount(canvas: HTMLCanvasElement): number {
  const data = pixels(canvas);
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 200 && data[i + 1] < 60 && data[i + 3] > 0) count++;
  }
  return count;
}

function rgbaAt(
  canvas: HTMLCanvasElement,
  x: number,
  y: number
): [number, number, number, number] {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
  return [r, g, b, a];
}

function alphaAt(canvas: HTMLCanvasElement, x: number, y: number): number {
  return rgbaAt(canvas, x, y)[3];
}

/** A fresh single-layer document plus that layer's backing canvas. */
function makeTarget(size = 64) {
  const doc = createDefaultDocument(size, size);
  const layer: Layer = doc.layers[0];
  return { doc, layer, canvas: makeCanvas(size, size), size };
}

// ─── 1. The pixels ──────────────────────────────────────────────────────────

describe("paintAgentStroke", () => {
  it("paints a brush stroke in the requested color", () => {
    const { doc, layer, canvas } = makeTarget();
    expect(opaqueCount(canvas)).toBe(0);

    const outcome = paintAgentStroke({
      stroke: {
        layerId: layer.id,
        tool: "brush",
        points: [
          { x: 8, y: 8 },
          { x: 56, y: 56 }
        ],
        color: "#ff0000",
        size: 8,
        hardness: 1
      },
      layer,
      layerCanvas: canvas,
      toolSettings: doc.toolSettings,
      foregroundColor: "#00ff00",
      canvasSize: doc.canvas
    });

    expect(opaqueCount(canvas)).toBeGreaterThan(0);
    expect(redCount(canvas)).toBeGreaterThan(0);
    expect(outcome.tool).toBe("brush");
    expect(outcome.points).toBe(2);
    expect(outcome.bounds).not.toBeNull();
    expect(outcome.bounds!.width).toBeGreaterThan(0);
  });

  it("falls back to the editor's foreground color", () => {
    const { doc, layer, canvas } = makeTarget();
    paintAgentStroke({
      stroke: {
        layerId: layer.id,
        points: [
          { x: 8, y: 32 },
          { x: 56, y: 32 }
        ],
        size: 8,
        hardness: 1
      },
      layer,
      layerCanvas: canvas,
      toolSettings: doc.toolSettings,
      foregroundColor: "#ff0000",
      canvasSize: doc.canvas
    });
    expect(redCount(canvas)).toBeGreaterThan(0);
  });

  it("paints a pencil stroke", () => {
    const { doc, layer, canvas } = makeTarget();
    const outcome = paintAgentStroke({
      stroke: {
        layerId: layer.id,
        tool: "pencil",
        points: [
          { x: 4, y: 20 },
          { x: 60, y: 20 }
        ],
        color: "#ff0000",
        size: 3
      },
      layer,
      layerCanvas: canvas,
      toolSettings: doc.toolSettings,
      foregroundColor: "#ffffff",
      canvasSize: doc.canvas
    });
    expect(opaqueCount(canvas)).toBeGreaterThan(0);
    expect(outcome.tool).toBe("pencil");
  });

  it("lays a single dab for a one-point stroke", () => {
    const { doc, layer, canvas } = makeTarget();
    const outcome = paintAgentStroke({
      stroke: {
        layerId: layer.id,
        points: [{ x: 32, y: 32 }],
        color: "#ff0000",
        size: 12,
        hardness: 1
      },
      layer,
      layerCanvas: canvas,
      toolSettings: doc.toolSettings,
      foregroundColor: "#ffffff",
      canvasSize: doc.canvas
    });
    expect(outcome.points).toBe(1);
    expect(alphaAt(canvas, 32, 32)).toBeGreaterThan(0);
    // A dab, not a stroke across the canvas.
    expect(alphaAt(canvas, 2, 2)).toBe(0);
  });

  it("connects last back to first when the stroke is closed", () => {
    const openCanvas = makeCanvas(64, 64);
    const closedCanvas = makeCanvas(64, 64);
    const { doc, layer } = makeTarget();
    const triangle = [
      { x: 12, y: 12 },
      { x: 52, y: 12 },
      { x: 52, y: 52 }
    ];
    const base = {
      layer,
      toolSettings: doc.toolSettings,
      foregroundColor: "#ffffff",
      canvasSize: doc.canvas
    };
    paintAgentStroke({
      ...base,
      layerCanvas: openCanvas,
      stroke: {
        layerId: layer.id,
        points: triangle,
        color: "#ff0000",
        size: 4,
        hardness: 1
      }
    });
    paintAgentStroke({
      ...base,
      layerCanvas: closedCanvas,
      stroke: {
        layerId: layer.id,
        points: triangle,
        color: "#ff0000",
        size: 4,
        hardness: 1,
        closed: true
      }
    });

    // The closing leg runs along the hypotenuse, which the open path never
    // touches: its midpoint is painted only in the closed run.
    expect(alphaAt(openCanvas, 32, 32)).toBe(0);
    expect(alphaAt(closedCanvas, 32, 32)).toBeGreaterThan(0);
    expect(opaqueCount(closedCanvas)).toBeGreaterThan(opaqueCount(openCanvas));
  });

  it("erases pixels the layer already had", () => {
    const { doc, layer, canvas, size } = makeTarget();
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, size, size);
    expect(opaqueCount(canvas)).toBe(size * size);

    paintAgentStroke({
      stroke: {
        layerId: layer.id,
        tool: "eraser",
        points: [
          { x: 8, y: 32 },
          { x: 56, y: 32 }
        ],
        size: 12
      },
      layer,
      layerCanvas: canvas,
      toolSettings: doc.toolSettings,
      foregroundColor: "#ffffff",
      canvasSize: doc.canvas
    });

    expect(opaqueCount(canvas)).toBeLessThan(size * size);
    expect(alphaAt(canvas, 32, 32)).toBe(0);
    // Away from the stroke the fill survives.
    expect(alphaAt(canvas, 2, 2)).toBe(255);
  });

  it("keeps alpha-locked transparency transparent", () => {
    const { doc, layer, canvas } = makeTarget();
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#0000ff";
    ctx.fillRect(0, 0, 20, 20);

    const locked: Layer = { ...layer, alphaLock: true };
    paintAgentStroke({
      stroke: {
        layerId: locked.id,
        points: [
          { x: 4, y: 10 },
          { x: 60, y: 10 }
        ],
        color: "#ff0000",
        size: 6,
        hardness: 1
      },
      layer: locked,
      layerCanvas: canvas,
      toolSettings: doc.toolSettings,
      foregroundColor: "#ffffff",
      canvasSize: doc.canvas
    });

    // Inside the opaque block the paint lands (blue turns red); outside the
    // block alpha lock keeps the layer transparent.
    expect(rgbaAt(canvas, 10, 10)).toEqual([255, 0, 0, 255]);
    expect(alphaAt(canvas, 50, 10)).toBe(0);
  });

  it("reports no bounds for an empty stroke", () => {
    const { doc, layer, canvas } = makeTarget();
    const outcome = paintAgentStroke({
      stroke: { layerId: layer.id, points: [] },
      layer,
      layerCanvas: canvas,
      toolSettings: doc.toolSettings,
      foregroundColor: "#ffffff",
      canvasSize: doc.canvas
    });
    expect(outcome.bounds).toBeNull();
    expect(opaqueCount(canvas)).toBe(0);
  });
});

// ─── 2. The live editor ─────────────────────────────────────────────────────

/** Mount a real editor and register its agent handler under {@link DOC_ID}. */
function mountEditor() {
  const view = render(
    <ThemeProvider theme={mockTheme}>
      <SketchProvider>
        <SketchEditor documentId={DOC_ID} />
      </SketchProvider>
    </ThemeProvider>
  );
  act(() => {
    useSketchSessionStore.setState({ documentId: DOC_ID });
  });
  return view;
}

/** The canvas the user actually looks at. */
function displayCanvas(): HTMLCanvasElement {
  const canvas = document.querySelector<HTMLCanvasElement>(
    "canvas.sketch-canvas__display"
  );
  if (!canvas) throw new Error("display canvas not mounted");
  return canvas;
}

describe("SketchAgentHandler.paintStrokes in the live editor", () => {
  it("paints onto the layer and shows it on the display canvas", () => {
    mountEditor();
    const layerId = useSketchStore.getState().document.activeLayerId;
    const dataBefore = useSketchStore
      .getState()
      .document.layers.find((l) => l.id === layerId)?.data;
    expect(redCount(displayCanvas())).toBe(0);

    let results: ReturnType<
      ReturnType<typeof getSketchAgentHandler>["paintStrokes"]
    > = [];
    act(() => {
      results = getSketchAgentHandler(DOC_ID).paintStrokes([
        {
          points: [
            { x: 40, y: 40 },
            { x: 300, y: 300 }
          ],
          color: "#ff0000",
          size: 24,
          hardness: 1
        }
      ]);
    });

    // The composited display carries the stroke — a no-op paintStrokes anywhere
    // in the chain leaves this at zero.
    expect(redCount(displayCanvas())).toBeGreaterThan(0);

    expect(results).toHaveLength(1);
    expect(results[0].layerId).toBe(layerId);
    expect(results[0].layerName).toBe("Background");
    expect(results[0].tool).toBe("brush");
    expect(results[0].points).toBe(2);
    expect(results[0].bounds).not.toBeNull();

    // The pixels were committed onto the document, which is what marks it
    // dirty for autosave.
    const dataAfter = useSketchStore
      .getState()
      .document.layers.find((l) => l.id === layerId)?.data;
    expect(dataAfter).toBeTruthy();
    expect(dataAfter).not.toBe(dataBefore);
  });

  it("commits a whole batch as one undo entry", () => {
    mountEditor();
    const before = useSketchStore.getState().history.length;

    act(() => {
      getSketchAgentHandler(DOC_ID).paintStrokes([
        {
          points: [
            { x: 30, y: 30 },
            { x: 200, y: 30 }
          ],
          color: "#ff0000",
          size: 16
        },
        {
          points: [
            { x: 30, y: 80 },
            { x: 200, y: 80 }
          ],
          color: "#00ff00",
          size: 16
        },
        {
          points: [
            { x: 30, y: 130 },
            { x: 200, y: 130 }
          ],
          color: "#0000ff",
          size: 16
        }
      ]);
    });

    expect(useSketchStore.getState().history.length).toBe(before + 1);
    expect(
      useSketchStore.getState().history[before].action
    ).toBe("paint 3 strokes");
    expect(redCount(displayCanvas())).toBeGreaterThan(0);
  });

  it("refuses a locked layer without painting anything", () => {
    mountEditor();
    const layerId = useSketchStore.getState().document.activeLayerId;
    act(() => {
      const doc = useSketchStore.getState().document;
      useSketchStore.getState().setDocument({
        ...doc,
        layers: doc.layers.map((l) =>
          l.id === layerId ? { ...l, locked: true } : l
        )
      });
    });
    const historyBefore = useSketchStore.getState().history.length;

    expect(() =>
      getSketchAgentHandler(DOC_ID).paintStrokes([
        {
          points: [
            { x: 40, y: 40 },
            { x: 300, y: 300 }
          ],
          color: "#ff0000",
          size: 24
        }
      ])
    ).toThrow(/locked/i);

    expect(redCount(displayCanvas())).toBe(0);
    expect(useSketchStore.getState().history.length).toBe(historyBefore);
  });

  it("refuses a layer that is not a raster layer", () => {
    mountEditor();
    act(() => {
      useSketchStore.getState().addGroup("Group A");
    });

    expect(() =>
      getSketchAgentHandler(DOC_ID).paintStrokes([
        {
          target: "Group A",
          points: [{ x: 40, y: 40 }],
          color: "#ff0000"
        }
      ])
    ).toThrow(/raster/i);
    expect(redCount(displayCanvas())).toBe(0);
  });

  it("refuses a target the document does not have", () => {
    mountEditor();
    expect(() =>
      getSketchAgentHandler(DOC_ID).paintStrokes([
        { target: "Nope", points: [{ x: 1, y: 1 }] }
      ])
    ).toThrow(/Layer not found/i);
  });
});
