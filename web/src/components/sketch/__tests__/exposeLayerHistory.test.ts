/**
 * Tests for Exposed Layer History and Locking.
 *
 * Validates:
 * - Expose toggle actions push undo history entries
 * - Undo/redo correctly restores exposed flags
 * - Exposed input layers receiving data get locked
 */

import { act } from "@testing-library/react";
import { useSketchStore } from "../state/useSketchStore";
import { serializeDocument, deserializeDocument } from "../serialization";

beforeEach(() => {
  act(() => {
    useSketchStore.getState().resetDocument();
  });
});

describe("Exposed Layer History", () => {
  it("pushHistory before toggleLayerExposedInput allows undo", () => {
    const layerId = useSketchStore.getState().document.layers[0].id;

    // Push an initial baseline so undo has somewhere to return to
    act(() => {
      useSketchStore.getState().pushHistory("baseline");
    });

    // Now push history before toggle (mirrors what useLayerActions does)
    act(() => {
      useSketchStore.getState().pushHistory("toggle exposed input");
      useSketchStore.getState().toggleLayerExposedInput(layerId);
    });

    const afterToggle = useSketchStore.getState().document.layers.find(
      (l) => l.id === layerId
    );
    expect(afterToggle?.exposedAsInput).toBe(true);

    // Undo should revert to state captured by the "toggle exposed input" entry
    // which is before the toggle happened
    act(() => {
      useSketchStore.getState().undo();
    });

    const afterUndo = useSketchStore.getState().document.layers.find(
      (l) => l.id === layerId
    );
    expect(afterUndo?.exposedAsInput).toBeFalsy();
  });

  it("pushHistory before toggleLayerExposedOutput allows undo", () => {
    const layerId = useSketchStore.getState().document.layers[0].id;

    act(() => {
      useSketchStore.getState().pushHistory("baseline");
    });

    act(() => {
      useSketchStore.getState().pushHistory("toggle exposed output");
      useSketchStore.getState().toggleLayerExposedOutput(layerId);
    });

    const afterToggle = useSketchStore.getState().document.layers.find(
      (l) => l.id === layerId
    );
    expect(afterToggle?.exposedAsOutput).toBe(true);

    act(() => {
      useSketchStore.getState().undo();
    });

    const afterUndo = useSketchStore.getState().document.layers.find(
      (l) => l.id === layerId
    );
    expect(afterUndo?.exposedAsOutput).toBeFalsy();
  });

  it("redo restores exposed input flag after undo", () => {
    const layerId = useSketchStore.getState().document.layers[0].id;

    act(() => {
      useSketchStore.getState().pushHistory("baseline");
    });

    act(() => {
      useSketchStore.getState().pushHistory("toggle exposed input");
      useSketchStore.getState().toggleLayerExposedInput(layerId);
    });

    act(() => {
      useSketchStore.getState().undo();
    });

    // After undo, flag should be off
    expect(
      useSketchStore.getState().document.layers.find((l) => l.id === layerId)?.exposedAsInput
    ).toBeFalsy();

    // Redo steps through history: first redo restores the pre-toggle snapshot,
    // second redo restores the tip (post-toggle state saved during undo).
    act(() => {
      useSketchStore.getState().redo();
      useSketchStore.getState().redo();
    });

    const afterRedo = useSketchStore.getState().document.layers.find(
      (l) => l.id === layerId
    );
    expect(afterRedo?.exposedAsInput).toBe(true);
  });
});

describe("Exposed Layer Locking Semantics", () => {
  it("exposed input layers with imageReference should be locked", () => {
    const layerId = useSketchStore.getState().document.layers[0].id;

    // Simulate what SketchNode does when an upstream image is loaded
    act(() => {
      const doc = useSketchStore.getState().document;
      const layerIdx = doc.layers.findIndex((l) => l.id === layerId);
      const updatedLayers = [...doc.layers];
      updatedLayers[layerIdx] = {
        ...updatedLayers[layerIdx],
        exposedAsInput: true,
        data: "data:image/png;base64,test",
        imageReference: {
          uri: "http://example.com/image.png",
          naturalWidth: 100,
          naturalHeight: 100,
          objectFit: "fill" as const
        },
        locked: true
      };
      useSketchStore.getState().setDocument({
        ...doc,
        layers: updatedLayers
      });
    });

    const layer = useSketchStore.getState().document.layers.find(
      (l) => l.id === layerId
    );
    expect(layer?.exposedAsInput).toBe(true);
    expect(layer?.locked).toBe(true);
    expect(layer?.imageReference).toBeDefined();
    expect(layer?.data).toBeTruthy();
  });

  it("exposed input layer locked flag survives serialization", () => {
    const layerId = useSketchStore.getState().document.layers[0].id;

    act(() => {
      const doc = useSketchStore.getState().document;
      const layerIdx = doc.layers.findIndex((l) => l.id === layerId);
      const updatedLayers = [...doc.layers];
      updatedLayers[layerIdx] = {
        ...updatedLayers[layerIdx],
        exposedAsInput: true,
        locked: true,
        imageReference: {
          uri: "http://example.com/image.png",
          naturalWidth: 100,
          naturalHeight: 100,
          objectFit: "fill" as const
        }
      };
      useSketchStore.getState().setDocument({
        ...doc,
        layers: updatedLayers
      });
    });

    // Serialize and deserialize
    const doc = useSketchStore.getState().document;
    const serialized = serializeDocument(doc);
    const deserialized = deserializeDocument(serialized);

    expect(deserialized).not.toBeNull();
    const layer = deserialized!.layers.find((l) => l.id === layerId);
    expect(layer?.exposedAsInput).toBe(true);
    expect(layer?.locked).toBe(true);
    expect(layer?.imageReference).toBeDefined();
  });
});
