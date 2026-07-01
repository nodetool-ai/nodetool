import { createStore, useStore, type StoreApi } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  createContext,
  createElement,
  useContext,
  type ReactNode
} from "react";
import { Asset, AssetWithPath } from "./ApiTypes";
import { SizeFilterKey, TypeFilterKey } from "../utils/formatUtils";

export interface AssetGridState {
  assetItemSize: number;
  assetSearchTerm: string | null;
  sizeFilter: SizeFilterKey;
  typeFilter: TypeFilterKey;
  viewMode: "grid" | "list";
  currentAudioAsset: Asset | null;
  currentFolder: Asset | null;
  currentFolderId: string | null;
  deleteDialogOpen: boolean;
  renameDialogOpen: boolean;
  moveToFolderDialogOpen: boolean;
  filteredAssets: Asset[];
  handleDeselectAssets: () => void;
  handleSelectAllAssets: () => void;
  isHorizontal: boolean;
  openAsset: Asset | null;
  parentFolder: Asset | null;
  searchTerm: string;
  selectedAssetIds: string[];
  selectedAssets: Asset[];
  selectedFolderId: string | null;
  selectedFolderIds: string[];
  setAssetItemSize: (size: number) => void;
  setAssetSearchTerm: (term: string) => void;
  setSizeFilter: (filter: SizeFilterKey) => void;
  setTypeFilter: (filter: TypeFilterKey) => void;
  setViewMode: (mode: "grid" | "list") => void;
  setCurrentAudioAsset: (asset: Asset | null) => void;
  setCurrentFolder: (folder: Asset | null) => void;
  setCurrentFolderId: (folderId: string | null) => void;
  setDeleteDialogOpen: (open: boolean) => void;
  setFilteredAssets: (assets: Asset[]) => void;
  setIsHorizontal: (isHorizontal: boolean) => void;
  setMoveToFolderDialogOpen: (open: boolean) => void;
  setOpenAsset: (asset: Asset | null) => void;
  setParentFolder: (folder: Asset | null) => void;
  setRenameDialogOpen: (open: boolean) => void;
  setSearchTerm: (term: string) => void;
  setSelectedAssetIds: (assetIds: string[]) => void;
  setSelectedAssets: (assets: Asset[]) => void;
  setSelectedFolderId: (id: string | null) => void;
  setSelectedFolderIds: (ids: string[]) => void;

  createFolderDialogOpen: boolean;
  setCreateFolderDialogOpen: (open: boolean) => void;

  foldersVisible: boolean;
  toggleFoldersVisible: () => void;

  isRenaming: string | null;
  setIsRenaming: (isRenaming: string | null) => void;

  // Image comparison
  compareAssets: [Asset, Asset] | null;
  openCompareView: (a: Asset, b: Asset) => void;
  closeCompareView: () => void;

  // Global search properties
  globalSearchResults: AssetWithPath[];
  isGlobalSearchActive: boolean;
  globalSearchQuery: string;
  isGlobalSearchMode: boolean;

  // Global search actions
  setGlobalSearchResults: (results: AssetWithPath[]) => void;
  setIsGlobalSearchActive: (active: boolean) => void;
  setGlobalSearchQuery: (query: string) => void;
  setIsGlobalSearchMode: (mode: boolean) => void;

  // Workflow filter
  workflowFilter: string | null;
  setWorkflowFilter: (workflowId: string | null) => void;
}

export type AssetGridStoreApi = StoreApi<AssetGridState>;

const PERSIST_VERSION = 1;

/**
 * Build a fresh AssetGrid store bound to its own persistence key. Each surface
 * that wants independent state (folder navigation, selection, filters, view
 * mode) gets its own instance; `persistName` keeps their persisted display
 * prefs from colliding in localStorage.
 */
export const createAssetGridStore = (
  persistName: string
): AssetGridStoreApi =>
  createStore<AssetGridState>()(
    persist(
      (set, get) => ({
  assetItemSize: 2,
  sizeFilter: "all",
  typeFilter: "all",
  viewMode: "grid",
  currentFolder: null,
  currentFolderId: null,
  deleteDialogOpen: false,
  filteredAssets: [],
  isHorizontal: true,
  moveToFolderDialogOpen: false,
  openAsset: null,
  parentFolder: null,
  renameDialogOpen: false,
  searchTerm: "",
  selectedAssetIds: [],
  selectedAssets: [],
  selectedFolderId: null,
  selectedFolderIds: [],
  setAssetItemSize: (size) => set({ assetItemSize: size }),
  setCurrentFolder: (folder) =>
    set({
      currentFolder: folder,
      currentFolderId: folder?.id ?? null,
      parentFolder: null
    }),
  setCurrentFolderId: (folderId) =>
    set({ currentFolderId: folderId, currentFolder: null, parentFolder: null }),
  setDeleteDialogOpen: (open) => set({ deleteDialogOpen: open }),
  setFilteredAssets: (assets) => set({ filteredAssets: assets }),
  setIsHorizontal: (isHorizontal) => set({ isHorizontal }),
  setMoveToFolderDialogOpen: (open) => set({ moveToFolderDialogOpen: open }),
  setOpenAsset: (asset) => set({ openAsset: asset }),
  setParentFolder: (folder) => set({ parentFolder: folder }),
  setRenameDialogOpen: (open) => set({ renameDialogOpen: open }),
  setSearchTerm: (term) => set({ searchTerm: term }),
  setSelectedFolderId: (id) => set({ selectedFolderId: id }),
  setSelectedFolderIds: (ids) => set({ selectedFolderIds: ids }),

  assetSearchTerm: null,
  setAssetSearchTerm: (term: string) => set({ assetSearchTerm: term }),
  setSizeFilter: (filter: SizeFilterKey) => set({ sizeFilter: filter }),
  setTypeFilter: (filter: TypeFilterKey) => set({ typeFilter: filter }),
  setViewMode: (mode: "grid" | "list") => set({ viewMode: mode }),

  // AUDIO ASSET
  currentAudioAsset: null,
  setCurrentAudioAsset: (asset) => set({ currentAudioAsset: asset }),

  handleSelectAllAssets: () => {
    const { filteredAssets } = get();
    set({
      selectedAssetIds: filteredAssets.map((asset) => asset.id),
      selectedAssets: filteredAssets
    });
  },

  handleDeselectAssets: () => set({ selectedAssetIds: [], selectedAssets: [] }),
  setSelectedAssetIds: (ids) => {
    // Keep `selectedAssets` in sync so the two can't desync: resolve each id
    // against the asset lists available in the store, falling back to the
    // previous selection for ids whose assets aren't in the current view.
    const { filteredAssets, globalSearchResults, selectedAssets } = get();
    const byId = new Map<string, Asset>();
    for (const asset of selectedAssets) {
      byId.set(asset.id, asset);
    }
    for (const asset of globalSearchResults) {
      byId.set(asset.id, asset);
    }
    for (const asset of filteredAssets) {
      byId.set(asset.id, asset);
    }
    set({
      selectedAssetIds: ids,
      selectedAssets: ids
        .map((id) => byId.get(id))
        .filter((asset): asset is Asset => asset !== undefined)
    });
  },
  setSelectedAssets: (assets) => {
    set({ selectedAssets: assets });
  },

  createFolderDialogOpen: false,
  setCreateFolderDialogOpen: (open) => set({ createFolderDialogOpen: open }),

  foldersVisible: false,
  toggleFoldersVisible: () =>
    set((state) => ({ foldersVisible: !state.foldersVisible })),
  isRenaming: null,
  setIsRenaming: (isRenaming) => set({ isRenaming }),

  // Image comparison
  compareAssets: null,
  openCompareView: (a, b) => set({ compareAssets: [a, b] }),
  closeCompareView: () => set({ compareAssets: null }),

  // Global search initial state
  globalSearchResults: [],
  isGlobalSearchActive: false,
  globalSearchQuery: "",
  isGlobalSearchMode: false,

  // Global search actions
  setGlobalSearchResults: (results) => set({ globalSearchResults: results }),
  setIsGlobalSearchActive: (active) => set({ isGlobalSearchActive: active }),
  setGlobalSearchQuery: (query) => set({ globalSearchQuery: query }),
  setIsGlobalSearchMode: (mode) => set({ isGlobalSearchMode: mode }),

  // Workflow filter
  workflowFilter: null,
  setWorkflowFilter: (workflowId) => set({ workflowFilter: workflowId })
}),
      {
        name: persistName,
        version: PERSIST_VERSION,
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          foldersVisible: state.foldersVisible,
          viewMode: state.viewMode,
          typeFilter: state.typeFilter,
          sizeFilter: state.sizeFilter,
          assetItemSize: state.assetItemSize,
          isHorizontal: state.isHorizontal
        })
      }
    )
  );

// Stores are cached by key at module scope so each surface keeps a stable,
// independent instance across mounts — switching left-panel tabs unmounts and
// remounts the panel, and we don't want that to reset folder navigation.
const storeCache = new Map<string, AssetGridStoreApi>();
const getOrCreateStore = (key: string): AssetGridStoreApi => {
  let store = storeCache.get(key);
  if (!store) {
    store = createAssetGridStore(key);
    storeCache.set(key, store);
  }
  return store;
};

// The app-wide singleton. Cross-cutting consumers (property widgets, clipboard
// and drag handlers, output renderer, the fullscreen assets page) and every
// static `useAssetGridStore.getState()` caller resolve to this instance. The
// scoped left-panel surfaces override it via AssetGridStoreProvider.
export const SINGLETON_ASSET_GRID_STORE_KEY = "asset-grid-storage";
const singletonStore = getOrCreateStore(SINGLETON_ASSET_GRID_STORE_KEY);

// The sidebar Library panel (PanelLeft) is the surface users browse folders
// in day-to-day; canvas drop/paste uploads should land in whatever folder is
// open there, not just the rarely-visited fullscreen assets page (which reads
// the singleton above).
export const LIBRARY_ASSET_GRID_STORE_KEY = "asset-grid-storage:library";

const libraryStore = getOrCreateStore(LIBRARY_ASSET_GRID_STORE_KEY);

/** Reactive access to the Library panel's current folder, for cross-cutting
 * callers (e.g. canvas file-drop/paste) that need it without being inside
 * the panel's provider subtree. */
export const useLibraryCurrentFolderId = (): string | null =>
  useStore(libraryStore, (state) => state.currentFolderId);

const AssetGridStoreContext =
  createContext<AssetGridStoreApi>(singletonStore);

/**
 * Provide a scoped AssetGrid store to a subtree. Everything below that reads via
 * the `useAssetGridStore` hook or `useAssetGridStoreApi()` gets this instance
 * instead of the singleton, so sibling surfaces stay independent.
 */
export const AssetGridStoreProvider = ({
  persistKey,
  children
}: {
  persistKey: string;
  children: ReactNode;
}): ReactNode =>
  createElement(
    AssetGridStoreContext.Provider,
    { value: getOrCreateStore(persistKey) },
    children
  );

/** The store API for the nearest provider (or the singleton). Use when you need
 * imperative `getState()` access rather than a reactive selector. */
export const useAssetGridStoreApi = (): AssetGridStoreApi =>
  useContext(AssetGridStoreContext);

function useAssetGridStoreHook<T>(selector: (state: AssetGridState) => T): T {
  return useStore(useContext(AssetGridStoreContext), selector);
}

/**
 * Reactive selector hook, context-aware: resolves to the nearest
 * AssetGridStoreProvider's store, or the singleton when there is none. The
 * static `getState`/`setState`/`subscribe` always target the singleton (for
 * cross-cutting imperative callers and tests).
 */
export const useAssetGridStore = Object.assign(useAssetGridStoreHook, {
  getState: singletonStore.getState,
  setState: singletonStore.setState,
  subscribe: singletonStore.subscribe,
  getInitialState: singletonStore.getInitialState
});
