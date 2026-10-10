/**
 * Feather, expand and the other GPU selection refinements are undo steps, and
 * a result that lands after the selection changed must not overwrite it.
 */

import { act } from "@testing-library/react";
import { useSketchStore } from "../state/useSketchStore";
import { cloneSelectionMask, expandSelectionMask, rectSelectionMask } from "../selection";
import type { Selection } from "../types";
import type { SketchRuntime } from "../rendering/types";

function deferredExpandRuntime(): {
  runtime: SketchRuntime;
  finish: () => void;
} {
  let pending: Selection | null = null;
  let resolve: ((sel: Selection | null) => void) | null = null;
  const runtime: Partial<SketchRuntime> = {
    setSelection: (sel: Selection | null) => {
      pending = sel;
    },
    expandSelectionGpu: (radius: number) =>
      new Promise<Selection | null>((r) => {
        resolve = (sel) => r(sel);
        const copy = cloneSelectionMask(pending!);
        expandSelectionMask(copy, radius);
        pending = copy;
      })
  };
  return {
    runtime: runtime as SketchRuntime,
    finish: () => resolve?.(pending)
  };
}

function selectRect(x: number): Selection {
  const { width, height } = useSketchStore.getState().document.canvas;
  const sel = rectSelectionMask(width, height, x, 10, 20, 20);
  useSketchStore.getState().setSelection(sel);
  useSketchStore.getState().pushHistory("selection", undefined, { selectionOnly: true });
  return useSketchStore.getState().selection!;
}

beforeEach(() => {
  act(() => {
    useSketchStore.getState().resetDocument();
    useSketchStore.setState({ selection: null, lastSelection: null });
    useSketchStore.getState().pushHistory("open", undefined, { timing: "before" });
  });
});

afterEach(() => {
  useSketchStore.getState().setRuntimeInstance(null);
});

describe("GPU selection refinements", () => {
  it("record one undo step that restores the selection before the refinement", async () => {
    const { runtime, finish } = deferredExpandRuntime();
    useSketchStore.getState().setRuntimeInstance(runtime);
    const original = selectRect(10);

    const done = useSketchStore.getState().expandCurrentSelection(4);
    finish();
    await act(async () => {
      await done;
    });

    const expanded = useSketchStore.getState().selection!;
    expect(expanded).not.toBe(original);
    expect(useSketchStore.getState().history.at(-1)?.action).toBe("expand selection");

    act(() => {
      useSketchStore.getState().undo();
    });
    expect(useSketchStore.getState().selection).toBe(original);
  });

  it("drop a result that lands after the selection changed", async () => {
    const { runtime, finish } = deferredExpandRuntime();
    useSketchStore.getState().setRuntimeInstance(runtime);
    selectRect(10);

    const done = useSketchStore.getState().expandCurrentSelection(4);
    const newer = selectRect(100);
    finish();
    await act(async () => {
      await done;
    });

    expect(useSketchStore.getState().selection).toBe(newer);
    expect(useSketchStore.getState().history.at(-1)?.action).toBe("selection");
  });
});
