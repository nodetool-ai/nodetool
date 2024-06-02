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
//store
import { useAssetStore } from "../../hooks/AssetStore";
import { Asset } from "../../stores/ApiTypes";
//utils
import { TOOLTIP_ENTER_DELAY } from "../node/BaseNode";
import useAssets from "../../serverState/useAssets";
import { useHotkeys } from "react-hotkeys-hook";
//css
import "../../styles/node_editor.css";

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
      backgroundColor: theme.palette.c_gray0,
      width: "100%",
      maxWidth: "100%",
      maxHeight: "100%",
      zIndex: 11000,
      margin: 0
    },
    ".asset-info": {
      position: "absolute",
      maxWidth: "350px",
      display: "flex",
      flexDirection: "column",
      gap: "0.5em",
      margin: 0,
      padding: 0,
      bottom: "1em",
      right: "1em",
      zIndex: "2000",
      overflowWrap: "break-word"
    },
    ".asset-info p": {
      fontSize: "0.9em",
      textAlign: "right",
      margin: "0",
      padding: "0"
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
      color: theme.palette.c_gray0,
      borderRadius: "0.2em",
      padding: "0.3em"
    },
    ".actions button svg": {
      fontSize: "1.5em"
    },
    ".actions .button:hover": {
      backgroundColor: theme.palette.c_gray3
    },
    // -------------------
    ".asset-navigation": {
      position: "absolute",
      display: "flex",
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: "1em",
      width: "100%",
      height: "120px",
      padding: "0 1em",
      backgroundColor: theme.palette.c_gray1,
      bottom: 0,
      zIndex: 200
    },
    ".folder-name": {
      fontWeight: "bold",
      bottom: "3em",
      textAlign: "right",
      color: theme.palette.c_hl1
    },
    ".prev-next-button": {
      position: "absolute",
      top: "40%",
      width: "2em",
      height: "2em",
      zIndex: 20000,
      cursor: "pointer",
      color: theme.palette.c_gray5,
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
      width: "430px"
    },
    ".prev-next-items.left": {
      justifyContent: "flex-end"
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
  url?: string;
  open: boolean;
  contentType?: string;
  onClose: () => void;
};

const AssetViewer: React.FC<AssetViewerProps> = (props) => {
  const { asset, url, open, contentType, onClose: handleClose } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentAsset, setCurrentAsset] = useState<Asset | undefined>(asset);
  const getAsset = useAssetStore((state) => state.get);
  const sortedAssets = useAssets().sortedAssets;
  const [currentFolderName, setCurrentFolderName] = useState<string | null>();
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const prevNextAmount = 5;

  const handleChangeAsset = useCallback(
    (newAsset: Asset) => {
      setTimeout(() => {
        setCurrentAsset(newAsset);
      }, 10);
      if (sortedAssets) {
        const index = sortedAssets.findIndex((item) => item.id === newAsset.id);
        setCurrentIndex(index !== -1 ? index : null);
      } else {
        setCurrentIndex(null);
      }
    },
    [sortedAssets, setCurrentAsset, setCurrentIndex]
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
      const index = sortedAssets.findIndex((item) => item.id === asset.id);
      setCurrentIndex(index);
    }
  }, [asset, sortedAssets]);

  const changeAsset = useCallback(
    (direction: "left" | "right", controlKeyPressed: boolean) => {
      if (currentIndex !== null && sortedAssets) {
        if (direction === "left" && currentIndex > 0) {
          if (controlKeyPressed) {
            handleChangeAsset(
              sortedAssets[Math.max(currentIndex - prevNextAmount, 0)]
            );
          } else {
            handleChangeAsset(sortedAssets[currentIndex - 1]);
          }
        } else if (
          direction === "right" &&
          currentIndex < sortedAssets.length - 1
        )
          if (controlKeyPressed) {
            handleChangeAsset(
              sortedAssets[
              Math.min(
                currentIndex + prevNextAmount,
                sortedAssets.length - 1
              )
              ]
            );
          } else {
            handleChangeAsset(sortedAssets[currentIndex + 1]);
          }
      }
    },
    [handleChangeAsset, currentIndex, sortedAssets]
  );

  useHotkeys("esc", handleClose);
  useHotkeys("left", () => { changeAsset("left", false); });
  useHotkeys("right", () => { changeAsset("right", false); });
  useHotkeys("ctrl+left", () => { changeAsset("left", true); });
  useHotkeys("ctrl+right", () => { changeAsset("right", true); });

  const renderAsset = () => {
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
    }
  };
  const renderNavigation = () => {
    if (currentIndex === null) return null;
    const prevAssets =
      sortedAssets.slice(
        Math.max(0, currentIndex - prevNextAmount),
        currentIndex
      ) || [];
    const nextAssets =
      sortedAssets.slice(currentIndex + 1, currentIndex + prevNextAmount + 1) ||
      [];
    return (
      <>
        <IconButton
          className="prev-next-button left"
          onMouseDown={() => handleChangeAsset(prevAssets[prevAssets.length - 1])}
          disabled={prevAssets?.length === 0}
        >
          <KeyboardArrowLeftIcon />
        </IconButton>
        <IconButton
          className="prev-next-button right"
          onMouseDown={() => handleChangeAsset(nextAssets[0])}
          disabled={nextAssets?.length === 0}
        >
          <KeyboardArrowRightIcon />
        </IconButton>
        <div className="asset-navigation">
          <div className="asset-info">
            <Typography className="folder-name">
              <span style={{ color: "white", marginRight: ".5em" }}>/</span>
              {currentFolderName || ""}
            </Typography>
            {currentAsset?.name && (
              <Typography variant="body2">{currentAsset.name}</Typography>
            )}
          </div>
          <div className="prev-next-items left">
            {prevAssets?.map((asset) => (
              <Button
                className="item"
                key={asset.id}
                onMouseDown={() => handleChangeAsset(asset)}
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
            ))}
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
            {nextAssets?.map((asset) => (
              <Button
                className="item"
                key={asset.id}
                onMouseDown={() => handleChangeAsset(asset)}
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
            ))}
          </div>
        </div>
      </>
    );
  };

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
              onMouseDown={() => window.open(asset?.get_url || url, "_blank")}
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

        {renderAsset()}
        {renderNavigation()}
      </Dialog>
    </div>
  );
};

export default AssetViewer;
