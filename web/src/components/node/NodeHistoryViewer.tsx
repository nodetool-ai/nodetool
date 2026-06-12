/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import CropSquareIcon from "@mui/icons-material/CropSquare";
import GridViewIcon from "@mui/icons-material/GridView";
import KeyboardArrowLeftIcon from "@mui/icons-material/KeyboardArrowLeft";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import DownloadIcon from "@mui/icons-material/Download";

import { isBitmapImage } from "@nodetool-ai/protocol";
import AssetViewer from "../assets/AssetViewer";
import BitmapCanvas from "./BitmapCanvas";
import { useNodeResultHistory } from "../../hooks/nodes/useNodeResultHistory";
import { useNodeGenerations } from "../../hooks/nodes/useNodeGenerations";
import { outputOf } from "../../utils/nodeGenerations";
import type { Asset } from "../../stores/ApiTypes";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";
import { ToolbarIconButton, MOTION } from "../ui_primitives";
import { MediaOverlaySuppressProvider } from "./MediaOverlayContext";

interface NodeHistoryViewerProps {
  workflowId: string;
  nodeId: string;
  /** The current live (in-memory) result for this node, used when a run is
   *  in progress and the new asset hasn't been persisted yet. */
  liveResult: unknown;
  /**
   * Render the body content for the currently selected value in single mode.
   * Caller decides how to render image / video / audio / etc. — the viewer
   * only manages history navigation and overlay controls.
   */
  renderSingle: (value: unknown) => React.ReactNode;
}

type Mode = "single" | "multi";

const MEDIA_PREFIXES = ["image/", "video/", "audio/"] as const;

const isMediaAsset = (asset: Asset): boolean => {
  if (typeof asset.content_type !== "string") return false;
  return MEDIA_PREFIXES.some((p) => asset.content_type.startsWith(p));
};

const formatDuration = (seconds: number | null | undefined): string => {
  if (seconds == null || !Number.isFinite(seconds)) return "";
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const styles = (theme: Theme) =>
  css({
    "&": {
      position: "relative",
      width: "100%",
      height: "100%",
      minHeight: "80px",
      display: "flex",
      flexDirection: "column"
    },
    ".node-history-overlay": {
      position: "absolute",
      zIndex: 10,
      pointerEvents: "none",
      opacity: 0,
      transition: `opacity ${MOTION.normal}`
    },
    "&:hover .node-history-overlay, &:focus-within .node-history-overlay": {
      opacity: 1
    },
    ".overlay-cluster": {
      pointerEvents: "auto",
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "2px 4px",
      borderRadius: "var(--rounded-sm)",
      backgroundColor: "rgba(0, 0, 0, 0.55)",
      color: theme.vars.palette.common.white
    },
    ".overlay-top-left": {
      top: 6,
      left: 6
    },
    ".overlay-top-right": {
      top: 6,
      right: 6
    },
    ".overlay-bottom-left": {
      bottom: 6,
      left: 6,
      fontSize: theme.fontSizeTiny,
      fontFamily: "monospace",
      color: theme.vars.palette.common.white
    },
    ".overlay-count": {
      minWidth: "2.5em",
      textAlign: "center",
      fontVariantNumeric: "tabular-nums",
      fontSize: theme.fontSizeSmaller
    },
    ".overlay-icon-btn": {
      width: 22,
      height: 22,
      padding: 2,
      color: "inherit",
      "& svg": { fontSize: 16 }
    },
    ".overlay-icon-btn:disabled": {
      opacity: 0.4
    },
    ".body": {
      flex: 1,
      minHeight: 0,
      minWidth: 0,
      display: "flex"
    },
    ".grid": {
      flex: 1,
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))",
      gap: 4,
      padding: 4,
      overflow: "auto",
      alignContent: "start"
    },
    ".thumb": {
      position: "relative",
      aspectRatio: "1 / 1",
      backgroundColor: "rgba(0, 0, 0, 0.2)",
      borderRadius: "var(--rounded-sm)",
      overflow: "hidden",
      cursor: "pointer",
      border: `1px solid transparent`,
      "&:hover": {
        borderColor: theme.vars.palette.primary.main
      }
    },
    ".thumb img, .thumb video, .thumb canvas": {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      display: "block"
    },
    ".thumb-label": {
      position: "absolute",
      bottom: 2,
      right: 4,
      fontSize: theme.fontSizeTiny,
      color: theme.vars.palette.common.white,
      textShadow: "0 0 2px rgba(0,0,0,0.8)"
    },
    ".thumb.selected": {
      borderColor: theme.vars.palette.primary.main
    }
  });

const NodeHistoryViewerInternal: React.FC<NodeHistoryViewerProps> = ({
  workflowId,
  nodeId,
  liveResult,
  renderSingle
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  // Generation timeline drives selection (oldest→newest, current = selected ?? latest).
  const { generations, current, select } = useNodeGenerations(
    workflowId,
    nodeId
  );
  // Parallel read of the durable assets solely for the fullscreen viewer,
  // download, and the dimensions/duration badge — those need the full Asset.
  const { assetHistory } = useNodeResultHistory(workflowId, nodeId);
  const isRunning = useWebsocketRunner((s) => s.state === "running");

  const [mode, setMode] = useState<Mode>("single");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [imageDims, setImageDims] = useState<{ width: number; height: number } | null>(null);

  const mediaAssets = useMemo<Asset[]>(
    () => assetHistory.filter(isMediaAsset),
    [assetHistory]
  );
  const assetById = useMemo(
    () => new Map(assetHistory.map((a) => [a.id, a])),
    [assetHistory]
  );

  const total = generations.length;
  const hasHistory = total > 0;
  const currentIndex = Math.max(
    0,
    generations.findIndex((g) => g.id === current?.id)
  );

  // While a run is in progress and the live result is non-null, show the
  // live result (the in-flight preview) and freeze pagination. Once the run
  // completes and assets persist, the new generation becomes current and we
  // return to history mode.
  const showingLive = isRunning && liveResult != null;

  // Full Asset for the current generation (when persisted), used by the viewer,
  // download, and the info badge.
  const currentAsset: Asset | null =
    (current?.assetId ? assetById.get(current.assetId) : undefined) ?? null;

  const valueToRender = useMemo(() => {
    if (showingLive) return liveResult;
    if (current) return outputOf(current);
    return liveResult;
  }, [showingLive, liveResult, current]);

  // Probe image natural dimensions for the bottom-left badge. Falls back to
  // asset metadata when present.
  useEffect(() => {
    setImageDims(null);
    if (showingLive) return;
    if (!currentAsset) return;
    const md = currentAsset.metadata as
      | { width?: number; height?: number }
      | null
      | undefined;
    if (md && typeof md.width === "number" && typeof md.height === "number") {
      setImageDims({ width: md.width, height: md.height });
      return;
    }
    if (!currentAsset.content_type?.startsWith("image/")) return;
    const url = currentAsset.get_url || currentAsset.thumb_url;
    if (!url) return;
    const img = new Image();
    let cancelled = false;
    img.onload = () => {
      if (!cancelled) {
        setImageDims({ width: img.naturalWidth, height: img.naturalHeight });
      }
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [currentAsset, showingLive]);

  const handlePrev = useCallback(() => {
    if (total <= 1) return;
    const i = (currentIndex - 1 + total) % total;
    select(generations[i].id);
  }, [total, currentIndex, generations, select]);

  const handleNext = useCallback(() => {
    if (total <= 1) return;
    const i = (currentIndex + 1) % total;
    select(generations[i].id);
  }, [total, currentIndex, generations, select]);

  const handleToggleMode = useCallback(() => {
    setMode((m) => (m === "single" ? "multi" : "single"));
  }, []);

  // The fullscreen AssetViewer only renders media; text generations use the
  // inline preview only.
  const canOpenViewer =
    !!currentAsset && !showingLive && isMediaAsset(currentAsset);
  const handleOpenViewer = useCallback(() => {
    if (!canOpenViewer) return;
    setViewerOpen(true);
  }, [canOpenViewer]);

  // Children (ImageView) render under this context: it suppresses their own
  // overlay/viewer and routes "open" here, so the viewer's gallery reflects the
  // node's full generation history.
  const overlayValue = useMemo(
    () => ({ suppressed: true, onRequestOpenViewer: handleOpenViewer }),
    [handleOpenViewer]
  );

  const handleCloseViewer = useCallback(() => {
    setViewerOpen(false);
  }, []);

  const handleSelectThumb = useCallback(
    (index: number) => {
      select(generations[index].id);
      setMode("single");
    },
    [generations, select]
  );

  const handleGridClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const thumb = (e.target as HTMLElement).closest<HTMLElement>(".thumb");
      if (!thumb) return;
      const idx = Number(thumb.dataset.index);
      if (!Number.isNaN(idx)) handleSelectThumb(idx);
    },
    [handleSelectThumb]
  );

  const fallbackThumbStyle = useMemo<React.CSSProperties>(
    () => ({
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: theme.vars.palette.text.secondary,
      fontSize: theme.fontSizeTiny
    }),
    [theme.vars.palette.text.secondary, theme.fontSizeTiny]
  );

  const handleDownload = useCallback(async () => {
    if (!currentAsset) return;
    const url = currentAsset.get_url;
    if (!url) return;
    const filename = currentAsset.name || `${currentAsset.id}`;
    let downloadUrl = url;
    let createdUrl: string | null = null;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      createdUrl = URL.createObjectURL(blob);
      downloadUrl = createdUrl;
    } catch (err) {
      console.warn("NodeHistoryViewer: fetch for download failed, using raw URL", err);
    }
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (createdUrl) {
      setTimeout(() => URL.revokeObjectURL(createdUrl), 0);
    }
  }, [currentAsset]);

  // Empty history and no live preview: nothing to navigate. Delegate
  // rendering and skip the overlay entirely.
  if (!hasHistory && liveResult == null) {
    return <>{renderSingle(null)}</>;
  }

  const showPagination = mode === "single" && !showingLive && total > 1;
  const showInfoBadge = mode === "single";

  // Bottom-left info string.
  const infoText = (() => {
    if (showingLive) return "Live";
    if (!currentAsset) return "";
    if (currentAsset.content_type?.startsWith("image/")) {
      if (imageDims) return `${imageDims.width}x${imageDims.height}`;
      return "";
    }
    if (currentAsset.duration != null) {
      return formatDuration(currentAsset.duration);
    }
    return "";
  })();

  return (
    <div css={cssStyles} className="node-history-viewer">
      <div className="body">
        {mode === "single" ? (
          <MediaOverlaySuppressProvider value={overlayValue}>
            <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
              {renderSingle(valueToRender)}
            </div>
          </MediaOverlaySuppressProvider>
        ) : (
          <div className="grid nodrag nopan" role="list" aria-label="Output history" onClick={handleGridClick}>
            {generations.map((gen, i) => {
              const value = outputOf(gen) as
                | { type?: string; uri?: string }
                | undefined;
              const asset = gen.assetId ? assetById.get(gen.assetId) : undefined;
              const kind = value?.type;
              const label = asset?.name || gen.id;
              const imgUrl = asset?.thumb_url || asset?.get_url || value?.uri || "";
              const previewBitmap = isBitmapImage(value)
                ? (value.bitmap as ImageBitmap)
                : undefined;
              const videoThumb = asset?.thumb_url;
              const videoUrl = asset?.get_url || value?.uri || "";
              return (
                <div
                  key={gen.id}
                  className={`thumb${i === currentIndex ? " selected" : ""}`}
                  role="listitem"
                  data-index={i}
                >
                  {kind === "image" && imgUrl ? (
                    <img src={imgUrl} alt={label} />
                  ) : kind === "image" && previewBitmap ? (
                    <BitmapCanvas bitmap={previewBitmap} aria-label={label} />
                  ) : kind === "video" && (videoThumb || videoUrl) ? (
                    videoThumb ? (
                      <img src={videoThumb} alt={label} />
                    ) : (
                      <video
                        src={`${videoUrl}#t=0.1`}
                        preload="metadata"
                        muted
                        playsInline
                        aria-label={label}
                      />
                    )
                  ) : (
                    <div style={fallbackThumbStyle}>
                      {kind || "asset"}
                    </div>
                  )}
                  <span className="thumb-label">{i + 1}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* top-left overlay: mode toggle + pagination */}
      <div className="node-history-overlay overlay-top-left">
        <div className="overlay-cluster">
          <ToolbarIconButton
            title={mode === "single" ? "Switch to grid view" : "Switch to single view"}
            size="small"
            onClick={handleToggleMode}
            className="overlay-icon-btn"
            aria-label="Toggle view mode"
          >
            {mode === "single" ? <CropSquareIcon /> : <GridViewIcon />}
          </ToolbarIconButton>
          {showPagination ? (
            <>
              <ToolbarIconButton
                title="Previous"
                size="small"
                onClick={handlePrev}
                className="overlay-icon-btn"
                aria-label="Previous output"
              >
                <KeyboardArrowLeftIcon />
              </ToolbarIconButton>
              <span className="overlay-count">
                {`${currentIndex + 1} / ${total}`}
              </span>
              <ToolbarIconButton
                title="Next"
                size="small"
                onClick={handleNext}
                className="overlay-icon-btn"
                aria-label="Next output"
              >
                <KeyboardArrowRightIcon />
              </ToolbarIconButton>
            </>
          ) : null}
        </div>
      </div>

      {/* top-right overlay: fullscreen viewer + download */}
      <div className="node-history-overlay overlay-top-right">
        <div className="overlay-cluster">
          <ToolbarIconButton
            title="Open in viewer"
            size="small"
            onClick={handleOpenViewer}
            disabled={!canOpenViewer}
            className="overlay-icon-btn"
            aria-label="Open in viewer"
          >
            <OpenInFullIcon />
          </ToolbarIconButton>
          <ToolbarIconButton
            title="Download"
            size="small"
            onClick={handleDownload}
            disabled={!currentAsset || showingLive}
            className="overlay-icon-btn"
            aria-label="Download current output"
          >
            <DownloadIcon />
          </ToolbarIconButton>
        </div>
      </div>

      {/* bottom-left: dimensions / duration / Live */}
      {showInfoBadge && infoText ? (
        <div className="node-history-overlay overlay-bottom-left">
          <span style={{
            padding: "2px 6px",
            borderRadius: "var(--rounded-sm)",
            backgroundColor: "rgba(0, 0, 0, 0.55)"
          }}>
            {infoText}
          </span>
        </div>
      ) : null}

      {currentAsset && currentAsset.get_url && isMediaAsset(currentAsset) ? (
        <AssetViewer
          asset={currentAsset}
          sortedAssets={mediaAssets}
          contentType={currentAsset.content_type ?? undefined}
          url={currentAsset.get_url}
          open={viewerOpen}
          onClose={handleCloseViewer}
        />
      ) : null}
    </div>
  );
};

export const NodeHistoryViewer = memo(NodeHistoryViewerInternal);
NodeHistoryViewer.displayName = "NodeHistoryViewer";

export default NodeHistoryViewer;
