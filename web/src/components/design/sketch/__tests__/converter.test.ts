/**
 * Tests for Sketch format converter
 */

import { convertFromSketch, convertToSketch } from "../converter";
import type { LayoutCanvasData } from "../../types";
import FileFormat from "@sketch-hq/sketch-file-format-ts";

type SketchPage = FileFormat.Page;

// Mock SketchPage for testing
const createMockSketchPage = (): SketchPage => ({
  _class: "page",
  do_objectID: "test-page-id",
  booleanOperation: -1,
  exportOptions: {
    _class: "exportOptions",
    exportFormats: [],
    includedLayerIds: [],
    layerOptions: 0,
    shouldTrim: false
  },
  frame: {
    _class: "rect",
    constrainProportions: false,
    x: 0,
    y: 0,
    width: 800,
    height: 600
  },
  isFixedToViewport: false,
  isFlippedHorizontal: false,
  isFlippedVertical: false,
  isLocked: false,
  isTemplate: false,
  isVisible: true,
  layerListExpandedType: 2,
  name: "Test Page",
  nameIsFixed: false,
  resizingConstraint: 63,
  resizingType: 0,
  rotation: 0,
  shouldBreakMaskChain: false,
  hasClickThrough: false,
  horizontalRulerData: { _class: "rulerData", base: 0, guides: [] },
  verticalRulerData: { _class: "rulerData", base: 0, guides: [] },
  layers: []
});

// Mock LayoutCanvasData for testing
const createMockCanvasData = (): LayoutCanvasData => ({
  type: "layout_canvas",
  width: 800,
  height: 600,
  backgroundColor: "#ffffff",
  elements: [
    {
      id: "rect-1",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      rotation: 0,
      zIndex: 0,
      visible: true,
      locked: false,
      name: "Rectangle 1",
      properties: {
        fillColor: "#ff0000",
        borderColor: "#000000",
        borderWidth: 2,
        borderRadius: 10,
        opacity: 1
      }
    },
    {
      id: "text-1",
      type: "text",
      x: 50,
      y: 50,
      width: 200,
      height: 50,
      rotation: 0,
      zIndex: 1,
      visible: true,
      locked: false,
      name: "Text 1",
      properties: {
        content: "Hello World",
        fontFamily: "Inter",
        fontSize: 24,
        fontWeight: "normal",
        color: "#333333",
        alignment: "left",
        verticalAlignment: "top",
        lineHeight: 1.2,
        letterSpacing: 0,
        textDecoration: "none",
        textTransform: "none"
      }
    }
  ],
  exposedInputs: []
});

describe("Sketch converter", () => {
  describe("convertFromSketch", () => {
    it("converts empty Sketch page to canvas data", () => {
      const sketchPage = createMockSketchPage();
      const result = convertFromSketch(sketchPage);

      expect(result.type).toBe("layout_canvas");
      expect(result.width).toBe(800);
      expect(result.height).toBe(600);
      expect(result.elements).toHaveLength(0);
    });

    it("sets default background color when no artboard", () => {
      const sketchPage = createMockSketchPage();
      const result = convertFromSketch(sketchPage);
      
      expect(result.backgroundColor).toBe("#ffffff");
    });
  });

  describe("convertToSketch", () => {
    it("converts canvas data to Sketch page", () => {
      const canvasData = createMockCanvasData();
      const result = convertToSketch(canvasData, "Test Page");

      expect(result._class).toBe("page");
      expect(result.name).toBe("Test Page");
      expect(result.layers).toHaveLength(1); // Should have one artboard
    });

    it("creates artboard with correct dimensions", () => {
      const canvasData = createMockCanvasData();
      const result = convertToSketch(canvasData);

      const artboard = result.layers[0];
      expect(artboard._class).toBe("artboard");
      expect(artboard.frame.width).toBe(800);
      expect(artboard.frame.height).toBe(600);
    });

    it("converts elements to Sketch layers", () => {
      const canvasData = createMockCanvasData();
      const result = convertToSketch(canvasData);

      const artboard = result.layers[0] as { layers: Array<{ _class: string }> };
      // Should have 2 layers (rectangle and text)
      expect(artboard.layers).toHaveLength(2);
    });

    it("generates unique UUIDs for layers", () => {
      const canvasData = createMockCanvasData();
      const result = convertToSketch(canvasData);

      expect(result.do_objectID).toBeTruthy();
      expect(result.do_objectID).not.toBe("");
    });
  });

  describe("round-trip conversion", () => {
    it("preserves canvas dimensions through conversion", () => {
      const originalData = createMockCanvasData();
      const sketchPage = convertToSketch(originalData);
      const convertedBack = convertFromSketch(sketchPage);

      expect(convertedBack.width).toBe(originalData.width);
      expect(convertedBack.height).toBe(originalData.height);
    });
  });
});
