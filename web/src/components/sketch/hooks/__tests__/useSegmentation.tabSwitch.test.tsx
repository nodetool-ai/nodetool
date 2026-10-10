/**
 * @jest-environment jsdom
 *
 * "Split selected layer" applies its masks after a model call that takes
 * seconds. An inactive workspace tab stays mounted but leaves the activation
 * stack, so reading the document through `getState()` once the model answers
 * put the split into whichever document was focused by then.
 */
import React from "react";
import { act, renderHook } from "@testing-library/react";

import type { SegmentationRequest } from "../../sam";

const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let answer: (value: unknown) => void = () => {};
const runSegmentation = jest.fn(
  (_request: SegmentationRequest) =>
    new Promise((resolve) => {
      answer = resolve;
    })
);

jest.mock("../../sam", () => {
  const actual = jest.requireActual("../../sam");
  return {
    ...actual,
    getSegmentationService: () => ({ runSegmentation }),
    generateCutoutDataUrl: async () => PIXEL,
    toAlphaMaskDataUrl: async () => PIXEL
  };
});

import { useSegmentation } from "../useSegmentation";
import {
  SketchProvider,
  createSketchInstance,
  type SketchInstance
} from "../../../../stores/sketch/SketchInstance";
import { createDefaultDocument, createDefaultLayer } from "../../types";

let tabActive = true;
const tabWrapper = (instance: SketchInstance) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <SketchProvider instance={instance} active={tabActive}>
      {children}
    </SketchProvider>
  );
  return Wrapper;
};

const seedTab = (): { tab: SketchInstance; layerId: string } => {
  const tab = createSketchInstance();
  const layer = { ...createDefaultLayer("Photo"), data: PIXEL };
  tab.editor.setState({
    document: {
      ...createDefaultDocument(),
      layers: [layer],
      activeLayerId: layer.id
    },
    selectedLayerIds: [layer.id]
  });
  return { tab, layerId: layer.id };
};

describe("a layer split that lands after a tab switch", () => {
  it("adds the objects to the document it was started from", async () => {
    const { tab, layerId } = seedTab();
    const pushHistory = jest.fn();
    const { result, rerender } = renderHook(
      () => useSegmentation({ canvasRef: { current: null }, pushHistory }),
      { wrapper: tabWrapper(tab) }
    );

    let split: Promise<void> = Promise.resolve();
    act(() => {
      split = result.current.splitSelectedLayer();
    });
    tabActive = false;
    rerender();
    await act(async () => {
      answer({
        masks: [
          {
            maskDataUrl: PIXEL,
            bounds: { x: 0, y: 0, width: 1, height: 1 },
            confidence: 0.9,
            label: "Boat"
          }
        ]
      });
      await split;
    });

    const layers = tab.editor.getState().document.layers;
    expect(layers.map((layer) => layer.name)).toEqual([
      "Photo",
      "Segmented Objects",
      "Boat"
    ]);
    expect(layers[0].id).toBe(layerId);
    expect(pushHistory).toHaveBeenCalledWith("Split Selected Layer");
  });
});
