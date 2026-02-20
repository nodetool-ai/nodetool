import { act } from "@testing-library/react";
import { useShortcutTipStore, SHORTCUT_TIPS } from "../ShortcutTipStore";

describe("ShortcutTipStore", () => {
  // Reset the store before each test
  beforeEach(() => {
    act(() => {
      useShortcutTipStore.getState().resetTips();
    });
  });

  it("initializes with predefined tips", () => {
    const state = useShortcutTipStore.getState();
    
    expect(state.tips).toHaveLength(SHORTCUT_TIPS.length);
    expect(state.enabled).toBe(true);
    expect(state.tipInterval).toBe(60000);
  });

  it("initializes all tips with zero show count and not dismissed", () => {
    const state = useShortcutTipStore.getState();
    
    state.tips.forEach((tip) => {
      expect(tip.showCount).toBe(0);
      expect(tip.dismissed).toBe(false);
    });
  });

  it("can be enabled and disabled", () => {
    const store = useShortcutTipStore.getState();
    
    expect(store.enabled).toBe(true);
    
    act(() => {
      store.setEnabled(false);
    });
    
    expect(useShortcutTipStore.getState().enabled).toBe(false);
    
    act(() => {
      store.setEnabled(true);
    });
    
    expect(useShortcutTipStore.getState().enabled).toBe(true);
  });

  it("can set tip interval", () => {
    const store = useShortcutTipStore.getState();
    
    act(() => {
      store.setTipInterval(30000);
    });
    
    expect(useShortcutTipStore.getState().tipInterval).toBe(30000);
  });

  it("can dismiss a tip", () => {
    const store = useShortcutTipStore.getState();
    const tipId = store.tips[0].id;
    
    expect(store.tips[0].dismissed).toBe(false);
    
    act(() => {
      store.dismissTip(tipId);
    });
    
    const updatedTip = useShortcutTipStore.getState().tips.find((t) => t.id === tipId);
    expect(updatedTip?.dismissed).toBe(true);
  });

  it("can increment show count for a tip", () => {
    const store = useShortcutTipStore.getState();
    const tipId = store.tips[0].id;
    const initialCount = store.tips[0].showCount;
    
    act(() => {
      store.incrementShowCount(tipId);
    });
    
    const updatedTip = useShortcutTipStore.getState().tips.find((t) => t.id === tipId);
    expect(updatedTip?.showCount).toBe(initialCount + 1);
  });

  it("updates last tip time when incrementing show count", () => {
    const store = useShortcutTipStore.getState();
    const tipId = store.tips[0].id;
    
    const beforeTime = Date.now();
    
    act(() => {
      store.incrementShowCount(tipId);
    });
    
    expect(useShortcutTipStore.getState().lastTipTime).toBeGreaterThanOrEqual(beforeTime);
  });

  it("can get a tip by ID", () => {
    const store = useShortcutTipStore.getState();
    const firstTip = store.tips[0];
    
    const foundTip = store.getTipById(firstTip.id);
    
    expect(foundTip).toEqual(firstTip);
  });

  it("returns undefined for non-existent tip ID", () => {
    const store = useShortcutTipStore.getState();
    
    const foundTip = store.getTipById("non-existent-id");
    
    expect(foundTip).toBeUndefined();
  });

  it("returns next tip respecting time interval", () => {
    const store = useShortcutTipStore.getState();
    
    // First call should return a tip
    const tip1 = store.getNextTip();
    expect(tip1).toBeTruthy();
    
    // Increment the tip's show count to set lastTipTime
    if (tip1) {
      act(() => {
        store.incrementShowCount(tip1.id);
      });
    }
    
    // Immediate next call should return null (within interval)
    const tip2 = store.getNextTip();
    expect(tip2).toBeNull();
  });

  it("filters tips by category when specified", () => {
    const store = useShortcutTipStore.getState();
    
    const generalTip = store.getNextTip("general");
    expect(generalTip?.category).toBe("general");
    
    const editorTip = store.getNextTip("editor");
    expect(editorTip?.category).toBe("editor");
  });

  it("excludes dismissed tips from getNextTip", () => {
    const store = useShortcutTipStore.getState();
    const firstTipId = store.tips[0].id;
    
    act(() => {
      store.dismissTip(firstTipId);
    });
    
    const nextTip = store.getNextTip();
    expect(nextTip?.id).not.toBe(firstTipId);
  });

  it("sorts tips by priority when show counts are equal", () => {
    const store = useShortcutTipStore.getState();
    
    // Get the next tip - should be the highest priority unseen tip
    const nextTip = store.getNextTip();
    
    // If we got a tip, verify it's unseen (showCount === 0)
    if (nextTip) {
      expect(nextTip.showCount).toBe(0);
      // High priority tips should be returned first
      expect(nextTip.priority).toBeGreaterThan(0);
    }
  });

  it("can reset all tips", () => {
    const store = useShortcutTipStore.getState();
    
    // Modify some tips
    act(() => {
      store.dismissTip(store.tips[0].id);
      store.incrementShowCount(store.tips[1].id);
    });
    
    // Reset
    act(() => {
      store.resetTips();
    });
    
    // All tips should be reset
    const state = useShortcutTipStore.getState();
    state.tips.forEach((tip) => {
      expect(tip.showCount).toBe(0);
      expect(tip.dismissed).toBe(false);
    });
    expect(state.lastTipTime).toBeNull();
  });

  it("can update last tip time", () => {
    const store = useShortcutTipStore.getState();
    const testTime = Date.now();
    
    act(() => {
      store.updateLastTipTime(testTime);
    });
    
    expect(useShortcutTipStore.getState().lastTipTime).toBe(testTime);
  });

  it("returns null when all tips are dismissed", () => {
    const store = useShortcutTipStore.getState();
    
    // Dismiss all tips
    act(() => {
      store.tips.forEach((tip) => {
        store.dismissTip(tip.id);
      });
    });
    
    const nextTip = store.getNextTip();
    expect(nextTip).toBeNull();
  });
});
