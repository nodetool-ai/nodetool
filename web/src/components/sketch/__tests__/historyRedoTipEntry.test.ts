/**
 * Phase 2 Fixes – Tests for history redo fix, canUndo after first push,
 * and tool-change color-sync store-level behavior.
 */

import { act } from "@testing-library/react";
import { useSketchStore } from "../state/useSketchStore";
import { MAX_HISTORY_SIZE } from "../types";

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
    it("undo from the tip steps back exactly one and redo returns to the live edit", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;

      // Push-before-mutate (stroke convention): pushHistory snapshots the
      // CURRENT state, then we mutate — so the live document is one edit ahead
      // of the last checkpoint.
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

      // Verify baseline: 2 entries, index at 1, layer has action2 (live) data
      expect(useSketchStore.getState().history).toHaveLength(2);
      expect(useSketchStore.getState().historyIndex).toBe(1);
      expect(useSketchStore.getState().document.layers[0].data).toBe(
        "data:image/png;base64,action2pixels"
      );

      // Undo from the dirty tip → appends a "current state" tip so redo can
      // return, and steps back EXACTLY one edit to action1pixels (not two).
      act(() => {
        useSketchStore.getState().undo();
      });
      expect(useSketchStore.getState().history).toHaveLength(3);
      expect(useSketchStore.getState().historyIndex).toBe(1);
      expect(useSketchStore.getState().history[2].action).toBe("current state");
      expect(useSketchStore.getState().document.layers[0].data).toBe(
        "data:image/png;base64,action1pixels"
      );

      // Redo → returns to the live edit (action2pixels)
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
      // The tip now matches the live state (redo restored it), so this undo is
      // a clean step back — it does NOT append another tip entry.
      const histLen = useSketchStore.getState().history.length;
      expect(histLen).toBe(3);

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

    it("undo over clean checkpoints does not append tip entries", () => {
      // Three checkpoints with no uncommitted edit ahead of the live document
      // (no data mutations between pushes). Each undo steps back one without
      // growing history — no "current state" tips are appended.
      act(() => {
        useSketchStore.getState().pushHistory("x");
        useSketchStore.getState().pushHistory("y");
        useSketchStore.getState().pushHistory("z");
      });

      act(() => {
        useSketchStore.getState().undo();
      });
      expect(useSketchStore.getState().history).toHaveLength(3);
      expect(useSketchStore.getState().historyIndex).toBe(1);

      act(() => {
        useSketchStore.getState().undo();
      });
      expect(useSketchStore.getState().history).toHaveLength(3);
      expect(useSketchStore.getState().historyIndex).toBe(0);
    });

    it("new action after undo truncates the redo tip", () => {
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

      // Undo from the dirty tip → appends "current state" (length 2 → 3) and
      // lands at index 1 ("second" checkpoint = "first" pixels).
      act(() => {
        useSketchStore.getState().undo();
      });
      expect(useSketchStore.getState().history).toHaveLength(3);
      expect(useSketchStore.getState().historyIndex).toBe(1);

      // A new action truncates everything after the current index, dropping
      // the "current state" redo tip.
      act(() => {
        useSketchStore.getState().pushHistory("branch");
      });
      expect(useSketchStore.getState().history).toHaveLength(3);
      expect(useSketchStore.getState().history[2].action).toBe("branch");
      expect(useSketchStore.getState().historyIndex).toBe(2);
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

  // ---------------------------------------------------------------
  // 4. Push-before-mutate (stroke) undo correctness — regressions for the
  //    off-by-one, the un-undoable first stroke, and unbounded growth.
  // ---------------------------------------------------------------
  describe("stroke-convention undo (push-before-mutate)", () => {
    // Mirrors handleStrokeStart: push the pre-stroke snapshot, then the stroke
    // commits new pixels to the live layer.
    const stroke = (layerId: string, label: string, data: string) => {
      useSketchStore.getState().pushHistory(label);
      useSketchStore.getState().updateLayerData(layerId, data);
    };

    it("the first stroke on a fresh document can be undone", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;
      const blank = useSketchStore.getState().document.layers[0].data;

      act(() => stroke(layerId, "s1", "data:image/png;base64,S1"));

      // A single checkpoint with an uncommitted stroke ahead of it is undoable.
      expect(useSketchStore.getState().historyIndex).toBe(0);
      expect(useSketchStore.getState().canUndo()).toBe(true);

      act(() => {
        useSketchStore.getState().undo();
      });
      expect(useSketchStore.getState().document.layers[0].data).toBe(blank);

      act(() => {
        useSketchStore.getState().redo();
      });
      expect(useSketchStore.getState().document.layers[0].data).toBe(
        "data:image/png;base64,S1"
      );
    });

    it("each undo steps back exactly one stroke (no skipping)", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;
      const blank = useSketchStore.getState().document.layers[0].data;

      act(() => {
        stroke(layerId, "s1", "data:image/png;base64,S1");
        stroke(layerId, "s2", "data:image/png;base64,S2");
        stroke(layerId, "s3", "data:image/png;base64,S3");
      });
      expect(useSketchStore.getState().document.layers[0].data).toBe(
        "data:image/png;base64,S3"
      );

      const seen: (string | null)[] = [];
      act(() => {
        while (useSketchStore.getState().canUndo()) {
          useSketchStore.getState().undo();
          seen.push(useSketchStore.getState().document.layers[0].data);
        }
      });

      // Three strokes → three undos, hitting every intermediate state in order.
      expect(seen).toEqual([
        "data:image/png;base64,S2",
        "data:image/png;base64,S1",
        blank
      ]);

      // Redo walks back up through the same ladder to the live edit.
      act(() => {
        while (useSketchStore.getState().canRedo()) {
          useSketchStore.getState().redo();
        }
      });
      expect(useSketchStore.getState().document.layers[0].data).toBe(
        "data:image/png;base64,S3"
      );
    });

    it("redo-to-tip then undo cycling does not grow history past the cap", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;
      act(() => {
        stroke(layerId, "s1", "data:image/png;base64,S1");
        stroke(layerId, "s2", "data:image/png;base64,S2");
      });

      act(() => {
        for (let i = 0; i < 60; i++) {
          while (useSketchStore.getState().canRedo()) {
            useSketchStore.getState().redo();
          }
          useSketchStore.getState().undo();
        }
      });

      // The clean-tip check means redo-restored tips are not re-appended, so
      // history stays bounded by the cap rather than growing per cycle.
      expect(
        useSketchStore.getState().history.length
      ).toBeLessThanOrEqual(MAX_HISTORY_SIZE);

      act(() => {
        while (useSketchStore.getState().canRedo()) {
          useSketchStore.getState().redo();
        }
      });
      expect(useSketchStore.getState().document.layers[0].data).toBe(
        "data:image/png;base64,S2"
      );
    });
  });
});
