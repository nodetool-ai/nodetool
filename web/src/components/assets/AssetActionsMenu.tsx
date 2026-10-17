import React, { useCallback, useMemo, useRef, useState } from "react";
import TuneIcon from "@mui/icons-material/Tune";
import FolderIcon from "@mui/icons-material/Folder";
import FolderOffIcon from "@mui/icons-material/FolderOff";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import FilterAltOffIcon from "@mui/icons-material/FilterAltOff";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import TravelExploreIcon from "@mui/icons-material/TravelExplore";
import AssetSearchInput from "./AssetSearchInput";
import AssetActions from "./AssetActions";
import AssetProjectFilter from "./AssetProjectFilter";
import OpenverseDialog from "./OpenverseDialog";
import SearchErrorBoundary from "../SearchErrorBoundary";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useAssetSelection } from "../../hooks/assets/useAssetSelection";
import useAssets from "../../serverState/useAssets";
import {
  ToolbarIconButton,
  UploadButton,
  ContextMenu,
  MenuItemPrimitive,
  FlexRow,
  Box,
  Chip,
  Divider,
  EditorButton,
  TruncatedText,
  SPACING
} from "../ui_primitives";
import isEqual from "../../utils/isEqual";

interface AssetActionsMenuProps {
  maxItemSize: number;
  onUploadFiles?: (files: File[]) => void;
  isFullscreenAssets?: boolean;
  /** Hides folder browsing/creation controls (e.g. the workflow-output sidebar). */
  hideFolderControls?: boolean;
}

/**
 * The asset browser toolbar. The fullscreen page has room for labeled
 * controls on one row: search, view options, filters, then New folder and
 * Upload. The sidebar keeps icon buttons and folds search and view options
 * behind the options toggle.
 */
const AssetActionsMenu: React.FC<AssetActionsMenuProps> = ({
  maxItemSize,
  onUploadFiles,
  isFullscreenAssets = false,
  hideFolderControls = false
}) => {
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
  const favoritesOnly = useAssetGridStore((state) => state.favoritesOnly);
  const setFavoritesOnly = useAssetGridStore(
    (state) => state.setFavoritesOnly
  );
  const modelFilter = useAssetGridStore((state) => state.modelFilter);
  const setModelFilter = useAssetGridStore((state) => state.setModelFilter);
  const [modelFilterAnchor, setModelFilterAnchor] =
    useState<HTMLElement | null>(null);
  const { folderFiles, folderTree, modelOptions } = useAssets();
  const { handleSelectAllAssets } = useAssetSelection(folderFiles);
  const [expanded, setExpanded] = useState(false);
  const [openverseOpen, setOpenverseOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasFolders = useMemo(
    () => !!folderTree && Object.keys(folderTree).length > 0,
    [folderTree]
  );
  // In fullscreen the search and view options are always visible; in the
  // sidebar they are toggled by the options button.
  const showOptions = expanded || isFullscreenAssets;

  const onLocalSearchChange = useCallback(
    (newSearchTerm: string) => {
      setAssetSearchTerm(newSearchTerm);
    },
    [setAssetSearchTerm]
  );

  const handleFileInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length > 0) {
        onUploadFiles?.(files);
      }
      event.target.value = "";
    },
    [onUploadFiles]
  );

  const modelFilterLabel = modelFilter
    ? (modelOptions.find((m) => m.id === modelFilter)?.label ?? modelFilter)
    : "Any model";
  // Offer the model filter only when the view holds generated assets, or a
  // model is already picked and has to stay clearable.
  const showModelFilter = modelOptions.length > 0 || modelFilter !== null;

  const filters = (
    <>
      <AssetProjectFilter />
      <Chip
        compact
        icon={favoritesOnly ? <StarIcon /> : <StarBorderIcon />}
        label="Favorites"
        active={favoritesOnly}
        onClick={() => setFavoritesOnly(!favoritesOnly)}
      />
      {showModelFilter && (
        <EditorButton
          variant="text"
          color={modelFilter ? "primary" : "inherit"}
          density="compact"
          startIcon={<SmartToyOutlinedIcon />}
          endIcon={<ArrowDropDownIcon />}
          tooltip="Filter by the model that generated the file"
          aria-haspopup="menu"
          onClick={(e) => setModelFilterAnchor(e.currentTarget)}
          sx={{ maxWidth: 200 }}
        >
          <TruncatedText component="span" sx={{ fontSize: "inherit" }}>
            {modelFilterLabel}
          </TruncatedText>
        </EditorButton>
      )}
    </>
  );

  const createActions = isFullscreenAssets ? (
    <FlexRow align="center" gap={SPACING.sm} sx={{ ml: "auto" }}>
      {!hideFolderControls && (
        <EditorButton
          variant="outlined"
          density="compact"
          startIcon={<CreateNewFolderIcon />}
          onClick={() => setCreateFolderDialogOpen(true)}
        >
          New folder
        </EditorButton>
      )}
      <EditorButton
        variant="outlined"
        density="compact"
        startIcon={<TravelExploreIcon />}
        tooltip="Find openly licensed images and audio on Openverse"
        onClick={() => setOpenverseOpen(true)}
      >
        Openverse
      </EditorButton>
      <input
        ref={fileInputRef}
        type="file"
        hidden
        multiple
        onChange={handleFileInput}
      />
      <EditorButton
        variant="contained"
        density="compact"
        startIcon={<FileUploadIcon />}
        tooltip="Or drop files anywhere on the grid"
        onClick={() => fileInputRef.current?.click()}
      >
        Upload
      </EditorButton>
    </FlexRow>
  ) : (
    <FlexRow
      align="center"
      gap={SPACING.micro}
      sx={{ ml: "auto", pl: SPACING.micro }}
    >
      <Divider
        orientation="vertical"
        flexItem
        sx={{ my: SPACING.micro, mr: SPACING.micro }}
      />
      {!hideFolderControls && (
        <ToolbarIconButton
          icon={<CreateNewFolderIcon />}
          tooltip="New folder"
          onClick={() => setCreateFolderDialogOpen(true)}
          tooltipPlacement="top"
          nodrag={false}
        />
      )}
      <ToolbarIconButton
        icon={<TravelExploreIcon />}
        tooltip="Find openly licensed media on Openverse"
        onClick={() => setOpenverseOpen(true)}
        tooltipPlacement="top"
        nodrag={false}
      />
      <UploadButton
        onFileSelect={(files) => onUploadFiles?.(files)}
        iconVariant="file"
        tooltip="Upload files"
        multiple
      />
    </FlexRow>
  );

  const search = (
    <SearchErrorBoundary fallbackTitle="Search input error">
      <AssetSearchInput
        onLocalSearchChange={onLocalSearchChange}
        focusOnTyping={false}
        focusSearchInput={false}
        width={240}
      />
    </SearchErrorBoundary>
  );

  return (
    <Box className="asset-menu" sx={{ width: "100%" }}>
      {isFullscreenAssets ? (
        <FlexRow
          className="asset-menu-toolbar"
          align="center"
          gap={SPACING.md}
          wrap
          sx={{ px: SPACING.md, py: SPACING.sm }}
        >
          {search}
          <AssetActions
            handleSelectAllAssets={handleSelectAllAssets}
            maxItemSize={maxItemSize}
          />
          {filters}
          {createActions}
        </FlexRow>
      ) : (
        <>
          <FlexRow
            className="asset-menu-toolbar"
            align="center"
            gap={SPACING.xs}
            wrap
            sx={{
              px: SPACING.micro,
              py: SPACING.micro,
              "& .MuiIconButton-root": { padding: SPACING.sm },
              "& .MuiIconButton-root .MuiSvgIcon-root": { fontSize: 16 }
            }}
          >
            {!hideFolderControls && hasFolders && (
              <ToolbarIconButton
                icon={foldersVisible ? <FolderIcon /> : <FolderOffIcon />}
                tooltip={foldersVisible ? "Hide folders" : "Show folders"}
                onClick={toggleFoldersVisible}
                tooltipPlacement="top"
                nodrag={false}
                active={foldersVisible}
              />
            )}
            <ToolbarIconButton
              icon={<TuneIcon />}
              tooltip={
                expanded
                  ? "Hide search and view options"
                  : "Search, sort and view options"
              }
              onClick={() => setExpanded((prev) => !prev)}
              tooltipPlacement="top"
              nodrag={false}
              active={expanded}
            />
            {filters}
            {createActions}
          </FlexRow>
          {showOptions && (
            <SidebarOptionsRow>
              {search}
              <AssetActions
                handleSelectAllAssets={handleSelectAllAssets}
                maxItemSize={maxItemSize}
              />
            </SidebarOptionsRow>
          )}
        </>
      )}

      {openverseOpen && (
        <OpenverseDialog open onClose={() => setOpenverseOpen(false)} />
      )}

      <ContextMenu
        open={Boolean(modelFilterAnchor)}
        anchorEl={modelFilterAnchor}
        onClose={() => setModelFilterAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
      >
        <MenuItemPrimitive
          label="Any model"
          icon={<FilterAltOffIcon />}
          checkable="radio"
          checked={modelFilter === null}
          onClick={() => {
            setModelFilter(null);
            setModelFilterAnchor(null);
          }}
        />
        {modelOptions.map((model) => (
          <MenuItemPrimitive
            key={model.id}
            label={model.label}
            icon={<SmartToyOutlinedIcon />}
            checkable="radio"
            checked={modelFilter === model.id}
            onClick={() => {
              setModelFilter(model.id);
              setModelFilterAnchor(null);
            }}
          />
        ))}
      </ContextMenu>
    </Box>
  );
};

/** The sidebar's folded-out search and view options, stacked under the toolbar. */
const SidebarOptionsRow: React.FC<{ children: React.ReactNode }> = ({
  children
}) => (
  <FlexRow
    className="asset-menu-with-global-search"
    align="center"
    gap={SPACING.sm}
    wrap
    sx={{ px: SPACING.micro, py: SPACING.xs }}
  >
    {children}
  </FlexRow>
);

export default React.memo(AssetActionsMenu, isEqual);
