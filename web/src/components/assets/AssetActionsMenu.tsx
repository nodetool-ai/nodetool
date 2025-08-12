/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useCallback } from "react";
import { Box } from "@mui/material";
import AssetSearchInput from "./AssetSearchInput";
import AssetActions from "./AssetActions";
import SearchErrorBoundary from "../SearchErrorBoundary";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useAssetSelection } from "../../hooks/assets/useAssetSelection";
import useAssets from "../../serverState/useAssets";
import { isEqual } from "lodash";

const styles = (theme: Theme) =>
  css({
    "&": {
      margin: "0",
      display: "flex",
      flexWrap: "wrap",
      justifyContent: "start",
      alignItems: "start",
      gap: ".4em",
      width: "100%",
      transition: "max-height 0.5s ease-in-out",
      // Tighter, stacked controls for narrow sidebars
      "@media (max-width: 520px)": {
        flexDirection: "column",
        alignItems: "stretch",
        gap: ".35em"
      }
    },
    ".selected-asset-info": {
      minHeight: "100px",
      minWidth: "200px",
      overflowY: "auto",
      overflowX: "hidden",
      fontSize: theme.fontSizeSmall,
      padding: "0.1em 0.2em",
      color: theme.vars.palette.grey[200]
    }
  });

interface AssetActionsMenuProps {
  maxItemSize: number;
  onUploadFiles?: (files: File[]) => void;
}

const AssetActionsMenu: React.FC<AssetActionsMenuProps> = ({ maxItemSize, onUploadFiles }) => {
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

  const theme = useTheme();

  return (
    <Box
      className="asset-menu asset-menu-with-global-search"
      css={styles(theme)}
    >
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
        onUploadFiles={onUploadFiles}
      />
    </Box>
  );
};

export default React.memo(AssetActionsMenu, isEqual);
