import { renderHook, act } from "@testing-library/react";
import useNodeAnnotationStore from "../NodeAnnotationStore";

describe("NodeAnnotationStore", () => {
  beforeEach(() => {
    act(() => {
      useNodeAnnotationStore.getState().clearEditingState();
    });
  });

  test("initial state has dialog closed", () => {
    const { result } = renderHook(() => useNodeAnnotationStore());

    expect(result.current.isDialogOpen).toBe(false);
    expect(result.current.editingNodeId).toBe(null);
    expect(result.current.annotationText).toBe("");
  });

  test("openAnnotationDialog sets correct state", () => {
    const { result } = renderHook(() => useNodeAnnotationStore());

    act(() => {
      result.current.openAnnotationDialog("node-1", "Test annotation");
    });

    expect(result.current.isDialogOpen).toBe(true);
    expect(result.current.editingNodeId).toBe("node-1");
    expect(result.current.annotationText).toBe("Test annotation");
  });

  test("openAnnotationDialog works without current annotation", () => {
    const { result } = renderHook(() => useNodeAnnotationStore());

    act(() => {
      result.current.openAnnotationDialog("node-2");
    });

    expect(result.current.isDialogOpen).toBe(true);
    expect(result.current.editingNodeId).toBe("node-2");
    expect(result.current.annotationText).toBe("");
  });

  test("closeAnnotationDialog resets state", () => {
    const { result } = renderHook(() => useNodeAnnotationStore());

    act(() => {
      result.current.openAnnotationDialog("node-1", "Test");
      result.current.closeAnnotationDialog();
    });

    expect(result.current.isDialogOpen).toBe(false);
    expect(result.current.editingNodeId).toBe(null);
    expect(result.current.annotationText).toBe("");
  });

  test("setAnnotationText updates annotation text", () => {
    const { result } = renderHook(() => useNodeAnnotationStore());

    act(() => {
      result.current.setAnnotationText("New annotation text");
    });

    expect(result.current.annotationText).toBe("New annotation text");
  });

  test("clearEditingState resets all state", () => {
    const { result } = renderHook(() => useNodeAnnotationStore());

    act(() => {
      result.current.openAnnotationDialog("node-1", "Test");
      result.current.setAnnotationText("Modified");
      result.current.clearEditingState();
    });

    expect(result.current.isDialogOpen).toBe(false);
    expect(result.current.editingNodeId).toBe(null);
    expect(result.current.annotationText).toBe("");
  });
});
