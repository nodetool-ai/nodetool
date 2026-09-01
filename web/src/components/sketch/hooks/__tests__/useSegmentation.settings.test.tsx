/**
 * The Segment tool must run with the settings the panel is showing.
 *
 * `store.toolSettings` is the live slice the panels write to; the copy on the
 * document is the last saved snapshot. Reading the snapshot ran every
 * segmentation with the shipped defaults, so a typed concept never reached the
 * provider and SAM 3.1 answered with nothing.
 */
import type { SegmentationRequest } from "../../sam";

const runSegmentation = jest.fn(async (_request: SegmentationRequest) => ({
  masks: []
}));

/** The settings the last run was given. */
function settingsUsed(): SegmentationRequest["settings"] {
  const call = runSegmentation.mock.calls[0];
  if (!call) {
    throw new Error("no segmentation ran");
  }
  return call[0].settings;
}

jest.mock("../../sam", () => {
  const actual = jest.requireActual("../../sam");
  return {
    ...actual,
    getSegmentationService: () => ({
      runSegmentation,
      checkModelAvailability: async () => ({
        status: "available",
        modelId: "fal-ai/sam-3-1/image",
        modelName: "SAM 3.1"
      })
    })
  };
});

import { renderHook, act } from "@testing-library/react";
import { useSegmentation } from "../useSegmentation";
import { useSketchStore } from "../../state";
import {
  createDefaultDocument,
  createDefaultLayer,
  DEFAULT_SEGMENT_SETTINGS
} from "../../types";

/** A 1×1 PNG, so the layer has pixels to export. */
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function seedDocument(): void {
  const layer = { ...createDefaultLayer("Photo"), data: PIXEL };
  const doc = {
    ...createDefaultDocument(),
    layers: [layer],
    activeLayerId: layer.id
  };
  useSketchStore.setState({
    document: doc,
    selectedLayerIds: [layer.id],
    // What the panel has written since the document was last saved.
    toolSettings: {
      ...doc.toolSettings,
      segment: {
        ...DEFAULT_SEGMENT_SETTINGS,
        conceptPrompt: "boat",
        maxObjects: 2,
        confidenceThreshold: 0.1
      }
    }
  });
}

describe("useSegmentation settings source", () => {
  beforeEach(() => {
    runSegmentation.mockClear();
    seedDocument();
  });

  const params = {
    canvasRef: { current: null },
    pushHistory: jest.fn()
  };

  it("runs a point segmentation with the panel's live settings", async () => {
    const { result } = renderHook(() => useSegmentation(params));

    await act(async () => {
      await result.current.runSegmentation(
        [{ x: 1, y: 1, label: "positive" }],
        null
      );
    });

    expect(settingsUsed()).toMatchObject({
      conceptPrompt: "boat",
      maxObjects: 2,
      confidenceThreshold: 0.1
    });
  });

  it("runs a layer split with the panel's live settings", async () => {
    const { result } = renderHook(() => useSegmentation(params));

    await act(async () => {
      await result.current.splitSelectedLayer();
    });

    expect(settingsUsed()).toMatchObject({
      conceptPrompt: "boat"
    });
  });
});
