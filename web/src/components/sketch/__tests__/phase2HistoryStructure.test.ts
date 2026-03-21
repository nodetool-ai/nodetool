/**
 * Tests for Phase 2: Enhanced undo/redo history with layer structure
 *
 * Verifies that history entries capture and restore full layer structure
 * (order, visibility, opacity, blend mode, etc.) in addition to pixel data.
 */

import { act } from "@testing-library/react";
import { useSketchStore } from "../state/useSketchStore";

beforeEach(() => {
  act(() => {
    useSketchStore.getState().resetDocument();
  });
});

describe("History — layer structure snapshots", () => {
  it("pushHistory captures layerStructure array", () => {
    act(() => {
      useSketchStore.getState().pushHistory("test");
    });
    const entry = useSketchStore.getState().history[0];
    expect(entry.layerStructure).toBeDefined();
    expect(Array.isArray(entry.layerStructure)).toBe(true);
    expect(entry.layerStructure.length).toBe(1); // default 1 layer
  });

  it("pushHistory captures activeLayerId and maskLayerId", () => {
    act(() => {
      useSketchStore.getState().pushHistory("test");
    });
    const entry = useSketchStore.getState().history[0];
    expect(entry.activeLayerId).toBe(
      useSketchStore.getState().document.activeLayerId
    );
    expect(entry.maskLayerId).toBe(
      useSketchStore.getState().document.maskLayerId
    );
  });

  it("layerStructure snapshot contains all metadata fields", () => {
    act(() => {
      useSketchStore.getState().pushHistory("test");
    });
    const ls = useSketchStore.getState().history[0].layerStructure[0];
    expect(ls).toHaveProperty("id");
    expect(ls).toHaveProperty("name");
    expect(ls).toHaveProperty("type");
    expect(ls).toHaveProperty("visible");
    expect(ls).toHaveProperty("opacity");
    expect(ls).toHaveProperty("locked");
    expect(ls).toHaveProperty("alphaLock");
    expect(ls).toHaveProperty("blendMode");
  });

  it("undo restores layer structure when layers are added then undone", () => {
    // Capture initial state
    act(() => {
      useSketchStore.getState().pushHistory("initial");
    });
    expect(useSketchStore.getState().document.layers).toHaveLength(1);

    // Add a new layer
    act(() => {
      useSketchStore.getState().pushHistory("add layer");
      useSketchStore.getState().addLayer("Layer 2");
    });
    expect(useSketchStore.getState().document.layers).toHaveLength(2);

    // Undo should restore to 1 layer
    act(() => {
      useSketchStore.getState().undo();
    });
    expect(useSketchStore.getState().document.layers).toHaveLength(1);
  });

  it("undo restores layer structure when layers are removed then undone", () => {
    // Add a second layer
    act(() => {
      useSketchStore.getState().addLayer("Layer 2");
    });
    expect(useSketchStore.getState().document.layers).toHaveLength(2);

    // Capture state with 2 layers
    act(() => {
      useSketchStore.getState().pushHistory("before remove");
    });

    // Remove a layer
    const layerToRemove = useSketchStore.getState().document.layers[1].id;
    act(() => {
      useSketchStore.getState().pushHistory("remove layer");
      useSketchStore.getState().removeLayer(layerToRemove);
    });
    expect(useSketchStore.getState().document.layers).toHaveLength(1);

    // Undo should restore to 2 layers
    act(() => {
      useSketchStore.getState().undo();
    });
    expect(useSketchStore.getState().document.layers).toHaveLength(2);
  });

  it("undo restores layer visibility changes", () => {
    const layerId = useSketchStore.getState().document.activeLayerId;
    expect(useSketchStore.getState().document.layers[0].visible).toBe(true);

    // Capture state before visibility change
    act(() => {
      useSketchStore.getState().pushHistory("before toggle");
    });

    // Toggle visibility
    act(() => {
      useSketchStore.getState().pushHistory("toggle visibility");
      useSketchStore.getState().toggleLayerVisibility(layerId);
    });
    expect(useSketchStore.getState().document.layers[0].visible).toBe(false);

    // Undo should restore visibility
    act(() => {
      useSketchStore.getState().undo();
    });
    expect(useSketchStore.getState().document.layers[0].visible).toBe(true);
  });

  it("undo restores layer opacity changes", () => {
    const layerId = useSketchStore.getState().document.activeLayerId;

    act(() => {
      useSketchStore.getState().pushHistory("before opacity");
    });

    act(() => {
      useSketchStore.getState().pushHistory("change opacity");
      useSketchStore.getState().setLayerOpacity(layerId, 0.5);
    });
    expect(useSketchStore.getState().document.layers[0].opacity).toBe(0.5);

    act(() => {
      useSketchStore.getState().undo();
    });
    expect(useSketchStore.getState().document.layers[0].opacity).toBe(1);
  });

  it("undo restores layer blend mode changes", () => {
    const layerId = useSketchStore.getState().document.activeLayerId;

    act(() => {
      useSketchStore.getState().pushHistory("before blend");
    });

    act(() => {
      useSketchStore.getState().pushHistory("change blend mode");
      useSketchStore.getState().setLayerBlendMode(layerId, "multiply");
    });
    expect(useSketchStore.getState().document.layers[0].blendMode).toBe(
      "multiply"
    );

    act(() => {
      useSketchStore.getState().undo();
    });
    expect(useSketchStore.getState().document.layers[0].blendMode).toBe(
      "normal"
    );
  });

  it("redo restores layer structure after undo", () => {
    // Restore point 0: 1 layer
    act(() => {
      useSketchStore.getState().pushHistory("initial");
    });

    // Add a layer
    act(() => {
      useSketchStore.getState().addLayer("Layer 2");
    });
    expect(useSketchStore.getState().document.layers).toHaveLength(2);

    // Restore point 1: 2 layers
    act(() => {
      useSketchStore.getState().pushHistory("after add");
    });

    // Toggle visibility and create restore point 2
    act(() => {
      useSketchStore.getState().toggleLayerVisibility(
        useSketchStore.getState().document.layers[1].id
      );
    });
    act(() => {
      useSketchStore.getState().pushHistory("after toggle");
    });

    // Undo to restore point 1 (2 layers, visibility restored)
    act(() => {
      useSketchStore.getState().undo();
    });
    expect(useSketchStore.getState().document.layers).toHaveLength(2);

    // Undo to restore point 0 (1 layer)
    act(() => {
      useSketchStore.getState().undo();
    });
    expect(useSketchStore.getState().document.layers).toHaveLength(1);

    // Redo should restore to restore point 1 (2 layers)
    act(() => {
      useSketchStore.getState().redo();
    });
    expect(useSketchStore.getState().document.layers).toHaveLength(2);
  });

  it("undo restores activeLayerId", () => {
    // Add a layer
    act(() => {
      useSketchStore.getState().pushHistory("initial");
    });
    const originalActiveId = useSketchStore.getState().document.activeLayerId;

    act(() => {
      useSketchStore.getState().pushHistory("add layer");
      const newId = useSketchStore.getState().addLayer("Layer 2");
      useSketchStore.getState().setActiveLayer(newId);
    });
    expect(useSketchStore.getState().document.activeLayerId).not.toBe(
      originalActiveId
    );

    // Undo should restore the original active layer
    act(() => {
      useSketchStore.getState().undo();
    });
    expect(useSketchStore.getState().document.activeLayerId).toBe(
      originalActiveId
    );
  });

  it("undo restores layer rename", () => {
    const layerId = useSketchStore.getState().document.activeLayerId;
    const originalName = useSketchStore.getState().document.layers[0].name;

    act(() => {
      useSketchStore.getState().pushHistory("before rename");
    });

    act(() => {
      useSketchStore.getState().pushHistory("rename");
      useSketchStore.getState().renameLayer(layerId, "New Name");
    });
    expect(useSketchStore.getState().document.layers[0].name).toBe("New Name");

    act(() => {
      useSketchStore.getState().undo();
    });
    expect(useSketchStore.getState().document.layers[0].name).toBe(
      originalName
    );
  });

  it("undo restores alpha lock toggle", () => {
    const layerId = useSketchStore.getState().document.activeLayerId;

    act(() => {
      useSketchStore.getState().pushHistory("before alpha lock");
    });

    act(() => {
      useSketchStore.getState().pushHistory("toggle alpha lock");
      useSketchStore.getState().toggleAlphaLock(layerId);
    });
    expect(useSketchStore.getState().document.layers[0].alphaLock).toBe(true);

    act(() => {
      useSketchStore.getState().undo();
    });
    expect(useSketchStore.getState().document.layers[0].alphaLock).toBe(false);
  });

  it("undo restores layer reorder", () => {
    // Add second layer
    act(() => {
      useSketchStore.getState().addLayer("Layer 2");
    });

    const layerNames = () =>
      useSketchStore.getState().document.layers.map((l) => l.name);

    const originalOrder = layerNames();

    act(() => {
      useSketchStore.getState().pushHistory("before reorder");
    });

    act(() => {
      useSketchStore.getState().pushHistory("reorder");
      useSketchStore.getState().reorderLayers(0, 1);
    });
    expect(layerNames()).not.toEqual(originalOrder);

    act(() => {
      useSketchStore.getState().undo();
    });
    expect(layerNames()).toEqual(originalOrder);
  });
});
