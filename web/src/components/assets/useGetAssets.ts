import { useMemo } from "react";
import { Asset } from "../../stores/ApiTypes";
import useAssets from "../../serverState/useAssets";
import useSessionStateStore from "../../stores/SessionStateStore";
// import { useSettingsStore } from "../../stores/SettingsStore";

export const useGetAssets = (
  searchTerm: string = "",
  providedAssets?: Asset[]
) => {
  const { sortedFolders, sortedFiles, sortedAssets, error } = useAssets();

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

  return {
    folders: filteredFolders,
    otherAssets: filteredOtherAssets,
    allAssets: filteredAssets,
    error,
  };
};
