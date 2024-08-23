import { create } from 'zustand';
import { Asset } from './ApiTypes';
import { useAssetStore } from './AssetStore';

interface AssetGridState {
    currentFolderId: string | null;
    setCurrentFolderId: (folderId: string | null) => void;
    setParentFolder: (folder: Asset | null) => void;
    parentFolder: Asset | null;
    selectedAssets: Asset[];
    selectedAssetIds: string[];
    selectedFolderIds: string[];
    selectedFolderId: string | null;
    currentFolder: Asset | null;
    filteredAssets: Asset[];
    openAsset: Asset | null;
    searchTerm: string;
    assetItemSize: number;
    isHorizontal: boolean;
    currentAudioAsset: Asset | null;
    assetSearchTerm: string | null;
    setOpenAsset: (asset: Asset | null) => void;
    setAssetSearchTerm: (term: string) => void;
    setCurrentAudioAsset: (asset: Asset | null) => void;
    setSelectedAssetIds: (ids: string[]) => void;
    setSelectedFolderIds: (ids: string[]) => void;
    setSelectedFolderId: (id: string | null) => void;
    setCurrentFolder: (folder: Asset | null) => void;
    setFilteredAssets: (assets: Asset[]) => void;
    setSearchTerm: (term: string) => void;
    setAssetItemSize: (size: number) => void;
    setIsHorizontal: (isHorizontal: boolean) => void;
    handleSelectAllAssets: () => void;
    handleDeselectAssets: () => void;
}

export const useAssetGridStore = create<AssetGridState>((set, get) => ({
    currentFolder: null,
    currentFolderId: null,
    parentFolder: null,
    filteredAssets: [],
    searchTerm: '',
    openAsset: null,
    assetItemSize: 2,
    isHorizontal: true,
    selectedAssetIds: [],
    selectedAssets: [],
    setOpenAsset: (asset) => set({ openAsset: asset }),
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
    },
    setParentFolder: (folder) => set({ parentFolder: folder }),
    setCurrentFolder: (folder) => set({ currentFolder: folder }),
    setCurrentFolderId: (folderId) => set({ currentFolderId: folderId }),
    setFilteredAssets: (assets) => set({ filteredAssets: assets }),
    setSearchTerm: (term) => set({ searchTerm: term }),
    setAssetItemSize: (size) => set({ assetItemSize: size }),
    setIsHorizontal: (isHorizontal) => set({ isHorizontal }),

    // FOLDER SELECTION
    selectedFolderIds: [],
    setSelectedFolderIds: (ids) => set({ selectedFolderIds: ids }),
    selectedFolderId: null,
    setSelectedFolderId: (id) => set({ selectedFolderId: id }),


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
        set({ selectedAssetIds: filteredAssets.map(asset => asset.id) });
    },

    handleDeselectAssets: () => set({ selectedAssetIds: [] }),
}));