/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { useEffect, useState, useRef, useCallback, useMemo, memo } from "react";
import { useNavigate } from "react-router-dom";
//mui
import { EditorButton, Dialog, Text } from "../ui_primitives";
//icons
import KeyboardArrowLeftIcon from "@mui/icons-material/KeyboardArrowLeft";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import CompareIcon from "@mui/icons-material/Compare";
import EditIcon from "@mui/icons-material/Edit";
import AssetItem from "./AssetItem";
import { ImageComparer } from "../widgets";
//
//components
//store
import { useAssetStore } from "../../stores/AssetStore";
import { Asset } from "../../stores/ApiTypes";
//utils
import useAssets from "../../serverState/useAssets";
import { useCombo } from "../../stores/KeyPressedStore";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useAssetDownload } from "../../hooks/assets/useAssetDownload";
import { useAssetNavigation } from "../../hooks/assets/useAssetNavigation";
import { useAssetDisplay } from "../../hooks/assets/useAssetDisplay";
import { isElectron } from "../../utils/browser";
import { copyAssetToClipboard, isClipboardSupported } from "../../utils/clipboardUtils";
import {
  ToolbarIconButton,
  CloseButton,
  DownloadButton,
  FlexRow,
  FlexColumn
} from "../ui_primitives";

const containerStyles = css({
  width: "100%",
  height: "100%",
  overflow: "hidden",
  margin: 0,
  position: "relative",
  pointerEvents: "none"
});

const styles = (theme: Theme) =>
  css({
    "&": {
      margin: 0,
      height: "100%",
      width: "100%",
      top: 0,
      display: "block"
    },
    ".MuiModal-root": {
      zIndex: 15000
    },
    ".MuiPaper-root": {
      overflow: "hidden",
      height: "100vh",
      maxHeight: "100vh",
      backgroundColor: theme.vars.palette.grey[900],
      width: "100vw",
      maxWidth: "100vw",
      zIndex: 11000,
      margin: 0,
      borderRadius: 0
    },
    ".asset-info": {
      position: "relative",
      maxWidth: "350px",
      margin: 0,
      padding: 0,
      bottom: "1em",
      right: "1em",
      zIndex: "2000",
      overflowWrap: "break-word",
      marginLeft: "auto"
    },
    ".asset-info p": {
      fontSize: "0.9em",
      textAlign: "right",
      margin: "0",
      padding: "0"
    },
    ".current-folder": {
      top: "20px"
    },
    ".actions": {
      zIndex: 10_200,
      position: "absolute",
      top: "1em",
      right: "2em"
    },
    ".actions .button": {
      width: "2em",
      height: "2em",
      backgroundColor: "rgba(0, 0, 0, 0.8)",
      color: "var(--palette-grey-0)",
      borderRadius: "var(--rounded-circle)",
      padding: "0.3em"
    },
    ".actions button svg": {
      fontSize: "1.2em"
    },
    ".actions .button:hover": {
      backgroundColor: theme.vars.palette.grey[500]
    },
    // -------------------
    ".asset-navigation": {
      position: "absolute",
      width: "100%",
      height: "120px",
      padding: "0 0 .5em 0",
      backgroundColor: theme.vars.palette.grey[800],
      bottom: 0,
      zIndex: 200
    },
    ".folder-name": {
      fontWeight: "bold",
      bottom: "3em",
      textAlign: "right",
      color: "var(--palette-primary-main)"
    },
    ".prev-next-button": {
      position: "absolute",
      top: "40%",
      width: "2em",
      height: "2em",
      zIndex: 20000,
      cursor: "pointer",
      color: theme.vars.palette.grey[200],
      backgroundColor: `rgba(${theme.vars.palette.grey[700]} / 0.6)`,
      border: `2px solid rgba(${theme.vars.palette.grey[500]} / 0.2)`
    },
    ".prev-next-button img": {
      cursor: "pointer !important",
      pointerEvents: "none"
    },
    ".prev-next-button:hover": {
      backgroundColor: `rgba(${theme.vars.palette.grey[800]} / 0.93)`
    },
    ".prev-next-button.Mui-disabled": {
      color: theme.vars.palette.grey[600],
      backgroundColor: `rgba(${theme.vars.palette.grey[600]} / 0.27)`,
      cursor: "default",
      border: `1px solid rgba(${theme.vars.palette.grey[400]} / 0.2)`,
      pointerEvents: "none"
    },
    ".prev-next-button svg": {
      fontSize: "2em"
    },
    ".prev-next-button.left": {
      left: "1em"
    },
    ".prev-next-button.right": {
      right: "1em"
    },
    ".prev-next-items": {
      width: "430px",
      maxWidth: "30vw"
    },
    ".prev-next-items.current": {
      boxSizing: "border-box",
      flexShrink: 0,
      width: "100px",
      height: "100px",
      overflow: "hidden",
      border: `1px solid ${theme.vars.palette.grey[0]}`
    },
    ".prev-next-items .item": {
      backgroundColor: `rgba(${theme.vars.palette.grey[700]} / 0.4)`,
      padding: "0",
      width: "120px",
      height: "80px",
      overflow: "hidden",
      cursor: "pointer !important"
    },
    ".prev-next-items .item .asset-item": {
      cursor: "pointer"
    },
    ".compare-mode-bar": {
      position: "absolute",
      top: "1em",
      left: "50%",
      transform: "translateX(-50%)",
      padding: "8px 16px",
      backgroundColor: "rgba(0,0,0,0.85)",
      borderRadius: 8,
      zIndex: 10001,
      color: "var(--palette-grey-0)",
      fontSize: 13
    },
    ".compare-mode-bar button": {
      color: "var(--palette-grey-0)",
      textTransform: "none"
    },
    ".select-for-compare": {
      position: "absolute",
      bottom: "130px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 10001,
      padding: "6px 12px",
      backgroundColor: "rgba(0,0,0,0.7)",
      borderRadius: 6,
      fontSize: 12,
      color: "var(--palette-grey-0)"
    },
    ".prev-next-items .item.compare-selected": {
      outline: "3px solid",
      outlineColor: theme.vars.palette.primary.main
    }
  });

type AssetViewerProps = {
  asset?: Asset;
  sortedAssets?: Asset[];
  url?: string;
  open: boolean;
  contentType?: string;
  onClose: () => void;
};

const AssetViewer: React.FC<AssetViewerProps> = (props) => {
  const theme = useTheme();
  const {
    asset,
    sortedAssets,
    url,
    open,
    contentType,
    onClose: handleClose
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const [currentAsset, setCurrentAsset] = useState<Asset | undefined>(asset);
  const getAsset = useAssetStore((state) => state.get);

  const [currentFolderName, setCurrentFolderName] = useState<string | null>();
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const prevNextAmount = 5;

  // Compare mode state
  const [compareMode, setCompareMode] = useState(false);
  const [compareAssetA, setCompareAssetA] = useState<Asset | null>(null);
  const [compareAssetB, setCompareAssetB] = useState<Asset | null>(null);

  // Navigation for image editor
  const navigate = useNavigate();

  // Reset compare mode when viewer closes
  useEffect(() => {
    if (!open) {
      setCompareMode(false);
      setCompareAssetA(null);
      setCompareAssetB(null);
    }
  }, [open]);

  const { folderFiles } = useAssets();

  const assetsToUse = useMemo(
    () => sortedAssets || folderFiles || [],
    [sortedAssets, folderFiles]
  );

  const { handleDownload } = useAssetDownload({ currentAsset, url });

  // Check if current asset is an image
  const isImage = useMemo(() => {
    const ct = currentAsset?.content_type || contentType;
    return ct?.startsWith("image/") || false;
  }, [currentAsset?.content_type, contentType]);

  // Check if there are multiple images to compare
  const imageAssets = useMemo(
    () => assetsToUse.filter((a) => a.content_type?.startsWith("image/")),
    [assetsToUse]
  );
  const canCompare = isImage && imageAssets.length >= 2;

  // Compare mode handlers
  const startCompareMode = useCallback(() => {
    if (currentAsset) {
      setCompareMode(true);
      setCompareAssetA(currentAsset);
      setCompareAssetB(null);
    }
  }, [currentAsset]);

  const cancelCompareMode = useCallback(() => {
    setCompareMode(false);
    setCompareAssetA(null);
    setCompareAssetB(null);
  }, []);

  const selectAssetForCompare = useCallback(
    (selectedAsset: Asset) => {
      if (!compareMode) {
        return;
      }
      if (compareAssetA && selectedAsset.id !== compareAssetA.id) {
        setCompareAssetB(selectedAsset);
      }
    },
    [compareMode, compareAssetA]
  );

  const exitCompareView = useCallback(() => {
    setCompareAssetB(null);
  }, []);

  const handleOpenImageEditor = useCallback(() => {
    if (currentAsset && isImage) {
      navigate(`/assets/edit/${currentAsset.id}`);
    }
  }, [currentAsset, isImage, navigate]);


  // Copy to clipboard state and handler
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCopyToClipboard = useCallback(async () => {
    const assetSrc = currentAsset?.get_url || url;
    const assetContentType = currentAsset?.content_type || contentType;
    const assetName = currentAsset?.name;

    if (!assetSrc || !assetContentType) {
      return;
    }

    try {
      await copyAssetToClipboard(assetContentType, assetSrc, assetName);
      setCopied(true);
      // Clear any existing timeout before setting a new one
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }
      copiedTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  }, [currentAsset?.get_url, currentAsset?.content_type, currentAsset?.name, url, contentType]);

  const handleChangeAsset = useCallback(
    (index: number) => {
      if (!assetsToUse) {
        return;
      }
      const newAsset = assetsToUse[index];
      // Use requestAnimationFrame for deferred updates instead of setTimeout
      // This automatically gets cancelled if component unmounts
      requestAnimationFrame(() => {
        setCurrentAsset(newAsset);
      });
      setCurrentIndex(index);
    },
    [assetsToUse]
  );

  // Cleanup copied timeout on unmount
  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (currentAsset?.parent_id) {
      getAsset(currentAsset.parent_id).then((asset) => {
        setCurrentFolderName(asset?.name);
      });
    }
  }, [currentAsset?.parent_id, getAsset]);

  useEffect(() => {
    if (asset) {
      setCurrentAsset(asset);
      const index = assetsToUse?.findIndex((item) => item.id === asset.id);
      setCurrentIndex(index !== undefined && index !== -1 ? index : null);
    }
  }, [asset, assetsToUse]);

  const { changeAsset } = useAssetNavigation({
    open,
    assets: assetsToUse,
    currentIndex,
    prevNextAmount,
    onChangeIndex: handleChangeAsset
  });
  useCombo(
    ["left"],
    useCallback(() => {
      if (open) {
        changeAsset("left", false);
      }
    }, [changeAsset, open])
  );
  useCombo(
    ["right"],
    useCallback(() => {
      if (open) {
        changeAsset("right", false);
      }
    }, [changeAsset, open])
  );
  useCombo(
    ["ctrl", "left"],
    useCallback(() => {
      if (open) {
        changeAsset("left", true);
      }
    }, [changeAsset, open])
  );
  useCombo(
    ["ctrl", "right"],
    useCallback(() => {
      if (open) {
        changeAsset("right", true);
      }
    }, [changeAsset, open])
  );

  const { component: assetViewer } = useAssetDisplay({
    asset: currentAsset,
    url,
    contentType
  });

  // Handle clicking a thumbnail - either navigate or select for compare
  const handleThumbnailClick = useCallback(
    (thumbnailAsset: Asset, assetIndex: number) => {
      if (compareMode && !compareAssetB) {
        // In compare mode - select second asset
        selectAssetForCompare(thumbnailAsset);
      } else {
        // Normal mode - navigate to asset
        handleChangeAsset(assetIndex);
      }
    },
    [compareMode, compareAssetB, selectAssetForCompare, handleChangeAsset]
  );

  const handlePrevAsset = useCallback(() => {
    if (currentIndex === null) { return; }
    handleChangeAsset(Math.max(0, currentIndex - 1));
  }, [currentIndex, handleChangeAsset]);

  const handleNextAsset = useCallback(() => {
    if (currentIndex === null) { return; }
    handleChangeAsset(Math.min(assetsToUse.length - 1, currentIndex + 1));
  }, [currentIndex, assetsToUse.length, handleChangeAsset]);

  const navigation = useMemo(() => {
    if (currentIndex === null) {
      return null;
    }
    // Hide navigation when showing comparison
    if (compareAssetB) {
      return null;
    }
    const prevAssets =
      assetsToUse?.slice(
        Math.max(0, currentIndex - prevNextAmount),
        currentIndex
      ) || [];
    const nextAssets =
      assetsToUse?.slice(currentIndex + 1, currentIndex + prevNextAmount + 1) ||
      [];

    // Filter to images only when in compare mode
    const filterForCompare = (assets: Asset[]) =>
      compareMode
        ? assets.filter((a) => a.content_type?.startsWith("image/"))
        : assets;

    const displayPrevAssets = filterForCompare(prevAssets);
    const displayNextAssets = filterForCompare(nextAssets);

    return (
      <>
        {!compareMode && (
          <>
            <ToolbarIconButton
              icon={<KeyboardArrowLeftIcon />}
              tooltip="Previous asset"
              onClick={handlePrevAsset}
              disabled={prevAssets?.length === 0}
              className="prev-next-button left"
              nodrag={false}
            />
            <ToolbarIconButton
              icon={<KeyboardArrowRightIcon />}
              tooltip="Next asset"
              onClick={handleNextAsset}
              disabled={nextAssets?.length === 0}
              className="prev-next-button right"
              nodrag={false}
            />
          </>
        )}
        <FlexRow className="asset-navigation" align="flex-end" justify="center" gap={1}>
          <FlexRow className="prev-next-items left" align="center" justify="flex-end" gap={0.5}>
            {displayPrevAssets?.map((asset, idx) => {
              const assetIndex = Math.max(
                0,
                currentIndex - prevAssets.length + idx
              );
              const isCompareSelected = compareAssetA?.id === asset.id;
              return (
                <EditorButton
                  className={`item ${isCompareSelected ? "compare-selected" : ""
                    }`}
                  key={asset.id || idx}
                  onMouseDown={() => handleThumbnailClick(asset, assetIndex)}
                  density="compact"
                >
                  <AssetItem
                    asset={asset}
                    draggable={false}
                    isParent={false}
                    showDeleteButton={false}
                    enableContextMenu={false}
                    showName={false}
                    showDuration={true}
                    showFiletype={true}
                  />
                </EditorButton>
              );
            })}
          </FlexRow>
          <FlexRow
            className={`prev-next-items current ${compareAssetA?.id === currentAsset?.id ? "compare-selected" : ""
              }`}
            align="center"
            justify="center"
          >
            <AssetItem
              asset={currentAsset as Asset}
              draggable={false}
              isParent={false}
              showDeleteButton={false}
              enableContextMenu={false}
              showName={false}
              showDuration={true}
              showFiletype={true}
            />
          </FlexRow>
          <FlexRow className="prev-next-items right" align="center" justify="flex-start" gap={0.5}>
            {displayNextAssets?.map((asset, idx) => {
              const assetIndex = currentIndex + 1 + idx;
              const isCompareSelected = compareAssetA?.id === asset.id;
              return (
                <EditorButton
                  className={`item ${isCompareSelected ? "compare-selected" : ""
                    }`}
                  key={asset.id || idx}
                  onMouseDown={() => handleThumbnailClick(asset, assetIndex)}
                  density="compact"
                >
                  <AssetItem
                    asset={asset}
                    draggable={false}
                    isParent={false}
                    showDeleteButton={false}
                    enableContextMenu={false}
                    showName={false}
                    showDuration={true}
                    showFiletype={true}
                  />
                </EditorButton>
              );
            })}
          </FlexRow>
          <FlexColumn className="asset-info" gap={0.5} align="flex-end">
            <Text className="folder-name">
              <span style={{ color: "white", marginRight: ".5em" }}>/</span>
              {currentFolderName || ""}
            </Text>
            {currentAsset?.name && (
              <Text size="small">{currentAsset.name}</Text>
            )}
            {currentAsset?.id && (
              <Text size="small">{currentAsset.id}</Text>
            )}
          </FlexColumn>
        </FlexRow>
      </>
    );
  }, [
    currentIndex,
    assetsToUse,
    currentAsset,
    currentFolderName,
    handleThumbnailClick,
    handlePrevAsset,
    handleNextAsset,
    compareMode,
    compareAssetA,
    compareAssetB
  ]);

  if (!open) {
    return null;
  }

  return (
    <div ref={containerRef} css={containerStyles}>
      <Dialog
        css={styles(theme)}
        maxWidth={false}
        fullWidth
        open={open}
        onClose={handleClose}
      >
        {/* Compare mode instruction bar */}
        {compareMode && !compareAssetB && (
          <FlexRow className="compare-mode-bar" gap={1} align="center">
            <Text size="small">
              Select another image from the thumbnails below to compare
            </Text>
            <EditorButton density="compact" onClick={cancelCompareMode}>
              Cancel
            </EditorButton>
          </FlexRow>
        )}

        {/* Show ImageComparer when both assets selected, otherwise show normal viewer */}
        {compareAssetA && compareAssetB ? (
          <div style={{ width: "100%", height: "calc(100% - 120px)" }}>
            <ImageComparer
              imageA={compareAssetA.get_url || ""}
              imageB={compareAssetB.get_url || ""}
              labelA={compareAssetA.name || "A"}
              labelB={compareAssetB.name || "B"}
              showLabels={true}
              showMetadata={true}
              initialMode="horizontal"
            />
          </div>
        ) : (
          assetViewer
        )}
        {navigation}

        {/*
          Render the toolbar after the main viewer in DOM order so it paints (and
          receives hit targets) on top; ImageViewer is a full-area interactive layer
          and would otherwise take precedence for equal/ambiguous stacking.
        */}
        <FlexRow
          className="actions"
          gap={1.5}
          align="center"
          sx={{ zIndex: 10_200 }}
        >
          <DownloadButton
            onClick={handleDownload}
            className="button download"
            nodrag={false}
          />
          {isImage && !compareMode && (
            <ToolbarIconButton
              icon={<EditIcon />}
              tooltip="Edit Image"
              onClick={handleOpenImageEditor}
              className="button edit"
              nodrag={false}
            />
          )}
          {isElectron && currentAsset?.content_type && isClipboardSupported(currentAsset.content_type) && (
            <ToolbarIconButton
              icon={copied ? <CheckIcon /> : <ContentCopyIcon />}
              tooltip={
                copied
                  ? "Copied!"
                  : currentAsset.content_type.startsWith("image/")
                    ? "Copy Image"
                    : currentAsset.content_type.startsWith("video/")
                      ? "Copy Video Info"
                      : currentAsset.content_type.startsWith("audio/")
                        ? "Copy Audio Info"
                        : "Copy Content"
              }
              onClick={handleCopyToClipboard}
              className="button copy"
              nodrag={false}
            />
          )}
          {canCompare && !compareMode && !compareAssetB && (
            <ToolbarIconButton
              icon={<CompareIcon />}
              tooltip="Compare with another image"
              onClick={startCompareMode}
              className="button compare"
              nodrag={false}
            />
          )}
          <CloseButton
            onClick={compareAssetB ? exitCompareView : handleClose}
            tooltip="Close"
            className="button close"
            nodrag={false}
          />
        </FlexRow>
      </Dialog>
    </div>
  );
};

export default memo(AssetViewer);
