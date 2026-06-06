import { act, renderHook } from "@testing-library/react";

import { useEditHistory } from "../useEditHistory";

describe("useEditHistory", () => {
  it("starts empty with no undo/redo", () => {
    const { result } = renderHook(() => useEditHistory<number>());
    expect(result.current.present).toBeNull();
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("commits, undoes, and redoes", () => {
    const { result } = renderHook(() => useEditHistory<number>());

    act(() => result.current.reset(1));
    expect(result.current.present).toBe(1);
    expect(result.current.canUndo).toBe(false);

    act(() => result.current.commit(2));
    act(() => result.current.commit(3));
    expect(result.current.present).toBe(3);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);

    act(() => result.current.undo());
    expect(result.current.present).toBe(2);
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.undo());
    expect(result.current.present).toBe(1);
    expect(result.current.canUndo).toBe(false);

    act(() => result.current.redo());
    expect(result.current.present).toBe(2);
  });

  it("clears the redo branch on a new commit", () => {
    const { result } = renderHook(() => useEditHistory<number>());
    act(() => result.current.reset(1));
    act(() => result.current.commit(2));
    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.commit(9));
    expect(result.current.present).toBe(9);
    expect(result.current.canRedo).toBe(false);
  });

  it("reset discards history", () => {
    const { result } = renderHook(() => useEditHistory<number>());
    act(() => result.current.reset(1));
    act(() => result.current.commit(2));
    act(() => result.current.reset(5));
    expect(result.current.present).toBe(5);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });
});
