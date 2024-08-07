import { useMemo } from "react";
import { Asset } from "../../stores/ApiTypes";
import useAssets from "../../serverState/useAssets";
import { useSettingsStore } from "../../stores/SettingsStore";
import useSessionStateStore from "../../stores/SessionStateStore";

export const useGetAssets = (
  searchTerm: string = "",
  providedAssets?: Asset[]
) => {
  const { sortedFolders, sortedFiles, sortedAssets, error } = useAssets();

  const assetsOrder = useSettingsStore((state) => state.settings.assetsOrder);
  const setFilteredAssets = useSessionStateStore(
    (state) => state.setFilteredAssets
  );

  const filteredAssets = useMemo(() => {
    const assets = providedAssets || sortedAssets;
    return assets.filter((asset) =>
      asset.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [providedAssets, sortedAssets, searchTerm]);

  const filteredFolders = useMemo(
    () =>
      sortedFolders.filter((folder) =>
        folder.name.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [sortedFolders, searchTerm]
  );

  const filteredOtherAssets = useMemo(
    () =>
      sortedFiles.filter((file) =>
        file.name.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [sortedFiles, searchTerm]
  );

  // Update filtered assets in session state
  useMemo(() => {
    const newFilteredAssets = {
      assetsByType: {
        folder: filteredFolders,
        other: filteredOtherAssets,
      },
      totalCount: filteredAssets.length,
    };
    setFilteredAssets(newFilteredAssets);
    console.log("New filtered assets:", newFilteredAssets);
  }, [
    filteredFolders,
    filteredOtherAssets,
    filteredAssets.length,
    setFilteredAssets,
  ]);

  console.log("useGetAssets - folders:", filteredFolders);
  console.log("useGetAssets - otherAssets:", filteredOtherAssets);
  console.log("useGetAssets - allAssets:", filteredAssets);

  return {
    folders: filteredFolders,
    otherAssets: filteredOtherAssets,
    allAssets: filteredAssets,
    error,
  };
};
