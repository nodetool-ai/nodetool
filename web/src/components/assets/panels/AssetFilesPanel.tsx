/** @jsxImportSource @emotion/react */
import React, { useCallback, useRef } from "react";
import { IDockviewPanelProps } from "dockview";
import SearchErrorBoundary from "../../SearchErrorBoundary";
import GlobalSearchResults from "../GlobalSearchResults";
import AssetGridContent from "../AssetGridContent";
import { useAssetGridStore } from "../../../stores/AssetGridStore";
import { Asset, AssetWithPath } from "../../../stores/ApiTypes";

interface AssetFilesPanelParams {
  isHorizontal?: boolean;
  itemSpacing?: number;
}
const AssetFilesPanel: React.FC<IDockviewPanelProps<AssetFilesPanelParams>> = (
  props
) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const setOpenAssetLocal = useAssetGridStore((state) => state.setOpenAsset);
  const isGlobalSearchActiveLocal = useAssetGridStore(
    (state) => state.isGlobalSearchActive
  );
  const isGlobalSearchModeLocal = useAssetGridStore(
    (state) => state.isGlobalSearchMode
  );
  const globalSearchResultsLocal = useAssetGridStore(
    (state) => state.globalSearchResults
  );
  const setIsGlobalSearchActiveLocal = useAssetGridStore(
    (state) => state.setIsGlobalSearchActive
  );
  const setIsGlobalSearchModeLocal = useAssetGridStore(
    (state) => state.setIsGlobalSearchMode
  );
  const setCurrentFolderIdLocal = useAssetGridStore(
    (state) => state.setCurrentFolderId
  );

  const handleDoubleClick = useCallback(
    (asset: Asset) => {
      setOpenAssetLocal(asset);
    },
    [setOpenAssetLocal]
  );

  const handleGlobalSearchAssetDoubleClick = useCallback(
    (asset: AssetWithPath) => {
      setOpenAssetLocal(asset);
    },
    [setOpenAssetLocal]
  );

  const handleNavigateToFolder = useCallback(
    (folderId: string, _folderPath: string) => {
      setCurrentFolderIdLocal(folderId);
      setIsGlobalSearchActiveLocal(false);
      setIsGlobalSearchModeLocal(false);
    },
    [
      setCurrentFolderIdLocal,
      setIsGlobalSearchActiveLocal,
      setIsGlobalSearchModeLocal
    ]
  );

  const isHorizontal = props.params?.isHorizontal;
  const itemSpacing = props.params?.itemSpacing;

  return (
    <div style={{ height: "100%", overflow: "hidden" }}>
      <div
        className={`asset-content-wrapper ${
          isGlobalSearchModeLocal && isGlobalSearchActiveLocal
            ? "global-search-mode"
            : "normal-grid-mode"
        }`}
        style={{ height: "100%" }}
        ref={containerRef}
      >
        {isGlobalSearchModeLocal && isGlobalSearchActiveLocal ? (
          <SearchErrorBoundary fallbackTitle="Search Results Error">
            <GlobalSearchResults
              results={globalSearchResultsLocal}
              onAssetDoubleClick={handleGlobalSearchAssetDoubleClick}
              onNavigateToFolder={handleNavigateToFolder}
              containerWidth={containerRef.current?.offsetWidth || 800}
            />
          </SearchErrorBoundary>
        ) : (
          <AssetGridContent
            isHorizontal={isHorizontal}
            itemSpacing={itemSpacing}
            onDoubleClick={handleDoubleClick}
          />
        )}
      </div>
    </div>
  );
};

export default AssetFilesPanel;
