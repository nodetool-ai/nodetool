/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
//mui
import { Typography, Dialog, Tooltip, Button } from "@mui/material";
//icons
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import KeyboardArrowLeftIcon from "@mui/icons-material/KeyboardArrowLeft";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import AssetItem from "./AssetItem";
//
//components
import ImageViewer from "../asset_viewer/ImageViewer";
import AudioViewer from "../asset_viewer/AudioViewer";
import TextViewer from "../asset_viewer/TextViewer";
import VideoViewer from "../asset_viewer/VideoViewer";
import PDFViewer from "../asset_viewer/PDFViewer";
//store
import { useAssetStore } from "../../stores/AssetStore";
import { Asset } from "../../stores/ApiTypes";
//utils
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import useAssets from "../../serverState/useAssets";
import { useCombo } from "../../stores/KeyPressedStore";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useAssetDownload } from "../../hooks/assets/useAssetDownload";
import { useAssetNavigation } from "../../hooks/assets/useAssetNavigation";
import { useAssetDisplay } from "../../hooks/assets/useAssetDisplay";
import { isElectron } from "../../utils/browser";

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
      height: "100%",
      backgroundColor: theme.vars.palette.grey[900],
      width: "100%",
      maxWidth: "100%",
      maxHeight: "100%",
      zIndex: 11000,
      margin: 0
    },
    ".asset-info": {
      position: "relative",
      maxWidth: "350px",
      display: "flex",
      flexDirection: "column",
      gap: "0.5em",
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
      zIndex: 10000,
      position: "absolute",
      display: "flex",
      flexDirection: "row",
      gap: "1.5em",
      top: "1em",
      right: "2em"
    },
    ".actions .button": {
      width: "1.75em",
      height: "1.75em",
      backgroundColor: "rgba(153, 153, 153, 0.67)",
      color: theme.vars.palette.grey[900],
      borderRadius: "0.2em",
      padding: "0.3em"
    },
    ".actions button svg": {
      fontSize: "1.5em"
    },
    ".actions .button:hover": {
      backgroundColor: theme.vars.palette.grey[500]
    },
    // -------------------
    ".asset-navigation": {
      position: "absolute",
      display: "flex",
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "self-end",
      gap: "1em",
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
      backgroundColor: "rgba(68, 68, 68, 0.6)",
      border: "2px solid rgba(170, 170, 170, 0.2)"
    },
    ".prev-next-button img": {
      cursor: "pointer !important",
      pointerEvents: "none"
    },
    ".prev-next-button:hover": {
      backgroundColor: "rgba(34, 34, 34, 0.93)"
    },
    ".prev-next-button.Mui-disabled": {
      color: theme.vars.palette.grey[600],
      backgroundColor: "rgba(102, 102, 102, 0.27)",
      cursor: "default",
      border: "1px solid rgba(204, 204, 204, 0.2)",
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
      display: "flex",
      flexDirection: "row",
      justifyContent: "center",
      gap: ".5em",
      alignItems: "center",
      width: "430px",
      maxWidth: "30vw"
    },
    ".prev-next-items.left": {
      justifyContent: "flex-end",
      marginLeft: "auto"
    },
    ".prev-next-items.right": {
      justifyContent: "flex-start"
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
      backgroundColor: "rgba(68, 68, 68, 0.4)",
      padding: "0",
      width: "120px",
      height: "80px",
      overflow: "hidden",
      cursor: "pointer !important"
    },
    ".prev-next-items .item .asset-item": {
      cursor: "pointer"
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

  // Copy to clipboard state and handler
  const [copied, setCopied] = useState(false);
  const handleCopyToClipboard = useCallback(async () => {
    const imageSrc = currentAsset?.get_url || url;
    if (!imageSrc || !isImage) {return;}

    try {
      const response = await fetch(imageSrc);
      const blob = await response.blob();
      
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      await window.api.clipboardWriteImage(dataUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy image to clipboard:", error);
    }
  }, [currentAsset?.get_url, url, isImage]);

  const handleChangeAsset = useCallback(
    (index: number) => {
      if (!assetsToUse) {return;}
      const newAsset = assetsToUse[index];
      setTimeout(() => {
        setCurrentAsset(newAsset);
      }, 10);
      setCurrentIndex(index);
    },
    [assetsToUse]
  );

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

  useCombo(["Escape"], handleClose);
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

  const navigation = useMemo(() => {
    if (currentIndex === null) {return null;}
    const prevAssets =
      assetsToUse?.slice(
        Math.max(0, currentIndex - prevNextAmount),
        currentIndex
      ) || [];
    const nextAssets =
      assetsToUse?.slice(currentIndex + 1, currentIndex + prevNextAmount + 1) ||
      [];
    return (
      <>
        <IconButton
          className="prev-next-button left"
          onMouseDown={() => handleChangeAsset(Math.max(0, currentIndex - 1))}
          disabled={prevAssets?.length === 0}
        >
          <KeyboardArrowLeftIcon />
        </IconButton>
        <IconButton
          className="prev-next-button right"
          onMouseDown={() =>
            handleChangeAsset(
              Math.min(assetsToUse.length - 1, currentIndex + 1)
            )
          }
          disabled={nextAssets?.length === 0}
        >
          <KeyboardArrowRightIcon />
        </IconButton>
        <div className="asset-navigation">
          <div className="prev-next-items left">
            {prevAssets?.map((asset, idx) => {
              // Calculate the actual index in the assetsToUse array
              const assetIndex = Math.max(
                0,
                currentIndex - prevAssets.length + idx
              );
              return (
                <Button
                  className="item"
                  key={asset.id || idx}
                  onMouseDown={() => handleChangeAsset(assetIndex)}
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
                </Button>
              );
            })}
          </div>
          <div className="prev-next-items current">
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
          </div>
          <div className="prev-next-items right">
            {nextAssets?.map((asset, idx) => {
              // Calculate the actual index in the assetsToUse array
              const assetIndex = currentIndex + 1 + idx;
              return (
                <Button
                  className="item"
                  key={asset.id || idx}
                  onMouseDown={() => handleChangeAsset(assetIndex)}
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
                </Button>
              );
            })}
          </div>
          <div className="asset-info">
            <Typography className="folder-name">
              <span style={{ color: "white", marginRight: ".5em" }}>/</span>
              {currentFolderName || ""}
            </Typography>
            {currentAsset?.name && (
              <Typography variant="body2">{currentAsset.name}</Typography>
            )}
            {currentAsset?.id && (
              <Typography variant="body2">{currentAsset.id}</Typography>
            )}
          </div>
        </div>
      </>
    );
  }, [
    currentIndex,
    assetsToUse,
    currentAsset,
    currentFolderName,
    handleChangeAsset
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
        open={asset !== undefined || url !== undefined}
      >
        <div className="actions">
          <Tooltip title="Download">
            <IconButton
              className="button download"
              edge="end"
              color="inherit"
              onMouseDown={handleDownload}
              aria-label="download"
            >
              <FileDownloadIcon />
            </IconButton>
          </Tooltip>
          {isElectron && isImage && (
            <Tooltip title={copied ? "Copied!" : "Copy Image"}>
              <IconButton
                className="button copy"
                edge="end"
                color="inherit"
                onMouseDown={handleCopyToClipboard}
                aria-label="copy image"
              >
                {copied ? <CheckIcon /> : <ContentCopyIcon />}
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Close" enterDelay={TOOLTIP_ENTER_DELAY}>
            <IconButton
              className="button close"
              edge="end"
              color="inherit"
              onMouseDown={handleClose}
              aria-label="close"
            >
              <CloseIcon />
            </IconButton>
          </Tooltip>
        </div>

        {assetViewer}
        {navigation}
      </Dialog>
    </div>
  );
};

export default AssetViewer;
