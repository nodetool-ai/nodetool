/**
 * @jest-environment jsdom
 *
 * Tests for useResolvedToolSettings().
 */
import { act, renderHook } from "@testing-library/react";
import { useSketchStore } from "../state/useSketchStore";
import { useResolvedToolSettings } from "../hooks/useSketchStoreSelectors";

describe("useResolvedToolSettings", () => {
  beforeEach(() => {
    act(() => {
      useSketchStore.getState().resetDocument();
    });
  });

  it("includes move settings and reflects move auto-select overrides", () => {
    act(() => {
      useSketchStore.getState().setMoveSettings({ autoSelect: false });
    });

    const { result } = renderHook(() => useResolvedToolSettings());

    expect(result.current.move).toEqual(
      expect.objectContaining({ autoSelect: false })
    );
  });
});
