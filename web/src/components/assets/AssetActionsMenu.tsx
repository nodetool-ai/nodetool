import React from "react";
import { Box, Typography } from "@mui/material";
import SearchInput from "../search/SearchInput";
import AssetActions from "./AssetActions";

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
    <Box className="asset-menu">
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
