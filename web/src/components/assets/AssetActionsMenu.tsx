/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useCallback } from "react";
import { Box } from "@mui/material";
import AssetSearchInput from "./AssetSearchInput";
import AssetActions from "./AssetActions";
import SearchErrorBoundary from "../SearchErrorBoundary";
import ThemeNodetool from "../themes/ThemeNodetool";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useAssetSelection } from "../../hooks/assets/useAssetSelection";
import useAssets from "../../serverState/useAssets";
import { isEqual } from "lodash";

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

  const onLocalSearchChange = useCallback(
    (newSearchTerm: string) => {
      setAssetSearchTerm(newSearchTerm);
    },
    [setAssetSearchTerm]
  );

  return (
    <Box className="asset-menu asset-menu-with-global-search" css={styles}>
      <SearchErrorBoundary fallbackTitle="Search Input Error">
        <AssetSearchInput
          onLocalSearchChange={onLocalSearchChange}
          focusOnTyping={false}
          focusSearchInput={false}
          width={333}
        />
      </SearchErrorBoundary>
      <AssetActions
        setSelectedAssetIds={setSelectedAssetIds}
        handleSelectAllAssets={handleSelectAllAssets}
        handleDeselectAssets={handleDeselectAssets}
        maxItemSize={maxItemSize}
      />
    </Box>
  );
};

export default React.memo(AssetActionsMenu, isEqual);
