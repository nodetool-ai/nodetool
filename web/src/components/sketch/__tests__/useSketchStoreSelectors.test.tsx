/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, renderHook } from "@testing-library/react";
import { useSketchStore } from "../state/useSketchStore";
import { useSketchStoreSelectors } from "../hooks/useSketchStoreSelectors";

describe("useSketchStoreSelectors", () => {
  beforeEach(() => {
    act(() => {
      useSketchStore.getState().resetDocument();
    });
  });

  it("does not rerender on unrelated pan updates", () => {
    let renders = 0;

    renderHook(() => {
      renders += 1;
      return useSketchStoreSelectors();
    });

    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().setPan({ x: 24, y: -12 });
    });

    expect(renders).toBe(1);
  });
});
