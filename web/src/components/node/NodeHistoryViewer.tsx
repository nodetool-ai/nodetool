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
import { useNodes } from "../../contexts/NodeContext";
import { useShallow } from "zustand/react/shallow";
import {
  CopyButton,
  Dialog,
  StatusIndicator,
  ToolbarIconButton,
  MOTION,
  BORDER_RADIUS,
  TYPOGRAPHY,
  Z_INDEX
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
      },
      // Keyboard focus (roving tabindex) — a token-based ring distinct from the
      // hover/selected/in-set treatments so the focused option is always visible.
      "&:focus-visible": {
        outline: `2px solid ${theme.vars.palette.primary.main}`,
        outlineOffset: -2
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
    // The focused generation: a prominent OUTSET glow ring (clearly stronger than
    // the 1px hover border) so the current selection is unmistakable at a glance.
    ".thumb.selected": {
      borderColor: theme.vars.palette.primary.main,
      boxShadow: `0 0 0 2px ${theme.vars.palette.primary.main}`,
      zIndex: Z_INDEX.raised
    },
    // Multi-select export membership: a distinct INSET ring (separate from the
    // focused .selected border) so a tile can be both the focused generation and
    // a member of the downstream set at once.
    ".thumb.in-set": {
      boxShadow: `inset 0 0 0 2px ${theme.vars.palette.secondary.main}`
    },
    // Both at once: stack the focused outset ring and the in-set membership ring
    // so neither cascade rule clobbers the other.
    ".thumb.selected.in-set": {
      boxShadow: `0 0 0 2px ${theme.vars.palette.primary.main}, inset 0 0 0 2px ${theme.vars.palette.secondary.main}`
    },
    // Pick-order badge: the 1-based position of a tile within the export set.
    ".pick-badge": {
      position: "absolute",
      top: 2,
      left: 2,
      minWidth: 16,
      height: 16,
      padding: "0 4px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: theme.vars.palette.secondary.main,
      color: theme.vars.palette.secondary.contrastText,
      fontSize: theme.fontSizeTiny,
      fontVariantNumeric: "tabular-nums",
      lineHeight: 1
    },
    ".downstream-caption": {
      position: "absolute",
      zIndex: 10,
      pointerEvents: "none",
      bottom: 6,
      right: 6,
      ...TYPOGRAPHY.sans.caption
    },
    ".downstream-caption .caption-pill": {
      display: "inline-block",
      padding: "2px 6px",
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: theme.vars.palette.secondary.main,
      color: theme.vars.palette.secondary.contrastText
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
  // `selectedIds` is the ordered multi-select export set fed downstream as a stream.
  const {
    generations,
    current,
    select,
    runs,
    currentRun,
    selectedIds,
    toggleSelected,
    setSelected
  } = useNodeGenerations(workflowId, nodeId);

  // Whether this node has ANY downstream consumer — only then do the multi-select
  // modifiers do anything. The selected set is fed downstream as a STREAM (a
  // synthetic ForEach replay yields the N values, iteration-correlated), which is
  // valid live behavior for any consumer, so no list-type gating: any outgoing
  // edge enables it.
  const hasDownstream = useNodes(
    useShallow((s) => s.edges.some((e) => e.source === nodeId))
  );

  // Pick-order lookup: generation id -> 1-based position in the export set.
  const pickOrder = useMemo(() => {
    const map = new Map<string, number>();
    selectedIds.forEach((id, i) => map.set(id, i + 1));
    return map;
  }, [selectedIds]);

  // The order the grid actually paints: tiles grouped by run (runs.flatMap),
  // which can DIVERGE from the flat chronological `generations` array (e.g. a
  // run with mixed persisted+live variants lands its live tail at the end of
  // `generations` but contiguous in its run section). Shift-range and roving
  // focus must walk THIS order so a swept range matches the visible tiles.
  const flatTiles = useMemo(() => runs.flatMap((r) => r.variants), [runs]);

  // Anchor index (into `flatTiles`, the render order) for shift-click range
  // selection; advanced by every plain/modifier click and keyboard activation.
  const anchorIndexRef = useRef<number>(-1);

  // Roving tabindex: exactly one tile is in the tab order at a time; arrows move
  // it over `flatTiles`. Falls back to the focused generation, then the first tile.
  const gridRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeGenId =
    activeId && flatTiles.some((g) => g.id === activeId)
      ? activeId
      : current?.id ?? flatTiles[0]?.id ?? null;

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
    // A genuinely new run appeared. Supersede any prior multi-select export set
    // so stale members from an earlier run aren't silently fed downstream — this
    // must fire even when focus does NOT advance (an unset selection already
    // resolves `currentRun` to the new latest run, so the focus check below is
    // skipped, yet the prior export set would otherwise persist).
    if (selectedIds.length > 0) {
      setSelected([]);
    }
    if (currentRun && latestRun && currentRun.jobId !== latestRun.jobId) {
      // Selection is stale (an older run); follow the new latest run. The ref is
      // already updated, so the resulting re-render (currentRun changes) re-runs
      // this effect with prev === latestRunJobId and no-ops — no loop.
      select(latestRun.cover.id);
    }
  }, [latestRunJobId, currentRun, latestRun, select, setSelected, selectedIds]);
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

  const assetById = useMemo(
    () => new Map(assetHistory.map((a) => [a.id, a])),
    [assetHistory]
  );
  // The fullscreen gallery navigates in the SAME order the history paints —
  // runs oldest→newest, variants oldest→newest within each run (`flatTiles`) —
  // so opening a tile into the viewer keeps the history's grouping and ordering
  // instead of reverting to `assetHistory`'s flat newest-first sort. Each tile
  // resolves to its persisted Asset via `assetById`; live-only or non-media
  // tiles drop out (the viewer only renders persisted media anyway).
  const mediaAssets = useMemo<Asset[]>(
    () =>
      flatTiles
        .map((gen) => (gen.assetId ? assetById.get(gen.assetId) : undefined))
        .filter((a): a is Asset => a !== undefined && isMediaAsset(a)),
    [flatTiles, assetById]
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

  // ReactFlow selects/deselects the enclosing node on pointer down. The grid is
  // an interactive control inside the node, so swallow pointer-down here: tile
  // clicks pick a generation without also toggling the node's selection.
  const stopNodeSelection = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
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

  // Move keyboard focus to the tile for `id` (roving tabindex). The tiles are
  // all mounted, so a DOM query inside the grid is enough; no element-ref map.
  const focusTile = useCallback((id: string | null) => {
    if (!id) return;
    const tiles = gridRef.current?.querySelectorAll<HTMLElement>(".thumb");
    tiles?.forEach((t) => {
      if (t.dataset.genId === id) t.focus();
    });
  }, []);

  // Every grid tile carries its generation id. Three click modes (the modifier
  // ones only when this node has a downstream consumer — otherwise a modifier
  // click degrades to a plain click):
  //   plain          → focus that generation + single view
  //   Cmd/Ctrl+click → toggle export-set membership, stay in grid
  //   Shift+click    → select the inclusive range [anchor..clicked] over the grid
  //                    RENDER order (`flatTiles`) as the export set, stay in grid
  // Every mode advances the range anchor + the roving-focus active tile.
  const handleGridClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const thumb = (e.target as HTMLElement).closest<HTMLElement>(".thumb");
      if (!thumb) return;
      const genId = thumb.dataset.genId;
      if (!genId) return;
      const clickedIndex = flatTiles.findIndex((g) => g.id === genId);
      setActiveId(genId);
      const modifier =
        hasDownstream && (e.metaKey || e.ctrlKey || e.shiftKey);
      if (!modifier) {
        select(genId);
        setView("single");
        anchorIndexRef.current = clickedIndex;
        return;
      }
      if (e.shiftKey) {
        const anchor =
          anchorIndexRef.current >= 0 ? anchorIndexRef.current : clickedIndex;
        const [lo, hi] =
          anchor <= clickedIndex ? [anchor, clickedIndex] : [clickedIndex, anchor];
        setSelected(flatTiles.slice(lo, hi + 1).map((g) => g.id));
      } else {
        toggleSelected(genId);
      }
      anchorIndexRef.current = clickedIndex;
    },
    [flatTiles, hasDownstream, select, setSelected, toggleSelected]
  );

  // Keyboard on a focused tile:
  //   Arrow/Home/End → roving focus over the grid render order (`flatTiles`)
  //   Space/Enter    → toggle export-set membership when a downstream consumer
  //                    exists; otherwise both keys mirror a plain click
  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const thumb = (e.target as HTMLElement).closest<HTMLElement>(".thumb");
      if (!thumb) return;
      const genId = thumb.dataset.genId;
      if (!genId) return;
      const index = flatTiles.findIndex((g) => g.id === genId);

      let nextIndex: number | null = null;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") nextIndex = index + 1;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") nextIndex = index - 1;
      else if (e.key === "Home") nextIndex = 0;
      else if (e.key === "End") nextIndex = flatTiles.length - 1;
      if (nextIndex !== null) {
        e.preventDefault();
        const clamped = Math.max(0, Math.min(flatTiles.length - 1, nextIndex));
        const nextId = flatTiles[clamped]?.id ?? null;
        setActiveId(nextId);
        focusTile(nextId);
        return;
      }

      if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
      e.preventDefault();
      setActiveId(genId);
      anchorIndexRef.current = index;
      if (hasDownstream) {
        toggleSelected(genId);
      } else {
        // No downstream consumer: both Enter and Space mirror a plain click.
        select(genId);
        setView("single");
      }
    },
    [flatTiles, hasDownstream, select, toggleSelected, focusTile]
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
    const pick = pickOrder.get(gen.id);
    // Export-set chrome (ring/badge/aria-selected) is shown ONLY when this node
    // has a downstream consumer — otherwise a stale `selected_generations` (e.g.
    // after the downstream edge was removed) would promise a stream feed the
    // runtime won't deliver. Kept in lockstep with the run paths, which prune the
    // source and inject the synthetic ForEach replay only when wired downstream.
    const inSet = hasDownstream && pick !== undefined;
    return (
      <div
        key={gen.id}
        className={`thumb${selected ? " selected" : ""}${
          inSet ? " in-set" : ""
        }`}
        role="option"
        tabIndex={gen.id === activeGenId ? 0 : -1}
        aria-selected={hasDownstream ? inSet : selected}
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
        {inSet ? <span className="pick-badge">{pick}</span> : null}
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
            ref={gridRef}
            className="grid nodrag nopan nowheel"
            role="listbox"
            aria-multiselectable={hasDownstream || undefined}
            aria-label="Generations"
            onPointerDown={stopNodeSelection}
            onClick={handleGridClick}
            onKeyDown={handleGridKeyDown}
          >
            {runs.map((run) => {
              const multi = run.variants.length > 1;
              const statusType = runStatusType(run.status);
              return (
                <section
                  key={run.jobId}
                  className="run-section"
                  role="group"
                  aria-label={relativeTime(new Date(run.createdAt))}
                >
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

      {/* bottom-right: the export-set size fed downstream as a stream. Always
          visible (single AND grid) so the set is never hidden behind a view.
          Gated on `hasDownstream` so the caption never promises a feed that the
          runtime won't actually deliver to a disconnected node. */}
      {hasDownstream && selectedIds.length >= 2 ? (
        <div className="downstream-caption">
          <span className="caption-pill">{`${selectedIds.length} → downstream`}</span>
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
