import { create } from "zustand";
import { Asset, AssetWithPath } from "./ApiTypes";
import { SizeFilterKey } from "../utils/formatUtils";

interface AssetGridState {
  assetItemSize: number;
  assetSearchTerm: string | null;
  sizeFilter: SizeFilterKey;
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
}

export const useAssetGridStore = create<AssetGridState>((set, get) => ({
  assetItemSize: 2,
  sizeFilter: "all",
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
    set({ currentFolder: folder, currentFolderId: folder?.id }),
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

  // // FILTERED ASSETS
  // filteredAssets: {
  //   assetsByType: {},
  //   totalCount: 0,
  // },
  // setFilteredAssets: (sortedAssetsByType) => {
  //   set({ filteredAssets: sortedAssetsByType });
  // },
  assetSearchTerm: null,
  setAssetSearchTerm: (term: string) => set({ assetSearchTerm: term }),
  setSizeFilter: (filter: SizeFilterKey) => set({ sizeFilter: filter }),
  setViewMode: (mode: "grid" | "list") => set({ viewMode: mode }),

  // AUDIO ASSET
  currentAudioAsset: null,
  setCurrentAudioAsset: (asset) => set({ currentAudioAsset: asset }),

  handleSelectAllAssets: () => {
    const { filteredAssets } = get();
    set({ selectedAssetIds: filteredAssets.map((asset) => asset.id) });
  },

  handleDeselectAssets: () => set({ selectedAssetIds: [] }),
  setSelectedAssetIds: (ids) => {
    set({ selectedAssetIds: ids });
  },
  setSelectedAssets: (assets) => {
    set({ selectedAssets: assets });
  },

  createFolderDialogOpen: false,
  setCreateFolderDialogOpen: (open) => set({ createFolderDialogOpen: open }),
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
  setIsGlobalSearchMode: (mode) => set({ isGlobalSearchMode: mode })
}));
