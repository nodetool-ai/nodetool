/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useCallback } from "react";
import { Box } from "@mui/material";
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
    }
  });

interface AssetActionsMenuProps {
  maxItemSize: number;
}

const AssetActionsMenu: React.FC<AssetActionsMenuProps> = ({ maxItemSize }) => {
  const setSelectedAssetIds = useAssetGridStore(
    (state) => state.setSelectedAssetIds
  );
  const setAssetSearchTerm = useAssetGridStore(
    (state) => state.setAssetSearchTerm
  );
  const { folderFiles } = useAssets();
  const { handleSelectAllAssets, handleDeselectAssets } =
    useAssetSelection(folderFiles);

  const onSearchChange = useCallback(
    (newSearchTerm: string) => {
      setAssetSearchTerm(newSearchTerm);
    },
    [setAssetSearchTerm]
  );

  return (
    <Box className="asset-menu" css={styles}>
      <SearchInput
        onSearchChange={onSearchChange}
        focusOnTyping={false}
        focusSearchInput={false}
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
