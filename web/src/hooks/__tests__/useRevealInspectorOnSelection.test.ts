import { renderHook } from "@testing-library/react";
import { useCanvasChatDockStore } from "../../stores/CanvasChatDockStore";
import { useRightPanelStore } from "../../stores/RightPanelStore";
import { useRevealInspectorOnSelection } from "../useRevealInspectorOnSelection";

describe("useRevealInspectorOnSelection", () => {
  beforeEach(() => {
    useRightPanelStore.setState((state) => ({
      panel: { ...state.panel, isVisible: false, autoReveal: true }
    }));
  });

  it("reveals the Inspector on selection while the chat is closed", () => {
    useCanvasChatDockStore.setState({ conversationCollapsed: true });
    renderHook(() => useRevealInspectorOnSelection(true, 1));
    expect(useRightPanelStore.getState().panel.isVisible).toBe(true);
  });

  it("does not reveal the Inspector while the chat is visible", () => {
    useCanvasChatDockStore.setState({ conversationCollapsed: false });
    renderHook(() => useRevealInspectorOnSelection(true, 1));
    expect(useRightPanelStore.getState().panel.isVisible).toBe(false);
  });

  it("still opens the Inspector on a manual request while the chat is visible", () => {
    useCanvasChatDockStore.setState({ conversationCollapsed: false });
    renderHook(() => useRevealInspectorOnSelection(true, 1));
    useRightPanelStore.getState().openInspector();
    expect(useRightPanelStore.getState().panel.isVisible).toBe(true);
  });
});
