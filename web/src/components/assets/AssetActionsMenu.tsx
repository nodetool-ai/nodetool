/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useCallback, useMemo, useState } from "react";
import TuneIcon from "@mui/icons-material/Tune";
import FolderIcon from "@mui/icons-material/Folder";
import FolderOffIcon from "@mui/icons-material/FolderOff";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
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
  MenuItemPrimitive,
  FlexRow,
  Box,
  Divider,
  BORDER_RADIUS,
  FONT_SIZE_SANS,
  MOTION,
  SPACING
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
      transition: MOTION.all,
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

const fullscreenFiltersStyles = css({
  "&": {
    width: "auto",
    flex: "1 1 auto",
    margin: 0
  }
});

interface AssetActionsMenuProps {
  maxItemSize: number;
  onUploadFiles?: (files: File[]) => void;
  isFullscreenAssets?: boolean;
  /** Hides folder browsing/creation controls (e.g. the workflow-output sidebar). */
  hideFolderControls?: boolean;
}

const AssetActionsMenu: React.FC<AssetActionsMenuProps> = ({
  maxItemSize,
  onUploadFiles,
  isFullscreenAssets = false,
  hideFolderControls = false
}) => {
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
  const setCreateFolderDialogOpen = useAssetGridStore(
    (state) => state.setCreateFolderDialogOpen
  );
  const typeFilter = useAssetGridStore((state) => state.typeFilter);
  const setTypeFilter = useAssetGridStore((state) => state.setTypeFilter);
  const [typeFilterAnchor, setTypeFilterAnchor] = useState<HTMLElement | null>(
    null
  );

  const handleTypeFilterChange = useCallback(
    (next: TypeFilterKey) => setTypeFilter(next),
    [setTypeFilter]
  );
  const { folderFiles, folderTree } = useAssets();
  const { handleSelectAllAssets, handleDeselectAssets } =
    useAssetSelection(folderFiles);
  const [expanded, setExpanded] = useState(false);

  const hasFolders = useMemo(
    () => !!folderTree && Object.keys(folderTree).length > 0,
    [folderTree]
  );
  // In fullscreen the filter row is always visible; in the sidebar it is
  // toggled by the tune button.
  const showFilters = expanded || isFullscreenAssets;

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
    <Box
      className="asset-menu"
      sx={{
        width: "100%",
        ...(isFullscreenAssets && {
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          columnGap: 2,
          rowGap: 1,
          px: 2,
          py: 1
        })
      }}
    >
      <FlexRow
        className="asset-menu-toolbar"
        align="center"
        gap={0.75}
        wrap
        sx={{
          px: 0.5,
          py: 0.5,
          "& .MuiIconButton-root": { padding: SPACING.sm },
          "& .MuiSvgIcon-root": { fontSize: 16 }
        }}
      >
        {/* Browse: toggle the folder navigator (sidebar only) */}
        {!isFullscreenAssets && !hideFolderControls && hasFolders && (
          <ToolbarIconButton
            icon={foldersVisible ? <FolderIcon /> : <FolderOffIcon />}
            tooltip={foldersVisible ? "Hide folders" : "Show folders"}
            onClick={toggleFoldersVisible}
            tooltipPlacement="top"
            nodrag={false}
            active={foldersVisible}
          />
        )}

        {/* Filter: asset type (labeled to avoid icon guessing) */}
        <ToolbarIconButton
          tooltip="Filter by type"
          onClick={(e) => setTypeFilterAnchor(e.currentTarget)}
          tooltipPlacement="top"
          nodrag={false}
          active={typeFilterActive}
          sx={{
            borderRadius: BORDER_RADIUS.sm,
            px: 0.5,
            gap: 0.5,
            fontSize: FONT_SIZE_SANS.label
          }}
        >
          <FlexRow
            align="center"
            gap={0.5}
            sx={{ "& .MuiSvgIcon-root": { fontSize: 18 } }}
          >
            {TYPE_FILTER_ICONS[typeFilter]}
            <span>{typeFilterLabel}</span>
            <ArrowDropDownIcon />
          </FlexRow>
        </ToolbarIconButton>

        {/* Search, sort & resize (sidebar only; always shown in fullscreen) */}
        {!isFullscreenAssets && (
          <ToolbarIconButton
            icon={<TuneIcon />}
            tooltip={expanded ? "Hide search & sort" : "Search, sort & resize"}
            onClick={() => setExpanded((prev) => !prev)}
            tooltipPlacement="top"
            nodrag={false}
            active={expanded}
          />
        )}

        {/* Actions: create & add assets */}
        <FlexRow align="center" gap={0.5} sx={{ ml: "auto", pl: 0.5 }}>
          <Divider orientation="vertical" flexItem sx={{ my: 0.5, mr: 0.5 }} />
          {!hideFolderControls && (
            <ToolbarIconButton
              icon={<CreateNewFolderIcon />}
              tooltip="Create folder"
              onClick={() => setCreateFolderDialogOpen(true)}
              tooltipPlacement="top"
              nodrag={false}
            />
          )}
          <UploadButton
            onFileSelect={(files) => onUploadFiles?.(files)}
            iconVariant="file"
            tooltip="Upload files"
            multiple
          />
        </FlexRow>
      </FlexRow>

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

      {showFilters && (
        <Box
          className="asset-menu-with-global-search"
          css={
            isFullscreenAssets
              ? [styles(theme), fullscreenFiltersStyles]
              : styles(theme)
          }
        >
          <SearchErrorBoundary fallbackTitle="Search Input Error">
            <AssetSearchInput
              onLocalSearchChange={onLocalSearchChange}
              focusOnTyping={false}
              focusSearchInput={false}
              width={240}
            />
          </SearchErrorBoundary>
          <AssetActions
            setSelectedAssetIds={setSelectedAssetIds}
            handleSelectAllAssets={handleSelectAllAssets}
            handleDeselectAssets={handleDeselectAssets}
            maxItemSize={maxItemSize}
          />
        </Box>
      )}
    </Box>
  );
};

export default React.memo(AssetActionsMenu, isEqual);
