/**
 * Tests for LayoutCanvasStore
 */

import { useLayoutCanvasStore } from "../LayoutCanvasStore";
import { DEFAULT_CANVAS_DATA } from "../types";

describe("LayoutCanvasStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    useLayoutCanvasStore.setState({
      canvasData: { ...DEFAULT_CANVAS_DATA },
      selectedIds: [],
      clipboard: [],
      history: [{ ...DEFAULT_CANVAS_DATA }],
      historyIndex: 0
    });
  });

  describe("addElement", () => {
    it("should add a text element", () => {
      const { addElement, canvasData } = useLayoutCanvasStore.getState();
      const element = addElement("text", 100, 100);

      expect(element.type).toBe("text");
      expect(element.x).toBe(100);
      expect(element.y).toBe(100);
      expect(useLayoutCanvasStore.getState().canvasData.elements).toHaveLength(1);
    });

    it("should add a rectangle element", () => {
      const { addElement } = useLayoutCanvasStore.getState();
      const element = addElement("rectangle", 50, 50);

      expect(element.type).toBe("rectangle");
      expect(element.properties).toHaveProperty("fillColor");
    });

    it("should increment zIndex for new elements", () => {
      const { addElement } = useLayoutCanvasStore.getState();
      const el1 = addElement("text", 0, 0);
      const el2 = addElement("rectangle", 0, 0);

      expect(el2.zIndex).toBeGreaterThan(el1.zIndex);
    });
  });

  describe("selection", () => {
    it("should set selection", () => {
      const { addElement, setSelection, selectedIds } = useLayoutCanvasStore.getState();
      const element = addElement("text", 0, 0);

      useLayoutCanvasStore.getState().setSelection([element.id]);

      expect(useLayoutCanvasStore.getState().selectedIds).toContain(element.id);
    });

    it("should add to selection", () => {
      const { addElement, setSelection, addToSelection } = useLayoutCanvasStore.getState();
      const el1 = addElement("text", 0, 0);
      const el2 = addElement("rectangle", 0, 0);

      useLayoutCanvasStore.getState().setSelection([el1.id]);
      useLayoutCanvasStore.getState().addToSelection(el2.id);

      const state = useLayoutCanvasStore.getState();
      expect(state.selectedIds).toContain(el1.id);
      expect(state.selectedIds).toContain(el2.id);
    });

    it("should clear selection", () => {
      const { addElement, setSelection, clearSelection } = useLayoutCanvasStore.getState();
      const element = addElement("text", 0, 0);

      useLayoutCanvasStore.getState().setSelection([element.id]);
      useLayoutCanvasStore.getState().clearSelection();

      expect(useLayoutCanvasStore.getState().selectedIds).toHaveLength(0);
    });
  });

  describe("updateElement", () => {
    it("should update element properties", () => {
      const { addElement, updateElement, findElement } = useLayoutCanvasStore.getState();
      const element = addElement("text", 0, 0);

      useLayoutCanvasStore.getState().updateElement(element.id, { x: 200, y: 300 });

      const updated = useLayoutCanvasStore.getState().findElement(element.id);
      expect(updated?.x).toBe(200);
      expect(updated?.y).toBe(300);
    });
  });

  describe("deleteElements", () => {
    it("should delete selected elements", () => {
      const { addElement, deleteElements } = useLayoutCanvasStore.getState();
      const el1 = addElement("text", 0, 0);
      const el2 = addElement("rectangle", 0, 0);

      useLayoutCanvasStore.getState().deleteElements([el1.id]);

      const state = useLayoutCanvasStore.getState();
      expect(state.canvasData.elements).toHaveLength(1);
      expect(state.canvasData.elements[0].id).toBe(el2.id);
    });
  });

  describe("copy/paste", () => {
    it("should copy elements to clipboard", () => {
      const { addElement, copyToClipboard } = useLayoutCanvasStore.getState();
      const element = addElement("text", 0, 0);

      useLayoutCanvasStore.getState().copyToClipboard([element.id]);

      expect(useLayoutCanvasStore.getState().clipboard).toHaveLength(1);
    });

    it("should paste elements from clipboard", () => {
      const { addElement, copyToClipboard, pasteFromClipboard } = useLayoutCanvasStore.getState();
      const element = addElement("text", 0, 0);

      useLayoutCanvasStore.getState().copyToClipboard([element.id]);
      const pasted = useLayoutCanvasStore.getState().pasteFromClipboard(10, 10);

      expect(pasted).toHaveLength(1);
      expect(pasted[0].x).toBe(element.x + 10);
      expect(pasted[0].id).not.toBe(element.id);
    });
  });

  describe("visibility and lock", () => {
    it("should toggle visibility", () => {
      const { addElement, toggleVisibility, findElement } = useLayoutCanvasStore.getState();
      const element = addElement("text", 0, 0);

      expect(element.visible).toBe(true);

      useLayoutCanvasStore.getState().toggleVisibility(element.id);

      const updated = useLayoutCanvasStore.getState().findElement(element.id);
      expect(updated?.visible).toBe(false);
    });

    it("should toggle lock", () => {
      const { addElement, toggleLock, findElement } = useLayoutCanvasStore.getState();
      const element = addElement("text", 0, 0);

      expect(element.locked).toBe(false);

      useLayoutCanvasStore.getState().toggleLock(element.id);

      const updated = useLayoutCanvasStore.getState().findElement(element.id);
      expect(updated?.locked).toBe(true);
    });
  });

  describe("undo/redo", () => {
    it("should undo changes", () => {
      const { addElement, undo, canvasData } = useLayoutCanvasStore.getState();
      addElement("text", 0, 0);

      expect(useLayoutCanvasStore.getState().canvasData.elements).toHaveLength(1);

      useLayoutCanvasStore.getState().undo();

      expect(useLayoutCanvasStore.getState().canvasData.elements).toHaveLength(0);
    });

    it("should redo changes", () => {
      const { addElement, undo, redo } = useLayoutCanvasStore.getState();
      addElement("text", 0, 0);

      useLayoutCanvasStore.getState().undo();
      expect(useLayoutCanvasStore.getState().canvasData.elements).toHaveLength(0);

      useLayoutCanvasStore.getState().redo();
      expect(useLayoutCanvasStore.getState().canvasData.elements).toHaveLength(1);
    });
  });

  describe("canvas settings", () => {
    it("should set canvas size", () => {
      const { setCanvasSize } = useLayoutCanvasStore.getState();
      
      useLayoutCanvasStore.getState().setCanvasSize(1024, 768);

      const state = useLayoutCanvasStore.getState();
      expect(state.canvasData.width).toBe(1024);
      expect(state.canvasData.height).toBe(768);
    });

    it("should set background color", () => {
      const { setBackgroundColor } = useLayoutCanvasStore.getState();
      
      useLayoutCanvasStore.getState().setBackgroundColor("#ff0000");

      expect(useLayoutCanvasStore.getState().canvasData.backgroundColor).toBe("#ff0000");
    });
  });

  describe("grid settings", () => {
    it("should toggle grid", () => {
      const { setGridSettings, gridSettings } = useLayoutCanvasStore.getState();
      
      const initialEnabled = useLayoutCanvasStore.getState().gridSettings.enabled;
      useLayoutCanvasStore.getState().setGridSettings({ enabled: !initialEnabled });

      expect(useLayoutCanvasStore.getState().gridSettings.enabled).toBe(!initialEnabled);
    });

    it("should snap to grid", () => {
      const { snapToGrid, setGridSettings } = useLayoutCanvasStore.getState();
      
      useLayoutCanvasStore.getState().setGridSettings({ size: 10, snap: true });
      
      const snapped = useLayoutCanvasStore.getState().snapToGrid(23);
      expect(snapped).toBe(20);
    });

    it("should not snap when disabled", () => {
      const { snapToGrid, setGridSettings } = useLayoutCanvasStore.getState();
      
      useLayoutCanvasStore.getState().setGridSettings({ snap: false });
      
      const snapped = useLayoutCanvasStore.getState().snapToGrid(23);
      expect(snapped).toBe(23);
    });
  });

  describe("exposed inputs", () => {
    it("should add exposed input", () => {
      const { addElement, addExposedInput } = useLayoutCanvasStore.getState();
      const element = addElement("text", 0, 0);

      useLayoutCanvasStore.getState().addExposedInput({
        elementId: element.id,
        property: "content",
        inputName: "text_content",
        inputType: "string"
      });

      const state = useLayoutCanvasStore.getState();
      expect(state.canvasData.exposedInputs).toHaveLength(1);
      expect(state.canvasData.exposedInputs[0].elementId).toBe(element.id);
    });

    it("should remove exposed input", () => {
      const { addElement, addExposedInput, removeExposedInput } = useLayoutCanvasStore.getState();
      const element = addElement("text", 0, 0);

      useLayoutCanvasStore.getState().addExposedInput({
        elementId: element.id,
        property: "content",
        inputName: "text_content",
        inputType: "string"
      });

      useLayoutCanvasStore.getState().removeExposedInput(element.id, "content");

      expect(useLayoutCanvasStore.getState().canvasData.exposedInputs).toHaveLength(0);
    });
  });
});
