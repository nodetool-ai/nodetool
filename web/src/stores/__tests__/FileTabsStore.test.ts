import { act } from "@testing-library/react";
import { useFileTabsStore } from "../FileTabsStore";
import { Asset } from "../ApiTypes";

const createMockAsset = (id: string, name: string = `File ${id}`): Asset => ({
  id,
  user_id: "user1",
  workflow_id: null,
  parent_id: "",
  name,
  content_type: "text/plain",
  size: 1024,
  created_at: new Date().toISOString(),
  get_url: `http://localhost/api/assets/${id}`,
  thumb_url: null,
  duration: null,
  metadata: null
});

describe("FileTabsStore", () => {
  beforeEach(() => {
    act(() => {
      useFileTabsStore.getState().closeAllFileTabs();
    });
  });

  describe("initial state", () => {
    it("has no open file tabs initially", () => {
      const state = useFileTabsStore.getState();
      expect(state.openFileTabs).toEqual([]);
      expect(state.activeFileTabId).toBeNull();
    });
  });

  describe("openFileTab", () => {
    it("opens a new file tab and sets it as active", () => {
      const asset = createMockAsset("1", "test.txt");
      act(() => {
        useFileTabsStore.getState().openFileTab(asset);
      });
      const state = useFileTabsStore.getState();
      expect(state.openFileTabs).toHaveLength(1);
      expect(state.openFileTabs[0].asset.id).toBe("1");
      expect(state.activeFileTabId).toBe("1");
    });

    it("does not duplicate tabs for the same asset", () => {
      const asset = createMockAsset("1", "test.txt");
      act(() => {
        useFileTabsStore.getState().openFileTab(asset);
        useFileTabsStore.getState().openFileTab(asset);
      });
      const state = useFileTabsStore.getState();
      expect(state.openFileTabs).toHaveLength(1);
    });

    it("sets the existing tab as active if already open", () => {
      const asset1 = createMockAsset("1", "test1.txt");
      const asset2 = createMockAsset("2", "test2.txt");
      act(() => {
        useFileTabsStore.getState().openFileTab(asset1);
        useFileTabsStore.getState().openFileTab(asset2);
      });
      expect(useFileTabsStore.getState().activeFileTabId).toBe("2");
      act(() => {
        useFileTabsStore.getState().openFileTab(asset1);
      });
      expect(useFileTabsStore.getState().activeFileTabId).toBe("1");
    });

    it("opens multiple tabs", () => {
      const asset1 = createMockAsset("1", "test1.txt");
      const asset2 = createMockAsset("2", "test2.txt");
      act(() => {
        useFileTabsStore.getState().openFileTab(asset1);
        useFileTabsStore.getState().openFileTab(asset2);
      });
      const state = useFileTabsStore.getState();
      expect(state.openFileTabs).toHaveLength(2);
      expect(state.activeFileTabId).toBe("2");
    });
  });

  describe("closeFileTab", () => {
    it("closes a file tab", () => {
      const asset = createMockAsset("1", "test.txt");
      act(() => {
        useFileTabsStore.getState().openFileTab(asset);
        useFileTabsStore.getState().closeFileTab("1");
      });
      const state = useFileTabsStore.getState();
      expect(state.openFileTabs).toHaveLength(0);
      expect(state.activeFileTabId).toBeNull();
    });

    it("selects the next tab when active tab is closed", () => {
      const asset1 = createMockAsset("1", "test1.txt");
      const asset2 = createMockAsset("2", "test2.txt");
      const asset3 = createMockAsset("3", "test3.txt");
      act(() => {
        useFileTabsStore.getState().openFileTab(asset1);
        useFileTabsStore.getState().openFileTab(asset2);
        useFileTabsStore.getState().openFileTab(asset3);
        useFileTabsStore.getState().setActiveFileTab("2");
        useFileTabsStore.getState().closeFileTab("2");
      });
      const state = useFileTabsStore.getState();
      expect(state.openFileTabs).toHaveLength(2);
      expect(state.activeFileTabId).toBe("3");
    });

    it("selects the previous tab when closing the last tab", () => {
      const asset1 = createMockAsset("1", "test1.txt");
      const asset2 = createMockAsset("2", "test2.txt");
      act(() => {
        useFileTabsStore.getState().openFileTab(asset1);
        useFileTabsStore.getState().openFileTab(asset2);
        useFileTabsStore.getState().closeFileTab("2");
      });
      const state = useFileTabsStore.getState();
      expect(state.openFileTabs).toHaveLength(1);
      expect(state.activeFileTabId).toBe("1");
    });

    it("does not change active tab when closing a non-active tab", () => {
      const asset1 = createMockAsset("1", "test1.txt");
      const asset2 = createMockAsset("2", "test2.txt");
      act(() => {
        useFileTabsStore.getState().openFileTab(asset1);
        useFileTabsStore.getState().openFileTab(asset2);
        useFileTabsStore.getState().closeFileTab("1");
      });
      const state = useFileTabsStore.getState();
      expect(state.openFileTabs).toHaveLength(1);
      expect(state.activeFileTabId).toBe("2");
    });
  });

  describe("closeAllFileTabs", () => {
    it("closes all file tabs", () => {
      const asset1 = createMockAsset("1", "test1.txt");
      const asset2 = createMockAsset("2", "test2.txt");
      act(() => {
        useFileTabsStore.getState().openFileTab(asset1);
        useFileTabsStore.getState().openFileTab(asset2);
        useFileTabsStore.getState().closeAllFileTabs();
      });
      const state = useFileTabsStore.getState();
      expect(state.openFileTabs).toHaveLength(0);
      expect(state.activeFileTabId).toBeNull();
    });
  });

  describe("closeOtherFileTabs", () => {
    it("closes all file tabs except the specified one", () => {
      const asset1 = createMockAsset("1", "test1.txt");
      const asset2 = createMockAsset("2", "test2.txt");
      const asset3 = createMockAsset("3", "test3.txt");
      act(() => {
        useFileTabsStore.getState().openFileTab(asset1);
        useFileTabsStore.getState().openFileTab(asset2);
        useFileTabsStore.getState().openFileTab(asset3);
        useFileTabsStore.getState().closeOtherFileTabs("2");
      });
      const state = useFileTabsStore.getState();
      expect(state.openFileTabs).toHaveLength(1);
      expect(state.openFileTabs[0].asset.id).toBe("2");
      expect(state.activeFileTabId).toBe("2");
    });
  });

  describe("setActiveFileTab", () => {
    it("sets the active file tab", () => {
      const asset1 = createMockAsset("1", "test1.txt");
      const asset2 = createMockAsset("2", "test2.txt");
      act(() => {
        useFileTabsStore.getState().openFileTab(asset1);
        useFileTabsStore.getState().openFileTab(asset2);
        useFileTabsStore.getState().setActiveFileTab("1");
      });
      expect(useFileTabsStore.getState().activeFileTabId).toBe("1");
    });

    it("can set active file tab to null", () => {
      const asset = createMockAsset("1", "test.txt");
      act(() => {
        useFileTabsStore.getState().openFileTab(asset);
        useFileTabsStore.getState().setActiveFileTab(null);
      });
      expect(useFileTabsStore.getState().activeFileTabId).toBeNull();
    });
  });
});
