import { act } from "@testing-library/react";
import { useAssetGridStore } from "../AssetGridStore";
import { Asset } from "../ApiTypes";

const createMockAsset = (id: string, name: string = `Asset ${id}`): Asset => ({
  id,
  user_id: "user1",
  workflow_id: null,
  parent_id: null,
  name,
  content_type: "image/png",
  file_size: 1024,
  duration: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  deleted_at: null,
  content: null,
  temp_id: null,
  error: null
});

describe("AssetGridStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    const store = useAssetGridStore.getState();
    store.setSelectedAssetIds([]);
    store.setSelectedAssets([]);
    store.setFilteredAssets([]);
    store.setCurrentFolder(null);
    store.setSearchTerm("");
    store.setViewMode("grid");
    store.setSizeFilter("all");
    store.setAssetItemSize(2);
    store.setIsGlobalSearchMode(false);
    store.setGlobalSearchResults([]);
  });

  describe("initial state", () => {
    it("has default view settings", () => {
      const state = useAssetGridStore.getState();
      expect(state.viewMode).toBe("grid");
      expect(state.assetItemSize).toBe(2);
      expect(state.sizeFilter).toBe("all");
    });

    it("has no selected assets initially", () => {
      const state = useAssetGridStore.getState();
      expect(state.selectedAssetIds).toEqual([]);
      expect(state.selectedAssets).toEqual([]);
    });

    it("has no current folder initially", () => {
      const state = useAssetGridStore.getState();
      expect(state.currentFolder).toBeNull();
      // currentFolderId can be null or undefined depending on initialization
    });

    it("has no global search active initially", () => {
      const state = useAssetGridStore.getState();
      expect(state.isGlobalSearchMode).toBe(false);
      expect(state.isGlobalSearchActive).toBe(false);
      expect(state.globalSearchQuery).toBe("");
    });
  });

  describe("view mode and settings", () => {
    it("sets view mode to list", () => {
      act(() => {
        useAssetGridStore.getState().setViewMode("list");
      });

      expect(useAssetGridStore.getState().viewMode).toBe("list");
    });

    it("sets view mode to grid", () => {
      act(() => {
        useAssetGridStore.getState().setViewMode("list");
        useAssetGridStore.getState().setViewMode("grid");
      });

      expect(useAssetGridStore.getState().viewMode).toBe("grid");
    });

    it("sets asset item size", () => {
      act(() => {
        useAssetGridStore.getState().setAssetItemSize(4);
      });

      expect(useAssetGridStore.getState().assetItemSize).toBe(4);
    });

    it("sets size filter", () => {
      act(() => {
        useAssetGridStore.getState().setSizeFilter("small");
      });

      expect(useAssetGridStore.getState().sizeFilter).toBe("small");
    });
  });

  describe("asset selection", () => {
    it("selects assets by IDs", () => {
      act(() => {
        useAssetGridStore.getState().setSelectedAssetIds(["1", "2", "3"]);
      });

      expect(useAssetGridStore.getState().selectedAssetIds).toEqual(["1", "2", "3"]);
    });

    it("sets selected assets", () => {
      const assets = [createMockAsset("1"), createMockAsset("2")];
      
      act(() => {
        useAssetGridStore.getState().setSelectedAssets(assets);
      });

      expect(useAssetGridStore.getState().selectedAssets).toEqual(assets);
    });

    it("selects all filtered assets", () => {
      const assets = [
        createMockAsset("1"),
        createMockAsset("2"),
        createMockAsset("3")
      ];

      act(() => {
        useAssetGridStore.getState().setFilteredAssets(assets);
        useAssetGridStore.getState().handleSelectAllAssets();
      });

      expect(useAssetGridStore.getState().selectedAssetIds).toEqual(["1", "2", "3"]);
    });

    it("deselects all assets", () => {
      act(() => {
        useAssetGridStore.getState().setSelectedAssetIds(["1", "2", "3"]);
        useAssetGridStore.getState().handleDeselectAssets();
      });

      expect(useAssetGridStore.getState().selectedAssetIds).toEqual([]);
    });
  });

  describe("current folder", () => {
    it("sets current folder", () => {
      const folder = createMockAsset("folder1", "My Folder");
      
      act(() => {
        useAssetGridStore.getState().setCurrentFolder(folder);
      });

      const state = useAssetGridStore.getState();
      expect(state.currentFolder).toEqual(folder);
      expect(state.currentFolderId).toBe("folder1");
    });

    it("sets current folder to null", () => {
      act(() => {
        useAssetGridStore.getState().setCurrentFolder(createMockAsset("folder1"));
        useAssetGridStore.getState().setCurrentFolder(null);
      });

      const state = useAssetGridStore.getState();
      expect(state.currentFolder).toBeNull();
      expect(state.currentFolderId).toBeUndefined();
    });

    it("sets current folder by ID", () => {
      act(() => {
        useAssetGridStore.getState().setCurrentFolderId("folder1");
      });

      const state = useAssetGridStore.getState();
      expect(state.currentFolderId).toBe("folder1");
      expect(state.currentFolder).toBeNull();
      expect(state.parentFolder).toBeNull();
    });
  });

  describe("search functionality", () => {
    it("sets search term", () => {
      act(() => {
        useAssetGridStore.getState().setSearchTerm("test search");
      });

      expect(useAssetGridStore.getState().searchTerm).toBe("test search");
    });

    it("sets asset search term", () => {
      act(() => {
        useAssetGridStore.getState().setAssetSearchTerm("asset search");
      });

      expect(useAssetGridStore.getState().assetSearchTerm).toBe("asset search");
    });
  });

  describe("global search", () => {
    it("activates global search mode", () => {
      act(() => {
        useAssetGridStore.getState().setIsGlobalSearchMode(true);
      });

      expect(useAssetGridStore.getState().isGlobalSearchMode).toBe(true);
    });

    it("sets global search query", () => {
      act(() => {
        useAssetGridStore.getState().setGlobalSearchQuery("global query");
      });

      expect(useAssetGridStore.getState().globalSearchQuery).toBe("global query");
    });

    it("sets global search active state", () => {
      act(() => {
        useAssetGridStore.getState().setIsGlobalSearchActive(true);
      });

      expect(useAssetGridStore.getState().isGlobalSearchActive).toBe(true);
    });

    it("sets global search results", () => {
      const results = [
        { ...createMockAsset("1"), folder_path: "/folder1" },
        { ...createMockAsset("2"), folder_path: "/folder2" }
      ];

      act(() => {
        useAssetGridStore.getState().setGlobalSearchResults(results);
      });

      expect(useAssetGridStore.getState().globalSearchResults).toEqual(results);
    });
  });

  describe("dialog states", () => {
    it("opens and closes delete dialog", () => {
      act(() => {
        useAssetGridStore.getState().setDeleteDialogOpen(true);
      });
      expect(useAssetGridStore.getState().deleteDialogOpen).toBe(true);

      act(() => {
        useAssetGridStore.getState().setDeleteDialogOpen(false);
      });
      expect(useAssetGridStore.getState().deleteDialogOpen).toBe(false);
    });

    it("opens and closes rename dialog", () => {
      act(() => {
        useAssetGridStore.getState().setRenameDialogOpen(true);
      });
      expect(useAssetGridStore.getState().renameDialogOpen).toBe(true);

      act(() => {
        useAssetGridStore.getState().setRenameDialogOpen(false);
      });
      expect(useAssetGridStore.getState().renameDialogOpen).toBe(false);
    });

    it("opens and closes move to folder dialog", () => {
      act(() => {
        useAssetGridStore.getState().setMoveToFolderDialogOpen(true);
      });
      expect(useAssetGridStore.getState().moveToFolderDialogOpen).toBe(true);

      act(() => {
        useAssetGridStore.getState().setMoveToFolderDialogOpen(false);
      });
      expect(useAssetGridStore.getState().moveToFolderDialogOpen).toBe(false);
    });

    it("opens and closes create folder dialog", () => {
      act(() => {
        useAssetGridStore.getState().setCreateFolderDialogOpen(true);
      });
      expect(useAssetGridStore.getState().createFolderDialogOpen).toBe(true);

      act(() => {
        useAssetGridStore.getState().setCreateFolderDialogOpen(false);
      });
      expect(useAssetGridStore.getState().createFolderDialogOpen).toBe(false);
    });
  });

  describe("current audio asset", () => {
    it("sets current audio asset", () => {
      const audioAsset = createMockAsset("audio1", "Audio File");
      
      act(() => {
        useAssetGridStore.getState().setCurrentAudioAsset(audioAsset);
      });

      expect(useAssetGridStore.getState().currentAudioAsset).toEqual(audioAsset);
    });

    it("clears current audio asset", () => {
      act(() => {
        useAssetGridStore.getState().setCurrentAudioAsset(createMockAsset("audio1"));
        useAssetGridStore.getState().setCurrentAudioAsset(null);
      });

      expect(useAssetGridStore.getState().currentAudioAsset).toBeNull();
    });
  });

  describe("renaming state", () => {
    it("sets is renaming to asset ID", () => {
      act(() => {
        useAssetGridStore.getState().setIsRenaming("asset1");
      });

      expect(useAssetGridStore.getState().isRenaming).toBe("asset1");
    });

    it("clears is renaming", () => {
      act(() => {
        useAssetGridStore.getState().setIsRenaming("asset1");
        useAssetGridStore.getState().setIsRenaming(null);
      });

      expect(useAssetGridStore.getState().isRenaming).toBeNull();
    });
  });
});
