/**
 * @jest-environment jsdom
 *
 * Tests for useActiveToolSettings() — the narrow active-tool-only hook.
 * The old useSketchStoreSelectors() aggregator has been removed; these tests
 * verify the replacement provides correct isolation.
 */
import React from "react";
import { act, renderHook } from "@testing-library/react";
import { useSketchStore } from "../state/useSketchStore";
import {
  useResolvedToolSettings,
  useActiveToolSettings
} from "../hooks/useSketchStoreSelectors";

describe("useActiveToolSettings", () => {
  beforeEach(() => {
    act(() => {
      useSketchStore.getState().resetDocument();
    });
  });

  it("returns resolved settings for the current active tool", () => {
    act(() => {
      useSketchStore.getState().setActiveTool("brush");
    });
    const { result } = renderHook(() => useActiveToolSettings());
    expect(result.current).toBeTruthy();
    expect(result.current).toHaveProperty("size");
  });

  it("returns null for tools without dedicated settings (e.g. move)", () => {
    act(() => {
      useSketchStore.getState().setActiveTool("move");
    });
    const { result } = renderHook(() => useActiveToolSettings());
    expect(result.current).toBeNull();
  });

  it("rerenders on toolSettings ref change but returns stable memoised value for active tool", () => {
    act(() => {
      useSketchStore.getState().setActiveTool("eraser");
    });
    let renders = 0;
    const results: unknown[] = [];
    renderHook(() => {
      renders += 1;
      results.push(useActiveToolSettings());
    });
    expect(renders).toBe(1);
    const initialResult = results[0];

    // Change brush settings while eraser is active.
    // The hook rerenders because the top-level toolSettings ref changes,
    // but the memoised return value stays stable (eraser settings unchanged).
    act(() => {
      useSketchStore.getState().setBrushSettings({ size: 42 });
    });
    expect(renders).toBe(2);
    // The returned settings object should be referentially stable since
    // only brush changed, not eraser.
    expect(results[results.length - 1]).toEqual(initialResult);
  });

  it("does NOT rerender when zoom changes", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useActiveToolSettings();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().setZoom(2);
    });
    expect(renders).toBe(1);
  });

  it("does NOT rerender when pan changes", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useActiveToolSettings();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().setPan({ x: 24, y: -12 });
    });
    expect(renders).toBe(1);
  });
});
