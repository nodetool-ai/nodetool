/**
 * Tests for extracted controller hooks
 *
 * Verifies that the hooks module exports all expected hooks
 * and that the hooks can be imported successfully.
 */

import {
  useSketchStoreSelectors,
  useHistoryActions,
  useLayerActions,
  useCanvasActions,
  useColorActions
} from "../hooks";

describe("sketch hooks exports", () => {
  it("exports useSketchStoreSelectors", () => {
    expect(typeof useSketchStoreSelectors).toBe("function");
  });

  it("exports useHistoryActions", () => {
    expect(typeof useHistoryActions).toBe("function");
  });

  it("exports useLayerActions", () => {
    expect(typeof useLayerActions).toBe("function");
  });

  it("exports useCanvasActions", () => {
    expect(typeof useCanvasActions).toBe("function");
  });

  it("exports useColorActions", () => {
    expect(typeof useColorActions).toBe("function");
  });
});
