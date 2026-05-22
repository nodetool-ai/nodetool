import { renderHook, act } from "@testing-library/react";
import {
  useWorkflowListViewStore,
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

    expect(showResult.current).toBe(true);

    act(() => {
      useWorkflowListViewStore.getState().actions.toggleGraphPreview();
    });

    expect(useWorkflowListViewStore.getState().showGraphPreview).toBe(false);

    act(() => {
      useWorkflowListViewStore.getState().actions.toggleGraphPreview();
    });

    expect(useWorkflowListViewStore.getState().showGraphPreview).toBe(true);
  });

  it("should set graph preview to specific value", () => {
    act(() => {
      useWorkflowListViewStore.getState().actions.setShowGraphPreview(false);
    });

    expect(useWorkflowListViewStore.getState().showGraphPreview).toBe(false);

    act(() => {
      useWorkflowListViewStore.getState().actions.setShowGraphPreview(true);
    });

    expect(useWorkflowListViewStore.getState().showGraphPreview).toBe(true);
  });

  it("should persist state to localStorage", () => {
    act(() => {
      useWorkflowListViewStore.getState().actions.setShowGraphPreview(false);
    });

    const stored = localStorage.getItem("workflow-list-view");
    expect(stored).toBeTruthy();
    if (stored) {
      const parsed = JSON.parse(stored);
      expect(parsed.state.showGraphPreview).toBe(false);
    }
  });
});
