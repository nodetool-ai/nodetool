/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useCallback } from "react";
import { Box, Typography } from "@mui/material";
import SearchInput from "../search/SearchInput";
import AssetActions from "./AssetActions";
import ThemeNodetool from "../themes/ThemeNodetool";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useAssetSelection } from "../../hooks/assets/useAssetSelection";
import useAssets from "../../serverState/useAssets";

const styles = (theme: any) =>
  css({
    "&": {
      margin: "0",
      display: "flex",
      flexWrap: "wrap",
      justifyContent: "start",
      alignItems: "start",
      gap: ".5em",
      transition: "max-height 0.5s ease-in-out"
    },
    ".selected-asset-info": {
      backgroundColor: theme.palette.c_gray1,
      minHeight: "100px",
      minWidth: "200px",
      overflowY: "auto",
      overflowX: "hidden",
      fontSize: ThemeNodetool.fontSizeSmall,
      padding: "0.1em 0.2em",
      color: theme.palette.c_gray5
    },
    ".file-upload-button button": {
      width: "100%",
      maxWidth: "155px"
    },
    ".current-folder": {
      minWidth: "100px",
      fontSize: ThemeNodetool.fontSizeSmall,
      color: theme.palette.c_gray5,
      padding: "0.5em 0 0 .25em"
    },
    ".folder-slash": {
      color: theme.palette.c_hl1,
      fontWeight: 600,
      marginRight: "0.25em",
      userSelect: "none"
    },
    ".selected-info": {
      fontSize: "12px !important",
      color: theme.palette.c_gray4,
      minHeight: "25px",
      display: "block"
    }
  });

interface AssetActionsMenuProps {
  maxItemSize: number;
}

const AssetActionsMenu: React.FC<AssetActionsMenuProps> = ({ maxItemSize }) => {
  const selectedAssets = useAssetGridStore((state) => state.selectedAssets);
  const selectedAssetIds = useAssetGridStore((state) => state.selectedAssetIds);
  const setSelectedAssetIds = useAssetGridStore(
    (state) => state.setSelectedAssetIds
  );
  const setAssetSearchTerm = useAssetGridStore(
    (state) => state.setAssetSearchTerm
  );
  const { folderFiles } = useAssets();
  const currentFolder = useAssetGridStore((state) => state.currentFolder);

  const { handleSelectAllAssets, handleDeselectAssets } =
    useAssetSelection(folderFiles);

  const onSearchChange = useCallback(
    (newSearchTerm: string) => {
      setAssetSearchTerm(newSearchTerm);
    },
    [setAssetSearchTerm]
  );

  const onSearchClear = useCallback(() => {
    setAssetSearchTerm("");
  }, [setAssetSearchTerm]);

  return (
    <Box className="asset-menu" css={styles}>
      <SearchInput
        onSearchChange={onSearchChange}
        onSearchClear={onSearchClear}
        focusOnTyping={false}
        focusSearchInput={false}
        focusOnEscapeKey={false}
        maxWidth={"9em"}
      />
      <AssetActions
        setSelectedAssetIds={setSelectedAssetIds}
        handleSelectAllAssets={handleSelectAllAssets}
        handleDeselectAssets={handleDeselectAssets}
        maxItemSize={maxItemSize}
      />
    </Box>
  );
};

export default React.memo(AssetActionsMenu);
