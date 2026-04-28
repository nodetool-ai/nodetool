/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useCallback, useState } from "react";
import { Box } from "@mui/material";
import TuneIcon from "@mui/icons-material/Tune";
import FolderIcon from "@mui/icons-material/Folder";
import FolderOffIcon from "@mui/icons-material/FolderOff";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import ImageIcon from "@mui/icons-material/Image";
import VideocamIcon from "@mui/icons-material/Videocam";
import AudiotrackIcon from "@mui/icons-material/Audiotrack";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import DescriptionIcon from "@mui/icons-material/Description";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import FilterAltOffIcon from "@mui/icons-material/FilterAltOff";
import AssetSearchInput from "./AssetSearchInput";
import AssetActions from "./AssetActions";
import SearchErrorBoundary from "../SearchErrorBoundary";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useAssetSelection } from "../../hooks/assets/useAssetSelection";
import useAssets from "../../serverState/useAssets";
import {
  ToolbarIconButton,
  UploadButton,
  Popover,
  MenuItemPrimitive
} from "../ui_primitives";
import { TYPE_FILTERS, TypeFilterKey } from "../../utils/formatUtils";
import isEqual from "fast-deep-equal";

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

const TYPE_FILTER_ICONS: Record<TypeFilterKey, React.ReactNode> = {
  all: <FilterAltOffIcon />,
  image: <ImageIcon />,
  video: <VideocamIcon />,
  audio: <AudiotrackIcon />,
  model_3d: <ViewInArIcon />,
  text: <DescriptionIcon />,
  application: <InsertDriveFileIcon />,
  other: <MoreHorizIcon />
};

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
  const foldersVisible = useAssetGridStore((state) => state.foldersVisible);
  const toggleFoldersVisible = useAssetGridStore(
    (state) => state.toggleFoldersVisible
  );
  const typeFilter = useAssetGridStore((state) => state.typeFilter);
  const setTypeFilter = useAssetGridStore((state) => state.setTypeFilter);
  const [typeFilterAnchor, setTypeFilterAnchor] =
    useState<HTMLElement | null>(null);

  const handleTypeFilterChange = useCallback(
    (next: TypeFilterKey) => setTypeFilter(next),
    [setTypeFilter]
  );
  const { folderFiles } = useAssets();
  const { handleSelectAllAssets, handleDeselectAssets } =
    useAssetSelection(folderFiles);
  const [expanded, setExpanded] = useState(false);

  const onLocalSearchChange = useCallback(
    (newSearchTerm: string) => {
      setAssetSearchTerm(newSearchTerm);
    },
    [setAssetSearchTerm]
  );

  const theme = useTheme();

  const typeFilterActive = typeFilter !== "all";
  const typeFilterLabel =
    TYPE_FILTERS.find((f) => f.key === typeFilter)?.label ?? "All";

  return (
    <Box className="asset-menu" sx={{ width: "100%" }}>
      <Box
        className="asset-menu-toolbar"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.25,
          px: 0.5,
          py: 0.25
        }}
      >
        <ToolbarIconButton
          icon={<TuneIcon />}
          tooltip={expanded ? "Hide filters" : "Show filters"}
          onClick={() => setExpanded((prev) => !prev)}
          tooltipPlacement="top"
          nodrag={false}
        />
        <ToolbarIconButton
          icon={foldersVisible ? <FolderIcon /> : <FolderOffIcon />}
          tooltip={foldersVisible ? "Hide folders" : "Show folders"}
          onClick={toggleFoldersVisible}
          tooltipPlacement="top"
          nodrag={false}
        />
        <ToolbarIconButton
          tooltip="Filter by type"
          onClick={(e) => setTypeFilterAnchor(e.currentTarget)}
          tooltipPlacement="top"
          nodrag={false}
          sx={{
            borderRadius: 1,
            px: 0.75,
            gap: 0.5,
            fontSize: theme.fontSizeSmall,
            color: typeFilterActive
              ? "var(--palette-primary-main)"
              : undefined
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              "& .MuiSvgIcon-root": { fontSize: 18 }
            }}
          >
            {TYPE_FILTER_ICONS[typeFilter]}
            <span>{typeFilterLabel}</span>
            <ArrowDropDownIcon />
          </Box>
        </ToolbarIconButton>
        <UploadButton
          onFileSelect={(files) => onUploadFiles?.(files)}
          iconVariant="file"
          tooltip="Upload files"
          multiple
        />
      </Box>

      <Popover
        open={Boolean(typeFilterAnchor)}
        anchorEl={typeFilterAnchor}
        onClose={() => setTypeFilterAnchor(null)}
        placement="bottom-left"
        paperSx={{ py: 0.5, minWidth: 160 }}
      >
        {TYPE_FILTERS.map((filter) => (
          <MenuItemPrimitive
            key={filter.key}
            label={filter.label}
            icon={TYPE_FILTER_ICONS[filter.key]}
            selected={typeFilter === filter.key}
            onClick={() => {
              handleTypeFilterChange(filter.key);
              setTypeFilterAnchor(null);
            }}
            dense
          />
        ))}
      </Popover>

      {expanded && (
        <Box
          className="asset-menu-with-global-search"
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
      )}
    </Box>
  );
};

export default React.memo(AssetActionsMenu, isEqual);
