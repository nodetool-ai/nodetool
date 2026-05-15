/**
 * Phase 2 Fixes – Tests for history redo fix, canUndo after first push,
 * and tool-change color-sync store-level behavior.
 */

import { act } from "@testing-library/react";
import { useSketchStore } from "../state/useSketchStore";

beforeEach(() => {
  act(() => {
    useSketchStore.getState().resetDocument();
  });
});

describe("Phase 2 Fixes", () => {
  // ---------------------------------------------------------------
  // 1. History Redo Fix – undo from tip appends a "current state"
  //    snapshot so redo can restore it.
  // ---------------------------------------------------------------
  describe("history redo fix (tip-entry append on undo)", () => {
    it("redo restores the most-recent state after undo from the tip", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;

      // Push two history entries with different layer data.
      // pushHistory snapshots the CURRENT state, then we mutate.
      act(() => {
        useSketchStore.getState().pushHistory("action1");
        useSketchStore
          .getState()
          .updateLayerData(layerId, "data:image/png;base64,action1pixels");
        useSketchStore.getState().pushHistory("action2");
        useSketchStore
          .getState()
          .updateLayerData(layerId, "data:image/png;base64,action2pixels");
      });

      // Verify baseline: 2 entries, index at 1, layer has action2 data
      expect(useSketchStore.getState().history).toHaveLength(2);
      expect(useSketchStore.getState().historyIndex).toBe(1);
      expect(useSketchStore.getState().document.layers[0].data).toBe(
        "data:image/png;base64,action2pixels"
      );

      // Undo from the tip – should append a tip entry
      act(() => {
        useSketchStore.getState().undo();
      });

      expect(useSketchStore.getState().history).toHaveLength(3);
      expect(useSketchStore.getState().historyIndex).toBe(0);

      // The appended tip entry should be labelled "current state"
      expect(useSketchStore.getState().history[2].action).toBe(
        "current state"
      );

      // First redo → restores entry at index 1 (action2 snapshot captured action1 data)
      act(() => {
        useSketchStore.getState().redo();
      });
      expect(useSketchStore.getState().historyIndex).toBe(1);
      expect(useSketchStore.getState().document.layers[0].data).toBe(
        "data:image/png;base64,action1pixels"
      );

      // Second redo → restores the tip entry (action2 live state)
      act(() => {
        useSketchStore.getState().redo();
      });
      expect(useSketchStore.getState().historyIndex).toBe(2);
      expect(useSketchStore.getState().document.layers[0].data).toBe(
        "data:image/png;base64,action2pixels"
      );
    });

    it("multiple undo-redo cycles work correctly", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;

      act(() => {
        useSketchStore.getState().pushHistory("a");
        useSketchStore
          .getState()
          .updateLayerData(layerId, "data:image/png;base64,A");
        useSketchStore.getState().pushHistory("b");
        useSketchStore
          .getState()
          .updateLayerData(layerId, "data:image/png;base64,B");
      });

      // Cycle 1: undo then redo back to tip
      act(() => {
        useSketchStore.getState().undo();
      });
      expect(useSketchStore.getState().history).toHaveLength(3);

      act(() => {
        useSketchStore.getState().redo();
        useSketchStore.getState().redo();
      });
      expect(useSketchStore.getState().document.layers[0].data).toBe(
        "data:image/png;base64,B"
      );

      // Cycle 2: undo again from the new tip (now index 2, length 3)
      act(() => {
        useSketchStore.getState().undo();
      });
      // undo from tip when historyIndex === history.length - 1 → appends another tip entry
      // However the tip data hasn't changed so it still works
      const histLen = useSketchStore.getState().history.length;
      expect(histLen).toBeGreaterThanOrEqual(3);

      // Redo all the way back
      while (useSketchStore.getState().canRedo()) {
        act(() => {
          useSketchStore.getState().redo();
        });
      }
      expect(useSketchStore.getState().document.layers[0].data).toBe(
        "data:image/png;base64,B"
      );
    });

    it("undo from a non-tip position does not add an extra tip entry", () => {
      act(() => {
        useSketchStore.getState().pushHistory("x");
        useSketchStore.getState().pushHistory("y");
        useSketchStore.getState().pushHistory("z");
      });

      // First undo from tip – adds tip entry (3 → 4)
      act(() => {
        useSketchStore.getState().undo();
      });
      expect(useSketchStore.getState().history).toHaveLength(4);
      expect(useSketchStore.getState().historyIndex).toBe(1);

      // Second undo from index 1 (non-tip, since length=4) – should NOT add another entry
      act(() => {
        useSketchStore.getState().undo();
      });
      expect(useSketchStore.getState().history).toHaveLength(4);
      expect(useSketchStore.getState().historyIndex).toBe(0);
    });

    it("new action after undo truncates the tip entry", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;

      act(() => {
        useSketchStore.getState().pushHistory("first");
        useSketchStore
          .getState()
          .updateLayerData(layerId, "data:image/png;base64,first");
        useSketchStore.getState().pushHistory("second");
        useSketchStore
          .getState()
          .updateLayerData(layerId, "data:image/png;base64,second");
      });

      // Undo from tip → appends tip entry (length 2 → 3)
      act(() => {
        useSketchStore.getState().undo();
      });
      expect(useSketchStore.getState().history).toHaveLength(3);

      // Push a new action – should truncate everything after current index (0)
      act(() => {
        useSketchStore.getState().pushHistory("branch");
      });

      // History should now be [entry0, branchEntry], tip entry gone
      expect(useSketchStore.getState().history).toHaveLength(2);
      expect(useSketchStore.getState().history[1].action).toBe("branch");
      expect(useSketchStore.getState().historyIndex).toBe(1);
    });
  });

  // ---------------------------------------------------------------
  // 2. canUndo semantics after first push
  // ---------------------------------------------------------------
  describe("canUndo after first push", () => {
    it("canUndo is false with a single history entry (index 0)", () => {
      act(() => {
        useSketchStore.getState().pushHistory("only");
      });
      // historyIndex === 0 → canUndo = 0 > 0 = false
      // You need at least two entries to go from index 1 back to 0.
      expect(useSketchStore.getState().historyIndex).toBe(0);
      expect(useSketchStore.getState().canUndo()).toBe(false);
    });

    it("canUndo becomes true after the second push", () => {
      act(() => {
        useSketchStore.getState().pushHistory("one");
        useSketchStore.getState().pushHistory("two");
      });
      expect(useSketchStore.getState().historyIndex).toBe(1);
      expect(useSketchStore.getState().canUndo()).toBe(true);
    });

    it("canUndo returns false again after undoing to index 0", () => {
      act(() => {
        useSketchStore.getState().pushHistory("one");
        useSketchStore.getState().pushHistory("two");
      });
      act(() => {
        useSketchStore.getState().undo();
      });
      // After undo, historyIndex === 0
      expect(useSketchStore.getState().historyIndex).toBe(0);
      expect(useSketchStore.getState().canUndo()).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // 3. Tool change does not directly alter foreground color
  //    (Color sync happens in the React useEffect in useColorActions,
  //     so we verify the store itself is inert with respect to color.)
  // ---------------------------------------------------------------
  describe("tool change does not alter foreground color at store level", () => {
    it("setActiveTool does not change foregroundColor", () => {
      const originalColor = useSketchStore.getState().foregroundColor;

      act(() => {
        useSketchStore.getState().setActiveTool("eraser");
      });
      expect(useSketchStore.getState().foregroundColor).toBe(originalColor);

      act(() => {
        useSketchStore.getState().setActiveTool("pencil");
      });
      expect(useSketchStore.getState().foregroundColor).toBe(originalColor);

      act(() => {
        useSketchStore.getState().setActiveTool("brush");
      });
      expect(useSketchStore.getState().foregroundColor).toBe(originalColor);
    });

    it("setActiveTool does not change backgroundColor", () => {
      const originalBg = useSketchStore.getState().backgroundColor;

      act(() => {
        useSketchStore.getState().setActiveTool("fill");
      });
      expect(useSketchStore.getState().backgroundColor).toBe(originalBg);
    });
  });
});
