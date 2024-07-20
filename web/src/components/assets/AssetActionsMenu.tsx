/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React from "react";
import { Box, Typography } from "@mui/material";
import SearchInput from "../search/SearchInput";
import AssetActions from "./AssetActions";
import ThemeNodetool from "../themes/ThemeNodetool";

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
  onSearchChange: (newSearchTerm: string) => void;
  onSearchClear: () => void;
  setSelectedAssetIds: (ids: string[]) => void;
  handleSelectAllAssets: () => void;
  handleDeselectAssets: () => void;
  maxItemSize: number;
  currentFolder: { name: string } | null;
  selectedAssetIds: string[];
  selectedAssets: any[];
}

const AssetActionsMenu: React.FC<AssetActionsMenuProps> = ({
  onSearchChange,
  onSearchClear,
  setSelectedAssetIds,
  handleSelectAllAssets,
  handleDeselectAssets,
  maxItemSize,
  currentFolder,
  selectedAssetIds,
  selectedAssets
}) => {
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
      <Typography className="current-folder">
        <span className="folder-slash">/</span>
        {currentFolder && `${currentFolder.name}`}
      </Typography>
      <div className="selected-asset-info">
        <Typography variant="body1" className="selected-info">
          {selectedAssetIds.length > 0 && (
            <>
              {selectedAssetIds.length}{" "}
              {selectedAssetIds.length === 1 ? "item " : "items "}
              selected
            </>
          )}
        </Typography>
        {selectedAssetIds.length === 1 && (
          <Typography variant="body2" className="asset-info">
            <span style={{ color: "white", fontSize: "small" }}>
              {selectedAssets[0]?.name}{" "}
            </span>
            <br />
            {selectedAssets[0]?.content_type}
            <br />
            {/* Add prettyDate function or import it */}
            {/* {prettyDate(selectedAssets[0]?.created_at)} */}
          </Typography>
        )}
      </div>
    </Box>
  );
};

export default React.memo(AssetActionsMenu);
