/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";

// Filmstrip motion. Thumbnails reveal from the center outward as the gallery
// opens (and as new frames scroll in); the active frame pops when it changes.
const thumbReveal = keyframes({
  from: { opacity: 0, transform: "translateY(10px) scale(0.94)" },
  to: { opacity: 1, transform: "translateY(0) scale(1)" }
});

const activePop = keyframes({
  from: { opacity: 0.5, transform: "scale(0.86)" },
  to: { opacity: 1, transform: "scale(1)" }
});

const EASE_OUT_QUINT = "cubic-bezier(0.22, 1, 0.36, 1)";

import { useEffect, useState, useRef, useCallback, useMemo, memo } from "react";
import { useTranslation } from "react-i18next";
//mui
import {
  EditorButton,
  Dialog,
  Text,
  MOTION,
  reducedMotion,
  BORDER_RADIUS,
  SPACING,
  Z_INDEX,
  getSpacingPx,
  SHADOW
} from "../ui_primitives";
//icons
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import CompareIcon from "@mui/icons-material/Compare";
import EditIcon from "@mui/icons-material/EditOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import AutoFixHighOutlinedIcon from "@mui/icons-material/AutoFixHighOutlined";
import AssetFilmstrip from "./AssetFilmstrip";
import { TransformWithWorkflowView } from "./TransformWithWorkflowDialog";
import { transformSourceFromAsset } from "./transformWorkflow";
import AssetInfoPanel from "../context_menus/AssetInfoPanel";
import { ImageComparer } from "../widgets";
//
//components
//store
import { Asset } from "../../stores/ApiTypes";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
//utils
import useAssets from "../../serverState/useAssets";
import { useTheme } from "@mui/material/styles";
import type { SxProps, Theme } from "@mui/material/styles";
import { useAssetDownload } from "../../hooks/assets/useAssetDownload";
import { useAssetNavigation } from "../../hooks/assets/useAssetNavigation";
import { useAssetDisplay } from "../../hooks/assets/useAssetDisplay";
import { useEditVideoAsset } from "../../hooks/useEditVideoAsset";
import { useOpenAssetWorkflow } from "../../hooks/useOpenAssetWorkflow";
import { useNavigate } from "react-router-dom";
import { isElectron } from "../../utils/browser";
import {
  copyTooltip,
  editActionFor,
  filmstripWindow,
  viewerMedia
} from "./assetViewerModel";
import {
  copyAssetToClipboard,
  isClipboardSupported
} from "../../utils/clipboardUtils";
import {
  ToolbarIconButton,
  CloseButton,
  DownloadButton,
  FlexRow
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
      zIndex: theme.zIndex.floating
    },
    ".MuiPaper-root": {
      overflow: "hidden",
      height: "100vh",
      maxHeight: "100vh",
      backgroundColor: theme.vars.palette.grey[900],
      width: "100vw",
      maxWidth: "100vw",
      zIndex: theme.zIndex.floating,
      margin: 0,
      borderRadius: 0,
      position: "relative"
    },
    // The shared Dialog primitive wraps children in MUI's DialogContent, whose
    // default padding would push the viewer down (gap on top) and inset the
    // overlay controls. Make it a bare full-bleed, positioned container so the
    // media fills the screen and the toolbar/close button anchor to the edges.
    ".MuiDialogContent-root, .dialog-content": {
      padding: 0,
      margin: 0,
      width: "100%",
      height: "100%",
      overflow: "hidden",
      position: "relative",
      display: "block"
    },
    ".current-folder": {
      top: "20px"
    },
    ".actions": {
      zIndex: Z_INDEX.tooltip,
      position: "absolute",
      top: "1em",
      right: "2em"
    },
    ".actions .button": {
      width: "2em",
      height: "2em",
      backgroundColor: theme.vars.palette.background.paper,
      color: theme.vars.palette.text.primary,
      border: `1px solid ${theme.vars.palette.action.disabledBackground}`,
      borderRadius: BORDER_RADIUS.circle,
      padding: getSpacingPx(SPACING.xs)
    },
    ".actions button svg": {
      fontSize: "1.2em"
    },
    ".actions .button:hover": {
      backgroundColor: theme.vars.palette.action.hover,
      color: theme.vars.palette.primary.main
    },
    // -------------------
    ".asset-navigation": {
      position: "absolute",
      width: "100%",
      height: "120px",
      padding: `0 0 ${getSpacingPx(SPACING.md)} 0`,
      backgroundColor: theme.vars.palette.grey[800],
      bottom: 0,
      zIndex: Z_INDEX.overlay
    },
    ".prev-next-button": {
      position: "absolute",
      top: "40%",
      width: "2em",
      height: "2em",
      zIndex: Z_INDEX.toast,
      cursor: "pointer",
      color: theme.vars.palette.grey[200],
      backgroundColor: theme.vars.palette.background.paper,
      border: `2px solid ${theme.vars.palette.action.disabledBackground}`,
      transition: `transform var(--motion-fast) ${EASE_OUT_QUINT}, ${MOTION.background}, ${MOTION.opacity}`
    },
    ".prev-next-button:active": {
      transform: "scale(0.88)"
    },
    ".prev-next-button img": {
      cursor: "pointer !important",
      pointerEvents: "none"
    },
    ".prev-next-button:hover": {
      backgroundColor: theme.vars.palette.action.hover,
      color: theme.vars.palette.primary.main
    },
    ".prev-next-button.Mui-disabled": {
      color: theme.vars.palette.action.disabled,
      backgroundColor: theme.vars.palette.action.disabledBackground,
      cursor: "default",
      border: `1px solid ${theme.vars.palette.action.disabledBackground}`,
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
      borderRadius: BORDER_RADIUS.lg,
      border: `2px solid ${theme.vars.palette.primary.main}`,
      boxShadow: `0 0 0 4px rgb(${theme.vars.palette.primary.mainChannel} / 0.18), ${SHADOW(theme).lg}`,
      // Re-keyed by asset id on navigation, so this replays each time the
      // centered frame changes — a quick confident pop, no bounce.
      animation: `${activePop} ${MOTION.slow}`
    },
    ".prev-next-items .item": {
      backgroundColor: theme.vars.palette.background.paper,
      padding: "0",
      width: "120px",
      height: "80px",
      overflow: "hidden",
      borderRadius: BORDER_RADIUS.md,
      cursor: "pointer !important",
      willChange: "transform",
      transition: `transform var(--motion-normal) ${EASE_OUT_QUINT}, ${MOTION.shadow}`,
      // `backwards` keeps the from-state during the stagger delay but releases
      // the element afterward, so the hover transition below still applies.
      animation: `${thumbReveal} ${MOTION.slow} backwards`
    },
    ".prev-next-items .item:hover": {
      transform: "translateY(-6px) scale(1.06)",
      boxShadow: SHADOW(theme).lg,
      zIndex: Z_INDEX.raised
    },
    // Press feedback: quick dip on click before the frame slides to center.
    ".prev-next-items .item:active": {
      transform: "translateY(-1px) scale(0.95)",
      transition: MOTION.transform,
      zIndex: Z_INDEX.raised
    },
    // Cascade from the center outward: nearest-to-center frame leads. These
    // per-item stagger delays are functional offsets, not a motion-design tier,
    // so they stay as explicit ms values (see DESIGN.md §5).
    ".prev-next-items.left .item:nth-last-child(1)": {
      animationDelay: `${20}ms`
    },
    ".prev-next-items.left .item:nth-last-child(2)": {
      animationDelay: `${60}ms`
    },
    ".prev-next-items.left .item:nth-last-child(3)": {
      animationDelay: `${100}ms`
    },
    ".prev-next-items.left .item:nth-last-child(4)": {
      animationDelay: `${140}ms`
    },
    ".prev-next-items.left .item:nth-last-child(5)": {
      animationDelay: `${180}ms`
    },
    ".prev-next-items.right .item:nth-child(1)": { animationDelay: `${20}ms` },
    ".prev-next-items.right .item:nth-child(2)": { animationDelay: `${60}ms` },
    ".prev-next-items.right .item:nth-child(3)": { animationDelay: `${100}ms` },
    ".prev-next-items.right .item:nth-child(4)": { animationDelay: `${140}ms` },
    ".prev-next-items.right .item:nth-child(5)": { animationDelay: `${180}ms` },
    ...reducedMotion({
      ".prev-next-items .item, .prev-next-items.current": {
        animation: "none",
        transition: "none"
      },
      ".prev-next-items .item:hover, .prev-next-items .item:active, .prev-next-button:active":
        {
          transform: "none"
        }
    }),
    ".prev-next-items .item .asset-item": {
      cursor: "pointer"
    },
    ".compare-mode-bar": {
      position: "absolute",
      top: "1em",
      left: "50%",
      transform: "translateX(-50%)",
      padding: theme.spacing(1, 2),
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: BORDER_RADIUS.md,
      zIndex: Z_INDEX.modal,
      color: theme.vars.palette.text.primary,
      fontSize: theme.fontSizeSmall
    },
    ".compare-mode-bar button": {
      color: theme.vars.palette.text.primary,
      textTransform: "none"
    },
    ".select-for-compare": {
      position: "absolute",
      bottom: "130px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: Z_INDEX.modal,
      padding: theme.spacing(1, 1.5),
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: BORDER_RADIUS.md,
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.primary
    },
    ".prev-next-items .item.compare-selected": {
      outline: "3px solid",
      outlineColor: theme.vars.palette.primary.main
    },
    // The caption a caller supplies for the current asset: text over the media
    // rather than beside it, so the picture keeps the whole frame.
    ".caption-overlay": {
      position: "absolute",
      left: 0,
      right: 0,
      display: "flex",
      justifyContent: "center",
      padding: `${SPACING.lg}px ${SPACING.xxl}px`,
      pointerEvents: "none",
      zIndex: Z_INDEX.overlay,
      background:
        "linear-gradient(to top, rgba(var(--palette-common-black-channel) / 0.72), rgba(var(--palette-common-black-channel) / 0))"
    },
    ".caption-overlay .caption-text": {
      maxWidth: "70ch",
      textAlign: "center",
      textShadow: "0 1px 3px rgb(0 0 0 / 0.9)",
      color: theme.vars.palette.common.white
    },
    ".info-panel-overlay": {
      position: "absolute",
      top: 0,
      right: 0,
      height: "calc(100% - 120px)",
      overflowY: "auto",
      zIndex: Z_INDEX.modal,
      backgroundColor: theme.vars.palette.grey[900],
      boxShadow: SHADOW(theme).lg
    }
  });

type AssetViewerProps = {
  asset?: Asset;
  sortedAssets?: Asset[];
  url?: string;
  open: boolean;
  contentType?: string;
  /**
   * Text to lay over the media, keyed by asset id. A caller that knows what an
   * asset means in its own surface — the shot a still belongs to, say — says so
   * here; the viewer itself has only the asset record.
   */
  captions?: Record<string, string>;
  /**
   * Ids of records a caller built for media that is not in the library, such
   * as a shipped style sample. They have nothing to edit or describe, so the
   * edit and info actions are hidden for them.
   */
  detachedIds?: ReadonlySet<string>;
  onClose: () => void;
};

/** Thumbnails shown on each side of the current asset. */
const FILMSTRIP_NEIGHBOURS = 5;

const AssetViewer: React.FC<AssetViewerProps> = (props) => {
  const { t } = useTranslation("translation", { keyPrefix: "i18n-next27" });
  const theme = useTheme();
  const {
    asset,
    sortedAssets,
    url,
    open,
    contentType,
    captions,
    detachedIds,
    onClose: handleClose
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const [currentAsset, setCurrentAsset] = useState<Asset | undefined>(asset);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);

  // Info panel (asset metadata, incl. the prompt that produced the asset)
  const [showInfo, setShowInfo] = useState(false);
  const toggleInfo = useCallback(() => setShowInfo((v) => !v), []);

  // Compare mode state
  const [compareMode, setCompareMode] = useState(false);
  const [compareAssetA, setCompareAssetA] = useState<Asset | null>(null);
  const [compareAssetB, setCompareAssetB] = useState<Asset | null>(null);

  // Editing opens the asset in a workspace tab (image → sketch editor,
  // model3d → 3D editor), retiring the legacy /assets/edit route.
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const navigate = useNavigate();
  const { folderFiles, projectId } = useAssets();
  const editVideoAsset = useEditVideoAsset(projectId);

  // Reset compare mode when viewer closes
  useEffect(() => {
    if (!open) {
      setCompareMode(false);
      setCompareAssetA(null);
      setCompareAssetB(null);
      setShowInfo(false);
    }
  }, [open]);

  const assetsToUse = useMemo(
    () => sortedAssets || folderFiles || [],
    [sortedAssets, folderFiles]
  );

  const { handleDownload } = useAssetDownload({ currentAsset, url });

  const media = useMemo(
    () => viewerMedia(currentAsset, url, contentType),
    [currentAsset, url, contentType]
  );
  const editAction = useMemo(
    () => editActionFor(currentAsset, media),
    [currentAsset, media]
  );

  const imageAssets = useMemo(
    () => assetsToUse.filter((a) => a.content_type?.startsWith("image/")),
    [assetsToUse]
  );
  const canCompare = media.isImage && imageAssets.length >= 2;

  const viewerActionButtonSx = useMemo<SxProps<Theme>>(
    () => ({
      width: theme.spacing(4),
      height: theme.spacing(4),
      backgroundColor: theme.vars.palette.background.paper,
      color: theme.vars.palette.text.primary,
      border: `1px solid ${theme.vars.palette.action.disabledBackground}`,
      borderRadius: BORDER_RADIUS.circle,
      padding: theme.spacing(0.5),
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        color: theme.vars.palette.primary.main
      },
      "& svg": {
        fontSize: theme.fontSizeBig
      }
    }),
    [theme]
  );

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

  const handleEdit = useCallback(() => {
    if (!currentAsset || !editAction) {
      return;
    }
    if (editAction.kind === "video") {
      void editVideoAsset(currentAsset);
    } else {
      openTab({
        type: editAction.tabType,
        ref: currentAsset.id,
        mode: "edit",
        title: editAction.title,
        projectId: currentAsset.project_id ?? projectId
      });
      navigate("/workspace");
    }
    handleClose();
  }, [
    currentAsset,
    editAction,
    editVideoAsset,
    openTab,
    navigate,
    handleClose,
    projectId
  ]);

  const { openWorkflow } = useOpenAssetWorkflow();
  const handleOpenWorkflow = useCallback(() => {
    if (currentAsset?.workflow_id) {
      void openWorkflow(currentAsset);
      handleClose();
    }
  }, [currentAsset, openWorkflow, handleClose]);

  // Copy to clipboard state and handler
  const [copied, setCopied] = useState(false);

  // The source is fixed when the dialog opens, so stepping through the
  // filmstrip behind it does not change what the run takes.
  const [transformAsset, setTransformAsset] = useState<Asset | null>(null);
  const transformSource = useMemo(
    () => (currentAsset ? transformSourceFromAsset(currentAsset) : null),
    [currentAsset]
  );
  const handleTransform = useCallback(() => {
    if (currentAsset) {
      setTransformAsset(currentAsset);
    }
  }, [currentAsset]);
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
  }, [
    currentAsset?.get_url,
    currentAsset?.content_type,
    currentAsset?.name,
    url,
    contentType
  ]);

  const handleChangeAsset = useCallback(
    (index: number) => {
      if (!assetsToUse) {
        return;
      }
      const newAsset = assetsToUse[index];
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
    if (asset) {
      setCurrentAsset(asset);
      const index = assetsToUse?.findIndex((item) => item.id === asset.id);
      setCurrentIndex(index !== undefined && index !== -1 ? index : null);
    }
  }, [asset, assetsToUse]);

  useAssetNavigation({
    open,
    assets: assetsToUse,
    currentIndex,
    prevNextAmount: FILMSTRIP_NEIGHBOURS,
    onChangeIndex: handleChangeAsset
  });
  const caption = currentAsset ? captions?.[currentAsset.id] : undefined;
  const inLibrary = !(currentAsset && detachedIds?.has(currentAsset.id));

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
    if (currentIndex === null) {
      return;
    }
    handleChangeAsset(Math.max(0, currentIndex - 1));
  }, [currentIndex, handleChangeAsset]);

  const handleNextAsset = useCallback(() => {
    if (currentIndex === null) {
      return;
    }
    handleChangeAsset(Math.min(assetsToUse.length - 1, currentIndex + 1));
  }, [currentIndex, assetsToUse.length, handleChangeAsset]);

  const strip = useMemo(
    () =>
      currentIndex === null || compareAssetB
        ? null
        : filmstripWindow(
            assetsToUse,
            currentIndex,
            FILMSTRIP_NEIGHBOURS,
            compareMode
          ),
    [assetsToUse, currentIndex, compareAssetB, compareMode]
  );
  const navigation = strip ? (
    <AssetFilmstrip
      current={currentAsset}
      strip={strip}
      compareMode={compareMode}
      compareSelectedId={compareAssetA?.id}
      onPrev={handlePrevAsset}
      onNext={handleNextAsset}
      onThumbnail={handleThumbnailClick}
    />
  ) : null;

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
        aria-label={t("assetViewer.label")}
        variant="fullscreen"
        slotProps={{
          // Media sits on a dark surface rather than the paper color.
          paper: {
            style: { background: theme.vars.palette.grey[900] }
          },
          backdrop: {
            style: {
              backgroundColor: theme.vars.palette.grey[900]
            }
          }
        }}
      >
        {/* Compare mode instruction bar */}
        {compareMode && !compareAssetB && (
          <FlexRow className="compare-mode-bar" gap={SPACING.xs} align="center">
            <Text size="small">
              {t("assetViewer.selectImageToCompare")}
            </Text>
            <EditorButton density="compact" onClick={cancelCompareMode}>
              {t("assetViewer.cancel")}
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

        {caption && !compareMode && (
          <div
            className="caption-overlay"
            // The filmstrip owns the bottom 120px whenever it is on screen.
            style={{ bottom: navigation ? 120 : 0 }}
          >
            <Text size="small" className="caption-text">
              {caption}
            </Text>
          </div>
        )}

        {showInfo && currentAsset && !compareMode && (
          <div className="info-panel-overlay">
            <AssetInfoPanel asset={currentAsset} onOpenWorkflow={handleClose} />
          </div>
        )}

        {/*
          Render the toolbar after the main viewer in DOM order so it paints (and
          receives hit targets) on top; ImageViewer is a full-area interactive layer
          and would otherwise take precedence for equal/ambiguous stacking.
        */}
        <FlexRow
          className="actions"
          gap={SPACING.sm}
          align="center"
          sx={{ zIndex: Z_INDEX.tooltip }}
        >
          <DownloadButton
            onClick={handleDownload}
            className="button download"
            nodrag={false}
            sx={viewerActionButtonSx}
          />
          {editAction && !compareMode && inLibrary && (
            <ToolbarIconButton
              icon={<EditIcon />}
              tooltip={editAction.tooltip}
              onClick={handleEdit}
              className="button edit"
              nodrag={false}
              sx={viewerActionButtonSx}
            />
          )}
          {transformSource && !compareMode && inLibrary && (
            <ToolbarIconButton
              icon={<AutoFixHighOutlinedIcon />}
              tooltip={t("transformWithWorkflow.open")}
              onClick={handleTransform}
              className="button transform"
              nodrag={false}
              sx={viewerActionButtonSx}
            />
          )}
          {currentAsset?.workflow_id && !compareMode && inLibrary && (
            <ToolbarIconButton
              icon={<AccountTreeIcon />}
              tooltip={t("assetViewer.openWorkflow")}
              onClick={handleOpenWorkflow}
              className="button open-workflow"
              nodrag={false}
              sx={viewerActionButtonSx}
            />
          )}
          {isElectron &&
            currentAsset?.content_type &&
            isClipboardSupported(currentAsset.content_type) && (
              <ToolbarIconButton
                icon={copied ? <CheckIcon /> : <ContentCopyIcon />}
                tooltip={copyTooltip(currentAsset.content_type, copied)}
                onClick={handleCopyToClipboard}
                className="button copy"
                nodrag={false}
                sx={viewerActionButtonSx}
              />
            )}
          {canCompare && !compareMode && !compareAssetB && (
            <ToolbarIconButton
              icon={<CompareIcon />}
              tooltip={t("assetViewer.compareImage")}
              onClick={startCompareMode}
              className="button compare"
              nodrag={false}
              sx={viewerActionButtonSx}
            />
          )}
          {currentAsset && !compareMode && inLibrary && (
            <ToolbarIconButton
              icon={<InfoOutlinedIcon />}
              tooltip={showInfo ? t("assetViewer.hideInfo") : t("assetViewer.showInfo")}
              onClick={toggleInfo}
              className="button info"
              nodrag={false}
              sx={viewerActionButtonSx}
            />
          )}
          <CloseButton
            onClick={compareAssetB ? exitCompareView : handleClose}
            tooltip={t("assetViewer.close")}
            className="button close"
            nodrag={false}
            sx={viewerActionButtonSx}
          />
        </FlexRow>
      </Dialog>
      {transformAsset && (
        <TransformWithWorkflowView
          key={transformAsset.id}
          source={transformSourceFromAsset(transformAsset)}
          onClose={() => setTransformAsset(null)}
          aboveFloating
        />
      )}
    </div>
  );
};

export default memo(AssetViewer);
