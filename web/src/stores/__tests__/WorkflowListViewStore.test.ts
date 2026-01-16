import { renderHook, act } from "@testing-library/react";
import {
  useWorkflowListViewStore,
  useWorkflowListViewActions,
  useShowGraphPreview,
} from "../WorkflowListViewStore";

describe("WorkflowListViewStore", () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  it("should have default showGraphPreview as true", () => {
    const { result } = renderHook(() => useShowGraphPreview());
    expect(result.current).toBe(true);
  });

  it("should toggle graph preview", () => {
    const { result: showResult } = renderHook(() => useShowGraphPreview());
    const { result: actionsResult } = renderHook(() =>
      useWorkflowListViewActions()
    );

    expect(showResult.current).toBe(true);

    act(() => {
      actionsResult.current.toggleGraphPreview();
    });

    expect(useWorkflowListViewStore.getState().showGraphPreview).toBe(false);

    act(() => {
      actionsResult.current.toggleGraphPreview();
    });

    expect(useWorkflowListViewStore.getState().showGraphPreview).toBe(true);
  });

  it("should set graph preview to specific value", () => {
    const { result } = renderHook(() => useWorkflowListViewActions());

    act(() => {
      result.current.setShowGraphPreview(false);
    });

    expect(useWorkflowListViewStore.getState().showGraphPreview).toBe(false);

    act(() => {
      result.current.setShowGraphPreview(true);
    });

    expect(useWorkflowListViewStore.getState().showGraphPreview).toBe(true);
  });

  it("should persist state to localStorage", () => {
    const { result } = renderHook(() => useWorkflowListViewActions());

    act(() => {
      result.current.setShowGraphPreview(false);
    });

    // Check localStorage
    const stored = localStorage.getItem("workflow-list-view");
    expect(stored).toBeTruthy();
    if (stored) {
      const parsed = JSON.parse(stored);
      expect(parsed.state.showGraphPreview).toBe(false);
    }
  });
});
