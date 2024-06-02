/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

//mui
import { Box, Divider } from "@mui/material";

//store
import { useAssetStore } from "../../hooks/AssetStore";
import { useSettingsStore } from "../../stores/SettingsStore";
import useSessionStateStore from "../../stores/SessionStateStore";
//utils
import { devLog } from "../../utils/DevLog";
//components
import InfiniteScroll from "react-infinite-scroll-component";
import useAssets from "../../serverState/useAssets";
import { Asset } from "../../stores/ApiTypes";
//asset components
import AssetItem from "./AssetItem";
import React, { useRef, useCallback, useEffect } from "react";

import { colorForType } from "../../config/data_types";

const styles = (theme: any) =>
  css({
    "&": {
      position: "relative",
      height: "100%",
      overflow: "hidden"
    },
    ".infinite-scroll-component__outerdiv": {
      position: "relative",
      height: "100%",
      overflow: "hidden"
    },
    ".infinite-scroll-component": {
      height: "100% !important",
      overflowX: "hidden",
      overflowY: "scroll",
      borderTop: `1px solid ${theme.palette.c_gray2}`,
      borderBottom: `1px solid ${theme.palette.c_gray2}`,
      marginTop: "1em",
      paddingTop: "1em",
      paddingBottom: "320px",
      backgroundColor: theme.palette.c_gray1
    },
    ".content-type-header": {
      width: "100%",
      padding: "0.5em 0",
      backgroundColor: "transparent",
      fontSize: theme.fontSizeSmall,
      textTransform: "uppercase"
    }
  });

interface AssetGridContentProps {
  selectedAssetIds: string[];
  handleSelectAsset: (assetId: string) => void;
  setCurrentFolderId: (folderId: string) => void;
  setSelectedAssetIds: (assetIds: string[]) => void;
  openDeleteDialog: () => void;
  openRenameDialog: () => void;
  setCurrentAudioAsset: (asset: Asset) => void;
  itemSpacing?: number;
  searchTerm?: string;
}

const AssetGridContent = ({
  selectedAssetIds,
  handleSelectAsset,
  setCurrentFolderId,
  setSelectedAssetIds,
  openDeleteDialog,
  openRenameDialog,
  setCurrentAudioAsset,
  itemSpacing = 2,
  searchTerm = ""
}: AssetGridContentProps) => {
  const filteredAssets = useSessionStateStore((state) => state.filteredAssets);
  const setFilteredAssets = useSessionStateStore(
    (state) => state.setFilteredAssets
  );
  const { currentFolder, parentFolder } = useAssetStore();
  const itemSizeFactor = 42;
  const assetItemSize = useSettingsStore(
    (state) => state.settings.assetItemSize
  );
  const assetsOrder = useSettingsStore((state) => state.settings.assetsOrder);
  const footerSize = assetItemSize > 1 ? 30 : 0;
  const folderSize = 128;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { sortedAssetsByType, hasNextPage, fetchNextPage, refetch } =
    useAssets();

  useEffect(() => {
    const filterAndSortAssets = (
      assets: Asset[],
      sortByDate: boolean = false
    ) => {
      const filtered = assets.filter(
        (asset) =>
          asset.content_type === "folder" ||
          asset.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      if (sortByDate && assets[0]?.created_at) {
        filtered.sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      } else {
        filtered.sort((a, b) => a.name.localeCompare(b.name));
      }
      return filtered;
    };

    const newFilteredAssets = {
      assetsByType: Object.fromEntries(
        Object.entries(sortedAssetsByType.assetsByType).map(
          ([type, assets]) => [
            type,
            filterAndSortAssets(assets, assetsOrder === "date")
          ]
        )
      ),
      totalCount: Object.values(sortedAssetsByType.assetsByType).reduce(
        (acc, assets) => acc + filterAndSortAssets(assets).length,
        0
      )
    };

    setFilteredAssets(newFilteredAssets);
  }, [sortedAssetsByType, searchTerm, setFilteredAssets, assetsOrder]);

  const onDragStart = useCallback(
    (assetId: string): string[] => {
      const updatedSelectedIds = [...selectedAssetIds, assetId];
      const scrollElement = scrollContainerRef.current?.querySelector(
        ".infinite-scroll-component"
      );
      if (scrollElement) {
        scrollElement.scrollTop = 0;
      }

      return updatedSelectedIds;
    },
    [selectedAssetIds]
  );

  return (
    <div className="asset-grid-content" css={styles}>
      <InfiniteScroll
        next={() => fetchNextPage()}
        hasMore={!!hasNextPage}
        loader={<span>Loading...</span>}
        dataLength={filteredAssets.totalCount}
      >
        <Box
          className="asset-grid-flex"
          display="flex"
          flexWrap="wrap"
          gap={itemSpacing}
        >
          {/* ASSETS */}

          {Object.entries(filteredAssets.assetsByType).map(
            ([type, assets], index) => (
              <React.Fragment key={type}>
                {/* DIVIDER */}
                {assets.length > 0 && (
                  <div className="content-type-header">
                    {/* <Typography>{type} </Typography> */}
                    <div
                      className="divider"
                      style={{
                        borderBottom: `2px solid ${colorForType(type)}`
                      }}
                    ></div>
                  </div>
                )}
                {/* PARENT FOLDER */}
                {type == "folder" &&
                  parentFolder &&
                  currentFolder?.name !== "Root" && (
                    <Box
                      display="flex"
                      flexWrap="wrap"
                      style={{
                        width: folderSize,
                        height: folderSize * 0.75
                      }}
                    >
                      <AssetItem
                        draggable={false}
                        asset={parentFolder}
                        isParent={true}
                        enableContextMenu={false}
                        onClickParent={(folderId) => {
                          setCurrentFolderId(folderId);
                          setSelectedAssetIds([]);
                        }}
                        onMoveToFolder={() => {
                          refetch();
                          setSelectedAssetIds([]);
                        }}
                      />
                    </Box>
                  )}

                {assets.map((asset) => (
                  <Box
                    display="flex"
                    flexWrap="wrap"
                    key={asset.id}
                    style={{
                      width:
                        asset.content_type === "folder"
                          ? folderSize
                          : `${assetItemSize * itemSizeFactor}px`,
                      height:
                        asset.content_type === "folder"
                          ? folderSize * 0.75
                          : `${assetItemSize * itemSizeFactor + footerSize}px`
                    }}
                  >
                    <AssetItem
                      asset={asset}
                      draggable={true}
                      isSelected={selectedAssetIds.includes(asset.id)}
                      openDeleteDialog={openDeleteDialog}
                      openRenameDialog={openRenameDialog}
                      onSelect={() => handleSelectAsset(asset.id)}
                      onSetCurrentAudioAsset={() => setCurrentAudioAsset(asset)}
                      onMoveToFolder={() => {
                        refetch();
                        setSelectedAssetIds([]);
                      }}
                      onDeleteAssets={() => {
                        refetch();
                        setSelectedAssetIds([]);
                      }}
                      onDoubleClickFolder={(folderId) => {
                        setCurrentFolderId(folderId);
                        setSelectedAssetIds([]);
                      }}
                      onDragStart={() => onDragStart(asset.id)}

                    // onDragStart={() => [...selectedAssetIds, asset.id]}
                    />
                  </Box>
                ))}
                {index < Object.keys(sortedAssetsByType).length - 1 && (
                  <Divider />
                )}
              </React.Fragment>
            )
          )}
        </Box>
      </InfiniteScroll>
    </div>
  );
};

export default AssetGridContent;
