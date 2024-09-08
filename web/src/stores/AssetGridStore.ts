import { create } from "zustand";
import { Asset } from "./ApiTypes";
import { useAssetStore } from "./AssetStore";

interface AssetGridState {
  assetItemSize: number;
  assetSearchTerm: string | null;
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
  setSelectedAssetIds: (ids: string[]) => void;
  setSelectedFolderId: (id: string | null) => void;
  setSelectedFolderIds: (ids: string[]) => void;
}

export const useAssetGridStore = create<AssetGridState>((set, get) => ({
  assetItemSize: 2,
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
    const fetchAndSetAssets = async () => {
      const { get: getAssetById } = useAssetStore.getState();
      const assets = await Promise.all(ids.map((id) => getAssetById(id)));
      const validAssets = assets.filter(
        (asset): asset is Asset => asset !== undefined
      );
      set({ selectedAssets: validAssets });
    };
    fetchAndSetAssets();
  }
}));
