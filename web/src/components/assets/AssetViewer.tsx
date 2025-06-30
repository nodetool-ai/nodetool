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

const containerStyles = css({
  width: "100%",
  height: "100%",
  overflow: "hidden",
  margin: 0,
  position: "relative",
  pointerEvents: "none"
});

const styles = (theme: any) =>
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
      backgroundColor: theme.palette.grey[900],
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
      backgroundColor: "#999999aa",
      color: theme.palette.grey[900],
      borderRadius: "0.2em",
      padding: "0.3em"
    },
    ".actions button svg": {
      fontSize: "1.5em"
    },
    ".actions .button:hover": {
      backgroundColor: theme.palette.grey[500]
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
      backgroundColor: theme.palette.grey[800],
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
      color: theme.palette.grey[200],
      backgroundColor: "#44444499",
      border: "2px solid #aaaaaa33"
    },
    ".prev-next-button img": {
      cursor: "pointer !important",
      pointerEvents: "none"
    },
    ".prev-next-button:hover": {
      backgroundColor: "#222222ee"
    },
    ".prev-next-button.Mui-disabled": {
      color: "#444",
      backgroundColor: "#66666644",
      cursor: "default",
      border: "1px solid #cccccc33",
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
      border: `1px solid ${theme.palette.c_white}`
    },
    ".prev-next-items .item": {
      backgroundColor: "#44444466",
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

  const handleDownload = useCallback(() => {
    const downloadUrl = url || (currentAsset && currentAsset.get_url);

    if (!downloadUrl) return;

    // Always use anchor element for downloading
    const link = document.createElement("a");
    link.href = downloadUrl;

    // Extract filename from asset or URL
    let filename = "download";
    if (currentAsset?.name) {
      filename = currentAsset.name;
    } else if (downloadUrl.startsWith("data:")) {
      // Try to determine file extension from data URI
      const match = downloadUrl.match(/data:([^;]+)/);
      if (match) {
        const mimeType = match[1];
        const extension = mimeType.split("/")[1];
        if (extension) {
          filename = `download.${extension}`;
        }
      }
    } else {
      // Extract filename from URL path
      try {
        const urlObj = new URL(downloadUrl);
        const pathname = urlObj.pathname;
        const lastSegment = pathname.split("/").pop();
        if (lastSegment && lastSegment.includes(".")) {
          filename = lastSegment;
        }
      } catch (e) {
        // If URL parsing fails, keep default filename
      }
    }

    link.download = filename;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [currentAsset, url]);

  const handleChangeAsset = useCallback(
    (index: number) => {
      if (assetsToUse && index >= 0 && index < assetsToUse.length) {
        const newAsset = assetsToUse[index];
        setTimeout(() => {
          setCurrentAsset(newAsset);
        }, 10);
        setCurrentIndex(index);
      }
    },
    [assetsToUse, setCurrentAsset, setCurrentIndex]
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

  const changeAsset = useCallback(
    (direction: "left" | "right", controlKeyPressed: boolean) => {
      if (currentIndex !== null && assetsToUse) {
        if (direction === "left" && currentIndex > 0) {
          if (controlKeyPressed) {
            const newIndex = Math.max(currentIndex - prevNextAmount, 0);
            handleChangeAsset(newIndex);
          } else {
            handleChangeAsset(currentIndex - 1);
          }
        } else if (
          direction === "right" &&
          currentIndex < assetsToUse.length - 1
        ) {
          if (controlKeyPressed) {
            const newIndex = Math.min(
              currentIndex + prevNextAmount,
              assetsToUse.length - 1
            );
            handleChangeAsset(newIndex);
          } else {
            handleChangeAsset(currentIndex + 1);
          }
        }
      }
    },
    [handleChangeAsset, currentIndex, assetsToUse, prevNextAmount]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;

      if (e.key === "ArrowLeft") {
        changeAsset("left", e.ctrlKey);
      } else if (e.key === "ArrowRight") {
        changeAsset("right", e.ctrlKey);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, changeAsset]);

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

  const assetViewer = useMemo(() => {
    const type = currentAsset?.content_type || contentType || "";

    if (currentAsset) {
      if (type.startsWith("image/")) {
        return <ImageViewer asset={currentAsset} />;
      }
      if (type.startsWith("audio/")) {
        return <AudioViewer asset={currentAsset} />;
      }
      if (type.startsWith("text/")) {
        return <TextViewer asset={currentAsset} />;
      }
      if (type.startsWith("video/")) {
        return <VideoViewer asset={currentAsset} />;
      }
      if (type.startsWith("application/pdf")) {
        return <PDFViewer asset={currentAsset} />;
      }
    }
    if (url) {
      if (type.startsWith("image/")) {
        return <ImageViewer url={url} />;
      }
      if (type.startsWith("audio/")) {
        return <AudioViewer url={url} />;
      }
      if (type.startsWith("text/")) {
        return <TextViewer asset={currentAsset} />;
      }
      if (type.startsWith("video/")) {
        return <VideoViewer url={url} />;
      }
      if (type.startsWith("application/pdf")) {
        return <PDFViewer url={url} />;
      }
      if (type === "document" && url?.endsWith(".pdf")) {
        return <PDFViewer url={url} />;
      }
    }
  }, [currentAsset, url, contentType]);

  const navigation = useMemo(() => {
    if (currentIndex === null) return null;
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
        css={styles}
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
