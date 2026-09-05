/**
 * @jest-environment jsdom
 *
 * Agent-driven layer verbs: `SketchAgentHandler.mergeLayerDown` and
 * `flattenVisible`.
 *
 * Both are two-part operations — the runtime bakes pixels, then the store
 * rewrites the stack. The store half alone deletes the upper layer and resets
 * the survivor to identity, so a bridge that skips the runtime half reports
 * success while discarding every pixel the merged layer carried. These tests
 * read the pixels back.
 */

import { act, render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import SketchEditor from "../SketchEditor";
import { SketchProvider } from "../../../stores/sketch/SketchInstance";
import { useSketchSessionStore } from "../../../stores/sketch/SketchSessionStore";
import { useSketchStore } from "../state/useSketchStore";
import { getSketchAgentHandler } from "../sketchAgentBridge";

jest.mock("../../../hooks/useResolvedMediaUri");

jest.mock("../SketchAgentPanel", () => ({
  __esModule: true,
  default: () => null
}));

const DOC_ID = "sketch-agent-layer-ops-doc";

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

function displayCanvas(): HTMLCanvasElement {
  const canvas = document.querySelector<HTMLCanvasElement>(
    "canvas.sketch-canvas__display"
  );
  if (!canvas) throw new Error("display canvas not mounted");
  return canvas;
}

function redCount(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 200 && data[i + 1] < 60 && data[i + 3] > 0) count++;
  }
  return count;
}

function paintRedOnUpper(handler: ReturnType<typeof getSketchAgentHandler>, target: string) {
  act(() => {
    handler.paintStrokes([
      {
        target,
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
}

describe("SketchAgentHandler.mergeLayerDown", () => {
  it("keeps the upper layer's pixels on the survivor", () => {
    mountEditor();
    const handler = getSketchAgentHandler(DOC_ID);

    let upperId = "";
    act(() => {
      upperId = handler.addLayer({ name: "Upper" }).id;
    });
    paintRedOnUpper(handler, upperId);
    expect(redCount(displayCanvas())).toBeGreaterThan(0);

    const survivorId = useSketchStore.getState().document.layers[0].id;

    act(() => {
      handler.mergeLayerDown(upperId);
    });

    const layers = useSketchStore.getState().document.layers;
    expect(layers).toHaveLength(1);
    expect(layers[0].id).toBe(survivorId);
    // The merged raster must be on the survivor: without the runtime half the
    // survivor keeps its own (empty) pixels and the red is gone.
    expect(layers[0].data).toBeTruthy();
    expect(redCount(displayCanvas())).toBeGreaterThan(0);
  });
});

describe("SketchAgentHandler.flattenVisible", () => {
  it("keeps the visible pixels on the flattened layer", () => {
    mountEditor();
    const handler = getSketchAgentHandler(DOC_ID);

    let upperId = "";
    act(() => {
      upperId = handler.addLayer({ name: "Upper" }).id;
    });
    paintRedOnUpper(handler, upperId);
    expect(redCount(displayCanvas())).toBeGreaterThan(0);

    let flattened = "";
    act(() => {
      flattened = handler.flattenVisible().id;
    });

    const layers = useSketchStore.getState().document.layers;
    expect(layers).toHaveLength(1);
    expect(layers[0].id).toBe(flattened);
    expect(layers[0].data).toBeTruthy();
    expect(redCount(displayCanvas())).toBeGreaterThan(0);
  });
});
