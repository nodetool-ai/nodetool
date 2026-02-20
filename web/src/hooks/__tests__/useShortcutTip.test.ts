import { renderHook, waitFor, act } from "@testing-library/react";
import { useShortcutTip } from "../useShortcutTip";
import { useShortcutTipStore } from "../../stores/ShortcutTipStore";

describe("useShortcutTip", () => {
  // Reset the store before each test
  beforeEach(() => {
    act(() => {
      useShortcutTipStore.getState().resetTips();
    });
  });

  afterEach(() => {
    // Clean up after each test
    act(() => {
      useShortcutTipStore.getState().resetTips();
    });
  });

  it("returns current tip as null initially", () => {
    const { result } = renderHook(() => useShortcutTip());
    
    expect(result.current.currentTip).toBeNull();
  });

  it("returns enabled state from store", () => {
    const { result } = renderHook(() => useShortcutTip());
    
    expect(result.current.enabled).toBe(true);
  });

  it("shows a tip when showTip is called", () => {
    const { result } = renderHook(() => useShortcutTip());
    
    expect(result.current.currentTip).toBeNull();
    
    act(() => {
      result.current.showTip();
    });
    
    // Tip should be shown immediately
    expect(result.current.currentTip).toBeTruthy();
  });

  it("does not show tip when disabled", () => {
    const { result } = renderHook(() => useShortcutTip());
    
    // Disable tips
    act(() => {
      result.current.setEnabled(false);
    });
    
    act(() => {
      result.current.showTip();
    });
    
    expect(result.current.currentTip).toBeNull();
  });

  it("can enable tips after being disabled", () => {
    const { result } = renderHook(() => useShortcutTip());
    
    // Disable
    act(() => {
      result.current.setEnabled(false);
    });
    
    expect(result.current.enabled).toBe(false);
    
    // Enable
    act(() => {
      result.current.setEnabled(true);
    });
    
    expect(result.current.enabled).toBe(true);
    
    // Now showTip should work
    act(() => {
      result.current.showTip();
    });
    
    expect(result.current.currentTip).toBeTruthy();
  });

  it("resets tips when resetTips is called", () => {
    const { result } = renderHook(() => useShortcutTip());
    
    // Show a tip
    act(() => {
      result.current.showTip();
    });
    
    const tipId = result.current.currentTip?.id;
    
    // Dismiss the tip via store
    if (tipId) {
      act(() => {
        useShortcutTipStore.getState().dismissTip(tipId);
      });
    }
    
    // Reset
    act(() => {
      result.current.resetTips();
    });
    
    // Tip should no longer be dismissed
    if (tipId) {
      const tip = useShortcutTipStore.getState().getTipById(tipId);
      expect(tip?.dismissed).toBe(false);
    }
  });

  it("auto-shows tip on mount when autoShow is true", async () => {
    const initialDelay = 100;
    const { result } = renderHook(() => 
      useShortcutTip({ autoShow: true, initialDelay })
    );
    
    expect(result.current.currentTip).toBeNull();
    
    await waitFor(
      () => {
        expect(result.current.currentTip).toBeTruthy();
      },
      { timeout: 500 }
    );
  });

  it("does not auto-show when autoShow is false", async () => {
    const { result } = renderHook(() => 
      useShortcutTip({ autoShow: false, initialDelay: 50 })
    );
    
    // Wait longer than initial delay
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    
    expect(result.current.currentTip).toBeNull();
  });

  it("filters by category when specified - general", () => {
    // Test general category
    const { result: generalResult } = renderHook(() => 
      useShortcutTip({ category: "general" })
    );
    
    act(() => {
      generalResult.current.showTip();
    });
    
    expect(generalResult.current.currentTip?.category).toBe("general");
  });

  it("filters by category when specified - editor", () => {
    // Reset before this test
    act(() => {
      useShortcutTipStore.getState().resetTips();
    });
    
    // Test editor category
    const { result: editorResult } = renderHook(() => 
      useShortcutTip({ category: "editor" })
    );
    
    act(() => {
      editorResult.current.showTip();
    });
    
    expect(editorResult.current.currentTip?.category).toBe("editor");
  });

  it("increments show count when tip is shown", () => {
    const { result } = renderHook(() => useShortcutTip());
    
    const store = useShortcutTipStore.getState();
    const firstTip = store.tips[0];
    const initialCount = firstTip.showCount;
    
    act(() => {
      result.current.showTip();
    });
    
    const updatedTip = useShortcutTipStore.getState().getTipById(firstTip.id);
    expect(updatedTip?.showCount).toBe(initialCount + 1);
  });

  it("respects time interval between tips", () => {
    const { result } = renderHook(() => useShortcutTip());
    
    const store = useShortcutTipStore.getState();
    
    // Set a short interval
    act(() => {
      store.setTipInterval(1000);
    });
    
    // Show first tip
    act(() => {
      result.current.showTip();
    });
    
    const firstTipId = result.current.currentTip?.id;
    expect(firstTipId).toBeTruthy();
    
    // Try to show another tip immediately - should return null
    const nextTip = useShortcutTipStore.getState().getNextTip();
    expect(nextTip).toBeNull();
  });

  it("can be reset and tips shown again", () => {
    const { result } = renderHook(() => useShortcutTip());
    
    // Show and dismiss a tip
    act(() => {
      result.current.showTip();
    });
    
    const tipId = result.current.currentTip?.id;
    
    act(() => {
      result.current.dismissTip();
    });
    
    const store = useShortcutTipStore.getState();
    if (tipId) {
      expect(store.getTipById(tipId)?.dismissed).toBe(true);
    }
    
    // Reset
    act(() => {
      result.current.resetTips();
    });
    
    // Tip should no longer be dismissed
    if (tipId) {
      expect(useShortcutTipStore.getState().getTipById(tipId)?.dismissed).toBe(false);
    }
  });
});
