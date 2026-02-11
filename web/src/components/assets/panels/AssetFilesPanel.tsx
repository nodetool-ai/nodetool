/** @jsxImportSource @emotion/react */
import React, { useCallback, useRef, memo } from "react";
import { IDockviewPanelProps } from "dockview";
import SearchErrorBoundary from "../../SearchErrorBoundary";
import GlobalSearchResults from "../GlobalSearchResults";
import AssetGridContent from "../AssetGridContent";
import { useAssetGridStore } from "../../../stores/AssetGridStore";
import { Asset, AssetWithPath } from "../../../stores/ApiTypes";
import { useTheme } from "@mui/material/styles";

export interface AssetFilesPanelParams {
  isHorizontal?: boolean;
  itemSpacing?: number;
}
const AssetFilesPanel: React.FC<IDockviewPanelProps<AssetFilesPanelParams>> = (
  props
) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Combine multiple store subscriptions into a single selector to reduce re-renders
  const {
    setOpenAsset,
    isGlobalSearchActive,
    isGlobalSearchMode,
    globalSearchResults,
    setIsGlobalSearchActive,
    setIsGlobalSearchMode,
    setCurrentFolderId
  } = useAssetGridStore((state) => ({
    setOpenAsset: state.setOpenAsset,
    isGlobalSearchActive: state.isGlobalSearchActive,
    isGlobalSearchMode: state.isGlobalSearchMode,
    globalSearchResults: state.globalSearchResults,
    setIsGlobalSearchActive: state.setIsGlobalSearchActive,
    setIsGlobalSearchMode: state.setIsGlobalSearchMode,
    setCurrentFolderId: state.setCurrentFolderId
  }));

  const handleDoubleClick = useCallback(
    (asset: Asset) => {
      setOpenAsset(asset);
    },
    [setOpenAsset]
  );

  const handleGlobalSearchAssetDoubleClick = useCallback(
    (asset: AssetWithPath) => {
      setOpenAsset(asset);
    },
    [setOpenAsset]
  );

  const handleNavigateToFolder = useCallback(
    (folderId: string, _folderPath: string) => {
      setCurrentFolderId(folderId);
      setIsGlobalSearchActive(false);
      setIsGlobalSearchMode(false);
    },
    [
      setCurrentFolderId,
      setIsGlobalSearchActive,
      setIsGlobalSearchMode
    ]
  );

  const isHorizontal = props.params?.isHorizontal;
  const itemSpacing = props.params?.itemSpacing;

  const theme = useTheme();

  return (
    <div style={{ height: "100%", overflow: "hidden", backgroundColor: theme.vars.palette.c_editor_bg_color }}>
      <div
        className={`asset-content-wrapper ${
          isGlobalSearchMode && isGlobalSearchActive
            ? "global-search-mode"
            : "normal-grid-mode"
        }`}
        style={{ height: "100%" }}
        ref={containerRef}
      >
        {isGlobalSearchMode && isGlobalSearchActive ? (
          <SearchErrorBoundary fallbackTitle="Search Results Error">
            <GlobalSearchResults
              results={globalSearchResults}
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
