/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
import type { Generation, RunGroup } from "../../utils/nodeGenerations";
import type { Asset } from "../../stores/ApiTypes";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";
import {
  CopyButton,
  Dialog,
  StatusIndicator,
  ToolbarIconButton,
  MOTION,
  BORDER_RADIUS,
  TYPOGRAPHY
} from "../ui_primitives";
import type { StatusType } from "../ui_primitives";
import { relativeTime } from "../../utils/formatDateAndTime";
import { MediaOverlaySuppressProvider } from "./MediaOverlayContext";
import { TextRenderer } from "./output/TextRenderer";
import { extractTextValue } from "../../utils/extractTextValue";

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

/**
 * Two — and only two — views. `single` is one large preview with a linear pager
 * over the whole flat generation timeline; `grid` is the entire history laid out
 * as one scrollable grid, grouped into a section per run. The old third mode
 * (separate "runs" vs "variants" grids reached through a 3-way cyclic toggle) is
 * gone: runs are now visual sections inside the single grid.
 */
type View = "grid" | "single";

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

/** Map a run's aggregate status onto the StatusIndicator's vocabulary. Completed
 *  runs render no indicator (the common, quiet case). */
const runStatusType = (status: RunGroup["status"]): StatusType | null => {
  if (status === "running") return "info";
  if (status === "error") return "error";
  return null;
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
      borderRadius: BORDER_RADIUS.sm,
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
    // The grid is a vertical stack of run sections; each section grids its own
    // variants. One scroll container for the whole history.
    ".grid": {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      gap: 8,
      padding: 4,
      overflow: "auto",
      alignContent: "start"
    },
    ".run-section": {
      display: "flex",
      flexDirection: "column",
      gap: 4
    },
    ".run-header": {
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "0 2px",
      color: theme.vars.palette.text.secondary,
      ...TYPOGRAPHY.sans.caption
    },
    ".run-header .run-time": {
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    },
    ".run-header .run-count": {
      ...TYPOGRAPHY.mono.caption,
      color: theme.vars.palette.text.secondary
    },
    ".run-tiles": {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
      gap: 4
    },
    ".thumb": {
      position: "relative",
      aspectRatio: "1 / 1",
      backgroundColor: "rgba(0, 0, 0, 0.2)",
      borderRadius: BORDER_RADIUS.sm,
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
  // `runs` groups variants by job; `currentRun` is the selected variant's run.
  const { generations, current, select, runs, currentRun } = useNodeGenerations(
    workflowId,
    nodeId
  );

  const latestRun = runs.length > 0 ? runs[runs.length - 1] : undefined;
  const latestRunJobId = latestRun?.jobId ?? null;

  // Auto-focus a newly started run. The persisted `selected_generation` pins the
  // view to a run; after browsing it points at a PRIOR run, so a fresh run would
  // not take focus until manually switched. When the latest run's job changes (a
  // new run appeared) and the selection still resolves to an OLDER run, advance
  // focus to the latest run. Skips the initial render (preserves a restored
  // selection on reload) and never fires while a run grows in place (same jobId →
  // within-run pins and deliberate old-run browsing between runs both survive).
  const prevLatestRunJobIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const prev = prevLatestRunJobIdRef.current;
    prevLatestRunJobIdRef.current = latestRunJobId;
    if (prev === undefined) return; // initial render — keep any restored selection
    if (prev === latestRunJobId) return; // same latest run — no new run appeared
    if (currentRun && latestRun && currentRun.jobId !== latestRun.jobId) {
      // Selection is stale (an older run); follow the new latest run. The ref is
      // already updated, so the resulting re-render (currentRun changes) re-runs
      // this effect with prev === latestRunJobId and no-ops — no loop.
      select(latestRun.cover.id);
    }
  }, [latestRunJobId, currentRun, latestRun, select]);
  // Parallel read of the durable assets solely for the fullscreen viewer,
  // download, and the dimensions/duration badge — those need the full Asset.
  const { assetHistory } = useNodeResultHistory(workflowId, nodeId);
  const isRunning = useWebsocketRunner((s) => s.state === "running");

  // Single sticky view choice. Defaults to `single`; the user toggles it and it
  // stays put (no per-run override, no auto-default flipping) — except the one
  // deliberate auto-switch below (a finished batch opens the grid).
  const [view, setView] = useState<View>("single");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [imageDims, setImageDims] = useState<{ width: number; height: number } | null>(null);

  // Auto-open the grid the moment a batch (a run with >1 generation) FINISHES,
  // so all variants are visible at once. Fires once per jobId and skips the
  // initial mount (a reload must not yank a restored single selection into the
  // grid). A toggle back to single is respected — it won't re-fire for the same
  // run; the next batch fires again.
  const didMountRef = useRef(false);
  const autoGriddedJobIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (!latestRun || latestRun.status === "running") return;
    if (latestRun.variants.length <= 1) return;
    if (autoGriddedJobIdRef.current === latestRun.jobId) return;
    autoGriddedJobIdRef.current = latestRun.jobId;
    setView("grid");
  }, [latestRun]);

  const mediaAssets = useMemo<Asset[]>(
    () => assetHistory.filter(isMediaAsset),
    [assetHistory]
  );
  const assetById = useMemo(
    () => new Map(assetHistory.map((a) => [a.id, a])),
    [assetHistory]
  );

  const hasHistory = generations.length > 0;

  // Flat linear pager indices. The pager always steps the whole timeline in
  // chronological order, wrapping — one predictable behavior regardless of how
  // generations are grouped into runs.
  const currentIndex = Math.max(
    0,
    generations.findIndex((g) => g.id === current?.id)
  );
  // Run context for the single-view caption (which run, which position in it).
  const runIndex = Math.max(0, runs.findIndex((r) => r === currentRun));
  const withinRunIndex = currentRun
    ? currentRun.variants.findIndex((v) => v.id === current?.id)
    : -1;

  // While a run is in progress and the live result is non-null, show the live
  // in-flight preview (single) and freeze pagination. Once the run completes and
  // assets persist, the new generation becomes current and (for batches) the
  // grid auto-opens.
  const showingLive = isRunning && liveResult != null;
  const effectiveView: View = showingLive ? "single" : view;

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

  const step = useCallback(
    (delta: number) => {
      if (generations.length <= 1) return;
      const i =
        (currentIndex + delta + generations.length) % generations.length;
      select(generations[i].id);
    },
    [generations, currentIndex, select]
  );
  const handlePrev = useCallback(() => step(-1), [step]);
  const handleNext = useCallback(() => step(1), [step]);

  const handleToggleView = useCallback(() => {
    setView((v) => (v === "single" ? "grid" : "single"));
  }, []);

  // The fullscreen AssetViewer renders media; text generations open in a
  // readable text popup instead. Both are triggered from the same overlay
  // "open" control so the affordance lives in the generations navigator.
  const canOpenViewer =
    !!currentAsset && !showingLive && isMediaAsset(currentAsset);
  const currentText = useMemo(
    () => extractTextValue(valueToRender),
    [valueToRender]
  );
  const hasTextToOpen = !canOpenViewer && currentText.trim().length > 0;
  const canOpen = canOpenViewer || hasTextToOpen;
  const handleOpenViewer = useCallback(() => {
    if (!canOpenViewer && !hasTextToOpen) return;
    setViewerOpen(true);
  }, [canOpenViewer, hasTextToOpen]);

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

  // Every grid tile carries its generation id; clicking one selects that
  // generation (which also feeds it downstream) and drops to single view.
  const handleGridClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const thumb = (e.target as HTMLElement).closest<HTMLElement>(".thumb");
      if (!thumb) return;
      const genId = thumb.dataset.genId;
      if (!genId) return;
      select(genId);
      setView("single");
    },
    [select]
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

  const showPagination =
    effectiveView === "single" && !showingLive && generations.length > 1;
  const showInfoBadge = effectiveView === "single";

  // Bottom-left info string: run context (which run / position-in-run) folded
  // together with the dimensions / duration / "Live" detail, joined by "·".
  const runContext = (() => {
    if (!currentRun) return "";
    const meaningful = runs.length > 1 || currentRun.variants.length > 1;
    if (!meaningful) return "";
    const pos = withinRunIndex >= 0 ? withinRunIndex + 1 : 1;
    return `Run ${runIndex + 1} · ${pos}/${currentRun.variants.length}`;
  })();
  const detailText = (() => {
    if (showingLive) return "Live";
    if (!currentAsset) return "";
    if (currentAsset.content_type?.startsWith("image/")) {
      return imageDims ? `${imageDims.width}x${imageDims.height}` : "";
    }
    if (currentAsset.duration != null) {
      return formatDuration(currentAsset.duration);
    }
    return "";
  })();
  const infoText = [runContext, detailText].filter(Boolean).join(" · ");

  const renderThumb = (gen: Generation, label: string | null) => {
    const value = outputOf(gen) as { type?: string; uri?: string } | undefined;
    const asset = gen.assetId ? assetById.get(gen.assetId) : undefined;
    const kind = value?.type;
    const alt = asset?.name || gen.id;
    const imgUrl = asset?.thumb_url || asset?.get_url || value?.uri || "";
    const previewBitmap = isBitmapImage(value)
      ? (value.bitmap as ImageBitmap)
      : undefined;
    const videoThumb = asset?.thumb_url;
    const videoUrl = asset?.get_url || value?.uri || "";
    const selected = gen.id === current?.id;
    return (
      <div
        key={gen.id}
        className={`thumb${selected ? " selected" : ""}`}
        role="listitem"
        data-gen-id={gen.id}
      >
        {kind === "image" && imgUrl ? (
          <img src={imgUrl} alt={alt} />
        ) : kind === "image" && previewBitmap ? (
          <BitmapCanvas bitmap={previewBitmap} aria-label={alt} />
        ) : kind === "video" && (videoThumb || videoUrl) ? (
          videoThumb ? (
            <img src={videoThumb} alt={alt} />
          ) : (
            <video
              src={`${videoUrl}#t=0.1`}
              preload="metadata"
              muted
              playsInline
              aria-label={alt}
            />
          )
        ) : (
          <div style={fallbackThumbStyle}>{kind || "asset"}</div>
        )}
        {label ? <span className="thumb-label">{label}</span> : null}
      </div>
    );
  };

  return (
    <div css={cssStyles} className="node-history-viewer">
      <div className="body">
        {effectiveView === "single" ? (
          <MediaOverlaySuppressProvider value={overlayValue}>
            <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
              {renderSingle(valueToRender)}
            </div>
          </MediaOverlaySuppressProvider>
        ) : (
          // The full history as one grid, grouped into a section per run. Each
          // section headers the run (relative time · ×N · status) and grids its
          // variants; every tile is uniformly clickable → select + single view.
          <div
            className="grid nodrag nopan"
            role="list"
            aria-label="Generations"
            onClick={handleGridClick}
          >
            {runs.map((run) => {
              const multi = run.variants.length > 1;
              const statusType = runStatusType(run.status);
              return (
                <section key={run.jobId} className="run-section">
                  <header className="run-header">
                    <span className="run-time">
                      {relativeTime(new Date(run.createdAt))}
                    </span>
                    {multi ? (
                      <span className="run-count">{`×${run.variants.length}`}</span>
                    ) : null}
                    {statusType ? (
                      <StatusIndicator
                        status={statusType}
                        showIcon
                        pulse={run.status === "running"}
                        tooltip={run.status}
                      />
                    ) : null}
                  </header>
                  <div className="run-tiles">
                    {run.variants.map((gen, i) =>
                      renderThumb(gen, multi ? `${i + 1}` : null)
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* top-left overlay: view toggle + pagination */}
      <div className="node-history-overlay overlay-top-left">
        <div className="overlay-cluster">
          <ToolbarIconButton
            title={effectiveView === "single" ? "Show grid" : "Show single"}
            size="small"
            onClick={handleToggleView}
            className="overlay-icon-btn"
            aria-label="Toggle view"
          >
            {effectiveView === "single" ? <GridViewIcon /> : <CropSquareIcon />}
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
                {`${currentIndex + 1} / ${generations.length}`}
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
            title={hasTextToOpen ? "Open full text" : "Open in viewer"}
            size="small"
            onClick={handleOpenViewer}
            disabled={!canOpen}
            className="overlay-icon-btn"
            aria-label={hasTextToOpen ? "Open full text" : "Open in viewer"}
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

      {/* bottom-left: run context / dimensions / duration / Live */}
      {showInfoBadge && infoText ? (
        <div className="node-history-overlay overlay-bottom-left">
          <span style={{
            padding: "2px 6px",
            borderRadius: BORDER_RADIUS.sm,
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
      ) : hasTextToOpen ? (
        <Dialog
          open={viewerOpen}
          onClose={handleCloseViewer}
          title="Generated text"
          minWidth="min(720px, 90vw)"
          titleActions={<CopyButton value={currentText} tooltip="Copy text" />}
        >
          <div
            className="text-popup nowheel"
            style={{ maxHeight: "70vh", overflow: "auto" }}
          >
            <TextRenderer text={currentText} showActions={false} />
          </div>
        </Dialog>
      ) : null}
    </div>
  );
};

export const NodeHistoryViewer = memo(NodeHistoryViewerInternal);
NodeHistoryViewer.displayName = "NodeHistoryViewer";

export default NodeHistoryViewer;
