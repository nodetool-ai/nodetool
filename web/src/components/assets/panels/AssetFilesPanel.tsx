/** @jsxImportSource @emotion/react */
import React, { useCallback, useRef, memo, useMemo } from "react";
import { IDockviewPanelProps } from "dockview";
import SearchErrorBoundary from "../../SearchErrorBoundary";
import GlobalSearchResults from "../GlobalSearchResults";
import AssetGridContent from "../AssetGridContent";
import { useAssetGridStore } from "../../../stores/AssetGridStore";
import { Asset, AssetWithPath } from "../../../stores/ApiTypes";
import { useTheme } from "@mui/material/styles";
import { shallow } from "zustand/shallow";

export interface AssetFilesPanelParams {
  isHorizontal?: boolean;
  itemSpacing?: number;
}
const AssetFilesPanel: React.FC<IDockviewPanelProps<AssetFilesPanelParams>> = (
  props
) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Combine multiple store selectors with shallow to reduce re-renders
  const {
    setOpenAsset: setOpenAssetLocal,
    isGlobalSearchActive: isGlobalSearchActiveLocal,
    isGlobalSearchMode: isGlobalSearchModeLocal,
    globalSearchResults: globalSearchResultsLocal,
    setIsGlobalSearchActive: setIsGlobalSearchActiveLocal,
    setIsGlobalSearchMode: setIsGlobalSearchModeLocal,
    setCurrentFolderId: setCurrentFolderIdLocal
  } = useAssetGridStore(
    useMemo(() => (state) => ({
      setOpenAsset: state.setOpenAsset,
      isGlobalSearchActive: state.isGlobalSearchActive,
      isGlobalSearchMode: state.isGlobalSearchMode,
      globalSearchResults: state.globalSearchResults,
      setIsGlobalSearchActive: state.setIsGlobalSearchActive,
      setIsGlobalSearchMode: state.setIsGlobalSearchMode,
      setCurrentFolderId: state.setCurrentFolderId
    }), []),
    shallow
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

  const theme = useTheme();

  return (
    <div style={{ height: "100%", overflow: "hidden", backgroundColor: theme.vars.palette.c_editor_bg_color }}>
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

AssetFilesPanel.displayName = "AssetFilesPanel";

export default memo(AssetFilesPanel);
