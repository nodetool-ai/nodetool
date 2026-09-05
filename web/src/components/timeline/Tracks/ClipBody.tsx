/** @jsxImportSource @emotion/react */
/**
 * ClipBody
 *
 * The rendered clip: selection ring, header strip, filmstrip / waveform /
 * image fill, animation markers, the two trim handles, lock and status badges.
 * Pure presentation — every handler comes in as a stable prop from `Clip`, so
 * the `memo` here holds across the parent's store-driven re-renders.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import LoopOutlinedIcon from "@mui/icons-material/LoopOutlined";

import type { TimelineClip, ClipStatus } from "@nodetool-ai/timeline";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import {
  StatusIndicator,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx,
  MagicGenerationFill,
  FONT_SIZE_MONO,
  MOTION,
  Z_INDEX
} from "../../ui_primitives";
import type { StatusType } from "../../ui_primitives";
import { useClipThumbnails } from "./useClipThumbnails";
import { useAudioPeaks } from "./useAudioPeaks";
import { samplePeaksWindow } from "./audioPeaks";
import { clipSurfaceTint, clipBorderTint } from "./trackVisuals";
import { GroupBracket } from "./GroupBracket";
import { deriveClipAnimationMarkers } from "./clipAnimationMarkers";
import { deriveClipFadeMarkers } from "./clipFadeGeometry";
import {
  beyondSourceFraction,
  clipSourceWindow,
  selectFilmstripCells
} from "./filmstripCells";
import { useAssetUrl } from "./useAssetUrl";
import { openPersistedFold } from "../Inspector/usePersistedFold";

const TRIM_HANDLE_WIDTH_PX = 8;
/** Hit area for the same grip under a finger; the visible width stays 8px. */
const TOUCH_TRIM_HANDLE_WIDTH_PX = 22;
/** Below this the two 8px grips would cover the whole clip and swallow the
 *  body drag, so they are removed and the clip moves by its body alone. */
const MIN_TRIM_HANDLE_CLIP_WIDTH_PX = 24;
export const MIN_CLIP_WIDTH_PX = 4;
const CLIP_RADIUS_PX = parseFloat(BORDER_RADIUS.md);
/** Width below which we suppress secondary chrome (duration label). */
const COMPACT_THRESHOLD_PX = 96;
/** Below this the transition wedge shows no type label. */
const TRANSITION_LABEL_MIN_PX = 48;
/** openreel uses ~60px per filmstrip cell; matches their visual density. */
const FILMSTRIP_CELL_PX = 60;
/** Media whose clip carries an audible or visible fade ramp. */
const FADE_MEDIA_TYPES: ReadonlySet<TimelineClip["mediaType"]> = new Set([
  "audio",
  "video",
  "image",
  "overlay"
]);

// Status mapping (PRD §5.5)
export const CLIP_STATUS_MAP = {
  draft: { status: "default", label: "Draft", pulse: false },
  queued: { status: "pending", label: "Queued", pulse: false },
  generating: { status: "pending", label: "Generating", pulse: true },
  generated: { status: "success", label: "Generated", pulse: false },
  stale: { status: "warning", label: "Stale", pulse: false },
  failed: { status: "error", label: "Failed", pulse: false },
  locked: { status: "info", label: "Locked", pulse: false },
  missing: { status: "error", label: "Missing", pulse: false }
} satisfies Record<ClipStatus, { status: StatusType; label: string; pulse: boolean }>;


const clipStyles = (
  theme: Theme,
  selected: boolean,
  interactionLocked: boolean,
  mediaType: TimelineClip["mediaType"]
) =>
  css({
    position: "absolute",
    top: 6,
    bottom: 6,
    borderRadius: CLIP_RADIUS_PX,
    overflow: "hidden",
    backgroundColor: theme.vars.palette.background.paper,
    backgroundImage: `linear-gradient(0deg, ${clipSurfaceTint(
      mediaType
    )}, ${clipSurfaceTint(mediaType)})`,
    border: selected
      ? `1.5px solid ${theme.vars.palette.secondary.main}`
      : `1px solid ${clipBorderTint(theme, mediaType)}`,
    boxShadow: selected
      ? `0 0 0 3px rgba(var(--palette-secondary-mainChannel) / 0.18), 0 4px 12px ${theme.vars.palette.c_scrim_soft}`
      : "none",
    cursor: interactionLocked ? "not-allowed" : "grab",
    "&:active": {
      cursor: interactionLocked ? "not-allowed" : "grabbing"
    },
    userSelect: "none",
    touchAction: "none",
    minWidth: MIN_CLIP_WIDTH_PX,
    boxSizing: "border-box",
    // The trim grips stay invisible until the pointer is over the clip; the
    // selected state and coarse pointers reveal them in `trimHandleStyles`.
    "&:hover [data-clip-trim-handle]": {
      opacity: 1
    }
  });

const clipHeaderRowStyles = css({
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  height: 18,
  display: "flex",
  alignItems: "center",
  gap: getSpacingPx(SPACING.sm),
  padding: `0 ${getSpacingPx(SPACING.md)}`,
  pointerEvents: "none",
  zIndex: Z_INDEX.base + 4
});

const clipDotStyles = (accent: string) =>
  css({
    width: 6,
    height: 6,
    borderRadius: BORDER_RADIUS.circle,
    backgroundColor: accent,
    boxShadow: `0 0 0 1px var(--palette-c_scrim)`,
    flexShrink: 0
  });

const clipNameStyles = (theme: Theme) =>
  css({
    fontSize: "var(--fontSizeSmaller)",
    fontWeight: 500,
    letterSpacing: "-0.005em",
    color: theme.vars.palette.text.primary,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    pointerEvents: "none",
    lineHeight: 1.4,
    textShadow: `0 1px 2px ${theme.vars.palette.c_scrim}`,
    flex: "1 1 auto",
    minWidth: 0
  });

const clipDurationStyles = (theme: Theme) =>
  css({
    flexShrink: 0,
    fontFamily:
      "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "var(--fontSizeSmaller)",
    fontWeight: 500,
    color: theme.vars.palette.text.secondary,
    letterSpacing: "0",
    textShadow: `0 1px 2px ${theme.vars.palette.c_scrim}`
  });

const filmstripStyles = css({
  position: "absolute",
  left: 6,
  right: 6,
  top: 20,
  bottom: 6,
  display: "flex",
  gap: getSpacingPx(SPACING.micro), // was 1px
  pointerEvents: "none",
  zIndex: 0,
  borderRadius: BORDER_RADIUS.xs,
  overflow: "hidden"
});

const waveformStyles = css({
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  zIndex: 0,
  display: "block",
  width: "100%",
  height: "100%"
});

// Generating overlay for clips that are queued or actively generating —
// the shared "magic" wash + shimmer reused from the sketch editor, so a
// generating clip in the timeline reads identically to a generating layer
// on the canvas. Clips to the clip's rounded body.
const generatingOverlayStyles = css({
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  zIndex: Z_INDEX.base + 3,
  overflow: "hidden",
  borderRadius: CLIP_RADIUS_PX
});

interface WaveformCanvasProps {
  url: string | undefined;
  inPointMs: number;
  outPointMs: number;
  widthPx: number;
}

/** Draws audio peaks on a canvas, sized to the clip's pixel width. */
const WaveformCanvas: React.FC<WaveformCanvasProps> = ({
  url,
  inPointMs,
  outPointMs,
  widthPx
}) => {
  const theme = useTheme();
  const { peaks, durationMs } = useAudioPeaks(url);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Coalesce redraws into a single animation frame. During a drag/resize the
  // clip's widthPx changes on every pointermove (~60×/s); without this each
  // change forced a synchronous canvas re-render. We also skip redraws when the
  // width hasn't moved by at least a pixel, so sub-pixel jitter is a no-op.
  const rafIdRef = useRef<number | null>(null);
  const lastDrawnWidthRef = useRef<number>(-1);
  const lastInputsKeyRef = useRef<string>("");

  // Latest draw inputs, read inside the scheduled frame so it never goes stale.
  const drawInputsRef = useRef({
    peaks,
    durationMs,
    inPointMs,
    outPointMs,
    widthPx,
    successColor: theme.vars.palette.success.main
  });
  drawInputsRef.current = {
    peaks,
    durationMs,
    inPointMs,
    outPointMs,
    widthPx,
    successColor: theme.vars.palette.success.main
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const {
      peaks: pk,
      durationMs: dur,
      inPointMs: inMs,
      outPointMs: outMs,
      widthPx: wPx,
      successColor
    } = drawInputsRef.current;

    const dpr =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const cssWidth = Math.max(1, Math.floor(wPx));
    const cssHeight = canvas.clientHeight || 32;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    if (!pk || !dur) return;

    // Visible audio window is the intersection of [inPointMs, outPointMs]
    // with the source [0, durationMs]. Anything beyond the source renders
    // as empty space rather than stretching the waveform.
    const visibleInMs = Math.max(0, Math.min(dur, inMs));
    const visibleOutMs = Math.max(visibleInMs, Math.min(dur, outMs));
    const clipSpanMs = Math.max(1, outMs - inMs);
    const visibleSpanMs = visibleOutMs - visibleInMs;
    const visibleWidthPx = cssWidth * (visibleSpanMs / clipSpanMs);

    const barCount = Math.max(1, Math.floor(visibleWidthPx / 2));
    const slice = samplePeaksWindow(
      pk,
      dur,
      visibleInMs,
      visibleOutMs,
      barCount
    );
    const mid = cssHeight / 2;
    ctx.fillStyle = successColor;
    for (let i = 0; i < slice.length; i += 1) {
      const amp = slice[i];
      const h = Math.max(1, amp * (cssHeight - 2));
      const x = (i / slice.length) * visibleWidthPx;
      const w = Math.max(1, visibleWidthPx / slice.length - 0.5);
      ctx.fillRect(x, mid - h / 2, w, h);
    }
  }, []);

  useEffect(() => {
    // Decide whether anything beyond a sub-pixel width change actually
    // happened. Width changes during a drag are gated to whole pixels (the
    // canvas can't show finer detail); other inputs force a redraw.
    const inputsKey = `${durationMs}|${inPointMs}|${outPointMs}|${url || ""}`;
    const otherInputsChanged = inputsKey !== lastInputsKeyRef.current;
    const widthChanged =
      Math.abs(Math.floor(widthPx) - lastDrawnWidthRef.current) >= 1;
    if (!otherInputsChanged && !widthChanged) return;

    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      lastDrawnWidthRef.current = Math.floor(widthPx);
      lastInputsKeyRef.current = inputsKey;
      draw();
    });
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [peaks, durationMs, inPointMs, outPointMs, widthPx, url, draw]);

  return <canvas ref={canvasRef} css={waveformStyles} aria-hidden />;
};
WaveformCanvas.displayName = "WaveformCanvas";

// Static (no per-URL variant): backgroundImage is set via inline `style`
// instead, so a distinct thumbnail data URL per cell doesn't make emotion
// hash a multi-KB string and insert a permanent CSSOM rule per render.
const filmstripCellStyles = css({
  flex: 1,
  height: "100%",
  backgroundSize: "cover",
  backgroundPosition: "center",
  opacity: 0.78
});

// The part of the clip that runs past the end of its source: no frame exists
// there, so the filmstrip shows stripes instead of repeating the last one.
const beyondSourceStyles = css({
  position: "absolute",
  top: 0,
  bottom: 0,
  right: 0,
  pointerEvents: "none",
  backgroundImage:
    "repeating-linear-gradient(135deg, var(--palette-c_overlay_strong) 0 3px, transparent 3px 8px)"
});

// Fade ramps: an SVG in unit space stretched over the fade's pixel span. The
// shaded triangle is the part of the signal the fade removes; the ramp line
// keeps a 1px stroke under the non-uniform scale.
const fadeOverlayStyles = css({
  position: "absolute",
  top: 0,
  bottom: 0,
  height: "100%",
  pointerEvents: "none",
  zIndex: Z_INDEX.base + 1,
  display: "block",
  overflow: "visible"
});

const transitionWedgeStyles = (theme: Theme, tint: string, accent: string) =>
  css({
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    pointerEvents: "none",
    zIndex: Z_INDEX.base + 1,
    boxSizing: "border-box",
    borderRight: `1px solid ${accent}`,
    backgroundImage: `repeating-linear-gradient(135deg, ${tint} 0 2px, transparent 2px 6px)`,
    "& > span": {
      position: "absolute",
      left: getSpacingPx(SPACING.sm),
      bottom: getSpacingPx(SPACING.xs),
      fontFamily:
        "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: FONT_SIZE_MONO.caption,
      fontWeight: 500,
      lineHeight: 1,
      color: theme.vars.palette.text.secondary,
      textShadow: `0 1px 2px ${theme.vars.palette.c_scrim}`,
      whiteSpace: "nowrap"
    }
  });

/** A hand-set keyframe, drawn as a diamond on the clip's bottom edge. */
const keyframeDiamondStyles = (theme: Theme) =>
  css({
    position: "absolute",
    bottom: 2,
    width: 7,
    height: 7,
    marginLeft: -3.5,
    transform: "rotate(45deg)",
    background: theme.vars.palette.primary.main,
    border: `1px solid ${theme.vars.palette.background.paper}`,
    cursor: "pointer",
    padding: 0,
    zIndex: Z_INDEX.base + 3
  });

/** The draggable right edge of the transition wedge. */
const transitionHandleStyles = css({
  position: "absolute",
  top: 0,
  bottom: 0,
  right: -3,
  width: TRIM_HANDLE_WIDTH_PX,
  cursor: "ew-resize",
  pointerEvents: "auto",
  zIndex: Z_INDEX.base + 3
});

/** Applied to both grips when the clip is too narrow to host them. */
const HIDDEN_TRIM_HANDLE_STYLE: React.CSSProperties = {
  display: "none",
  pointerEvents: "none"
};

const trimHandleStyles = (
  theme: Theme,
  edge: "start" | "end",
  interactionLocked: boolean,
  selected: boolean,
  editSelected: boolean
) =>
  css({
    position: "absolute",
    top: 0,
    bottom: 0,
    width: TRIM_HANDLE_WIDTH_PX,
    [edge === "start" ? "left" : "right"]: 0,
    cursor: interactionLocked ? "not-allowed" : "ew-resize",
    backgroundColor: editSelected
      ? theme.vars.palette.primary.main
      : "var(--palette-c_overlay_strong)",
    // Hidden until the clip is hovered (root selector), selected, picked as
    // the edit point, or under a finger, where there is no hover to reveal it.
    opacity: selected || editSelected ? 1 : 0,
    transition: `opacity ${MOTION.fast}, background-color ${MOTION.fast}`,
    "&:hover": {
      backgroundColor: interactionLocked
        ? undefined
        : `rgba(${theme.vars.palette.primary.mainChannel} / 0.5)`
    },
    zIndex: Z_INDEX.base + 2,
    // A fingertip covers far more than 8px. Widen the hit area on touch
    // without widening the visible grip, via a transparent inset overlay —
    // otherwise trimming a clip on a phone means repeatedly missing the
    // handle and dragging the clip instead.
    "@media (pointer: coarse)": {
      opacity: 1,
      "&::after": {
        content: '""',
        position: "absolute",
        top: 0,
        bottom: 0,
        [edge === "start" ? "left" : "right"]: 0,
        width: TOUCH_TRIM_HANDLE_WIDTH_PX
      }
    }
  });

const statusBadgeStyles = css({
  position: "absolute",
  bottom: 4,
  right: 6,
  zIndex: Z_INDEX.base + 3,
  pointerEvents: "none"
});

const lockIconStyles = css({
  position: "absolute",
  bottom: 4,
  left: 8,
  zIndex: Z_INDEX.base + 3,
  pointerEvents: "none",
  opacity: 0.85,
  fontSize: 12,
  display: "flex",
  alignItems: "center"
});

const animationZoneStyles = (theme: Theme, edge: "in" | "out") =>
  css({
    position: "absolute",
    top: 0,
    bottom: 0,
    padding: 0,
    border: 0,
    cursor: "pointer",
    zIndex: Z_INDEX.base + 1,
    backgroundColor:
      edge === "in"
        ? `rgba(${theme.vars.palette.primary.mainChannel} / 0.2)`
        : `rgba(${theme.vars.palette.secondary.mainChannel} / 0.2)`,
    clipPath:
      edge === "in"
        ? "polygon(0 0, 100% 0, 75% 100%, 0 100%)"
        : "polygon(0 0, 100% 0, 100% 100%, 25% 100%)"
  });

const animationLoopIconStyles = (theme: Theme) =>
  css({
    position: "absolute",
    left: "50%",
    bottom: 4,
    transform: "translateX(-50%)",
    color: theme.vars.palette.text.secondary,
    padding: 0,
    border: 0,
    background: "none",
    cursor: "pointer",
    zIndex: Z_INDEX.base + 2,
    display: "inline-flex",
    opacity: 0.85,
    "& svg": { fontSize: 12 }
  });

export interface ClipBodyProps {
  clip: TimelineClip;
  leftPx: number;
  widthPx: number;
  msPerPx: number;
  isSelected: boolean;
  derivedStatus: ClipStatus;
  statusInfo: (typeof CLIP_STATUS_MAP)[ClipStatus];
  handleDragPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  handleContextMenu: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleTrimStartPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleTrimStartPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleTrimEndPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleTrimEndPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleTrimPointerEnd: () => void;
  cutMode: boolean;
  /** The edge picked as the edit point (E, Ctrl+Shift+arrows), if this clip's. */
  selectedEdge: "start" | "end" | null;
  handleTransitionPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleTransitionPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleTransitionPointerEnd: () => void;
  /** Clip-relative times of hand-set keyframes, drawn as diamonds. */
  keyframeTimesMs: readonly number[];
  onKeyframeClick: (clipRelativeMs: number) => void;
  /** clip.locked OR the clip's track is locked: drives the not-allowed cursor.
   *  The lock badge below stays tied to clip.locked alone. */
  interactionLocked: boolean;
}

export const ClipBody: React.FC<ClipBodyProps> = memo(
  ({
    clip,
    leftPx,
    widthPx,
    msPerPx,
    isSelected,
    derivedStatus,
    statusInfo,
    handleDragPointerDown,
    handleClick,
    handleKeyDown,
    handleContextMenu,
    handleTrimStartPointerDown,
    handleTrimStartPointerMove,
    handleTrimEndPointerDown,
    handleTrimEndPointerMove,
    handleTrimPointerEnd,
    cutMode,
    selectedEdge,
    handleTransitionPointerDown,
    handleTransitionPointerMove,
    handleTransitionPointerEnd,
    keyframeTimesMs,
    onKeyframeClick,
    interactionLocked
  }) => {
    const theme = useTheme();
    const clipId = clip.id;

    // Only video clips need a URL for thumbnail extraction; image clips use a
    // single backgroundImage and audio clips a waveform.
    const videoUrl = useAssetUrl(
      clip.mediaType === "video" || clip.mediaType === "overlay"
        ? clip.currentAssetId
        : undefined
    );
    const imageUrl = useAssetUrl(
      clip.mediaType === "image" ? clip.currentAssetId : undefined
    );
    const audioUrl = useAssetUrl(
      clip.mediaType === "audio" ? clip.currentAssetId : undefined
    );

    const thumbnails = useClipThumbnails(videoUrl);
    const cellCount = Math.max(1, Math.floor(widthPx / FILMSTRIP_CELL_PX));
    const { inPointMs, outPointMs } = clipSourceWindow(clip);

    const filmstripCells = useMemo(() => {
      if (!thumbnails || thumbnails.length === 0) return null;
      return selectFilmstripCells(thumbnails, cellCount, inPointMs, outPointMs);
    }, [thumbnails, cellCount, inPointMs, outPointMs]);

    // Stripe the tail that runs past the source, once it is at least a cell
    // wide. The source length is estimated from the sample spacing, so a
    // sub-cell overflow is within that estimate's error and stays unmarked.
    const beyondSourceWidthPct = useMemo(() => {
      if (!thumbnails || thumbnails.length === 0) return 0;
      const fraction = beyondSourceFraction(thumbnails, inPointMs, outPointMs);
      return fraction * widthPx >= FILMSTRIP_CELL_PX ? fraction * 100 : 0;
    }, [thumbnails, inPointMs, outPointMs, widthPx]);

    const accent = (() => {
      switch (clip.mediaType) {
        case "audio":
          return theme.vars.palette.success.main;
        case "overlay":
        case "text":
        case "shape":
        case "group":
          return theme.vars.palette.secondary.main;
        case "image":
        case "video":
        default:
          return theme.vars.palette.info.main;
      }
    })();

    const showDuration = widthPx >= COMPACT_THRESHOLD_PX;
    const durationLabel = formatClipDuration(clip.durationMs);
    const animationMarkers = deriveClipAnimationMarkers(
      clip.animations,
      msPerPx,
      widthPx
    );
    const fadeMarkers = deriveClipFadeMarkers(clip, msPerPx, widthPx);
    const showFades = FADE_MEDIA_TYPES.has(clip.mediaType);
    const trimHandleStyle =
      widthPx < MIN_TRIM_HANDLE_CLIP_WIDTH_PX
        ? HIDDEN_TRIM_HANDLE_STYLE
        : undefined;
    const handleAnimationMarkerClick = (event: React.MouseEvent) => {
      event.stopPropagation();
      useTimelineUIStore.getState().selectClip(clipId);
      openPersistedFold("animate");
    };

    const positionStyle = useMemo(
      () => ({
        left: leftPx,
        width: widthPx,
        cursor: cutMode ? ("crosshair" as const) : undefined
      }),
      [leftPx, widthPx, cutMode]
    );

    const imageStyle = useMemo(
      () =>
        imageUrl
          ? {
              backgroundImage: `url(${imageUrl})`,
              backgroundSize: "cover" as const,
              backgroundPosition: "center" as const,
              opacity: 0.78
            }
          : undefined,
      [imageUrl]
    );

    // Drag, trim, zoom and pan each change leftPx/widthPx, re-rendering this
    // body once per frame per clip. None of the nine styles read geometry.
    const mediaType = clip.mediaType;
    const rootCss = useMemo(
      () => clipStyles(theme, isSelected, interactionLocked, mediaType),
      [theme, isSelected, interactionLocked, mediaType]
    );
    const inZoneCss = useMemo(
      () => animationZoneStyles(theme, "in"),
      [theme]
    );
    const outZoneCss = useMemo(
      () => animationZoneStyles(theme, "out"),
      [theme]
    );
    const loopIconCss = useMemo(
      () => animationLoopIconStyles(theme),
      [theme]
    );
    const dotCss = useMemo(() => clipDotStyles(accent), [accent]);
    const nameCss = useMemo(() => clipNameStyles(theme), [theme]);
    const durationCss = useMemo(() => clipDurationStyles(theme), [theme]);
    const keyframeDiamondCss = useMemo(
      () => keyframeDiamondStyles(theme),
      [theme]
    );
    const trimStartCss = useMemo(
      () =>
        trimHandleStyles(
          theme,
          "start",
          interactionLocked,
          isSelected,
          selectedEdge === "start"
        ),
      [theme, interactionLocked, isSelected, selectedEdge]
    );
    const trimEndCss = useMemo(
      () =>
        trimHandleStyles(
          theme,
          "end",
          interactionLocked,
          isSelected,
          selectedEdge === "end"
        ),
      [theme, interactionLocked, isSelected, selectedEdge]
    );
    const transitionCss = useMemo(
      () =>
        transitionWedgeStyles(
          theme,
          clipBorderTint(theme, mediaType),
          accent
        ),
      [theme, mediaType, accent]
    );
    const fadeColor = theme.vars.palette.text.primary;

    return (
      <div
        css={rootCss}
        style={positionStyle}
        onPointerDown={handleDragPointerDown}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
        data-testid={`clip-${clipId}`}
        aria-selected={isSelected}
        role="option"
        tabIndex={0}
        aria-label={clip.name || `Clip ${clip.id}`}
      >
        {filmstripCells && (
          <div css={filmstripStyles}>
            {filmstripCells.map((cell, i) => (
              <div
                key={i}
                css={filmstripCellStyles}
                style={{ backgroundImage: `url(${cell.url})` }}
              />
            ))}
            {beyondSourceWidthPct > 0 && (
              <div
                css={beyondSourceStyles}
                style={{ width: `${beyondSourceWidthPct}%` }}
                aria-hidden
                data-testid={`clip-beyond-source-${clipId}`}
              />
            )}
          </div>
        )}

        {showFades && fadeMarkers.fadeIn && (
          <svg
            css={fadeOverlayStyles}
            style={{ left: 0, width: fadeMarkers.fadeIn.widthPx }}
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            aria-hidden
            data-testid={`clip-fade-in-${clipId}`}
          >
            <polygon points="0,0 1,0 0,1" fill={fadeColor} fillOpacity="0.25" />
            <line
              x1="0"
              y1="1"
              x2="1"
              y2="0"
              stroke={fadeColor}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}

        {showFades && fadeMarkers.fadeOut && (
          <svg
            css={fadeOverlayStyles}
            style={{ right: 0, width: fadeMarkers.fadeOut.widthPx }}
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            aria-hidden
            data-testid={`clip-fade-out-${clipId}`}
          >
            <polygon points="0,0 1,0 1,1" fill={fadeColor} fillOpacity="0.25" />
            <line
              x1="0"
              y1="0"
              x2="1"
              y2="1"
              stroke={fadeColor}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}

        {fadeMarkers.transitionIn && (
          <div
            css={transitionCss}
            style={{ width: fadeMarkers.transitionIn.widthPx }}
            data-testid={`clip-transition-in-${clipId}`}
          >
            {fadeMarkers.transitionIn.widthPx >= TRANSITION_LABEL_MIN_PX && (
              <span aria-hidden>{fadeMarkers.transitionIn.type}</span>
            )}
            <div
              css={transitionHandleStyles}
              onPointerDown={handleTransitionPointerDown}
              onPointerMove={handleTransitionPointerMove}
              onPointerUp={handleTransitionPointerEnd}
              onPointerCancel={handleTransitionPointerEnd}
              aria-label="Transition length"
              data-testid={`clip-transition-handle-${clipId}`}
            />
          </div>
        )}

        {imageUrl && <div css={filmstripStyles} style={imageStyle} />}

        {keyframeTimesMs.map((t) => (
          <button
            key={t}
            type="button"
            css={keyframeDiamondCss}
            style={{ left: t / msPerPx }}
            aria-label={`Keyframe at ${formatClipDuration(t)}`}
            data-testid={`clip-keyframe-${clipId}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onKeyframeClick(t);
            }}
          />
        ))}

        {clip.mediaType === "group" && (
          <GroupBracket
            clipId={clipId}
            startMs={clip.startMs}
            durationMs={clip.durationMs}
            widthPx={widthPx}
          />
        )}

        {clip.mediaType === "audio" && (
          <WaveformCanvas
            url={audioUrl}
            inPointMs={clip.inPointMs ?? 0}
            outPointMs={(clip.inPointMs ?? 0) + clip.durationMs}
            widthPx={widthPx}
          />
        )}

        {animationMarkers.inZone && (
          <button
            type="button"
            css={inZoneCss}
            style={{
              left: animationMarkers.inZone.offsetPx,
              width: animationMarkers.inZone.widthPx
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={handleAnimationMarkerClick}
            aria-label="Open entrance animation controls"
          />
        )}

        {animationMarkers.outZone && (
          <button
            type="button"
            css={outZoneCss}
            style={{
              right: animationMarkers.outZone.offsetPx,
              width: animationMarkers.outZone.widthPx
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={handleAnimationMarkerClick}
            aria-label="Open exit animation controls"
          />
        )}

        {animationMarkers.hasLoopOrEmphasis && (
          <button
            type="button"
            css={loopIconCss}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={handleAnimationMarkerClick}
            aria-label="Open loop and emphasis animation controls"
          >
            <LoopOutlinedIcon />
          </button>
        )}

        {/* Header strip: type dot · name · duration */}
        <div css={clipHeaderRowStyles}>
          <span css={dotCss} aria-hidden />
          <span css={nameCss}>{clip.name}</span>
          {showDuration && (
            <span css={durationCss}>{durationLabel}</span>
          )}
        </div>

        <div
          css={trimStartCss}
          style={trimHandleStyle}
          data-clip-trim-handle
          onPointerDown={handleTrimStartPointerDown}
          onPointerMove={handleTrimStartPointerMove}
          onPointerUp={handleTrimPointerEnd}
          onPointerCancel={handleTrimPointerEnd}
          aria-label="Trim clip start"
          data-testid={`clip-trim-start-${clipId}`}
        />

        <div
          css={trimEndCss}
          style={trimHandleStyle}
          data-clip-trim-handle
          onPointerDown={handleTrimEndPointerDown}
          onPointerMove={handleTrimEndPointerMove}
          onPointerUp={handleTrimPointerEnd}
          onPointerCancel={handleTrimPointerEnd}
          aria-label="Trim clip end"
          data-testid={`clip-trim-end-${clipId}`}
        />

        {clip.locked && (
          <div css={lockIconStyles}>
            <LockOutlinedIcon sx={{ fontSize: 12 }} aria-label="Clip locked" />
          </div>
        )}

        {(derivedStatus === "queued" || derivedStatus === "generating") && (
          <div
            css={generatingOverlayStyles}
            aria-hidden
            data-testid={`clip-generating-${clipId}`}
          >
            <MagicGenerationFill />
          </div>
        )}

        {/* The badge surfaces lifecycle state for generated clips. Once a
         *  clip has settled into "generated" it doesn't need a permanent green
         *  dot, and imported clips have no lifecycle at all — so we render
         *  only while something interesting is happening. */}
        {clip.sourceType === "generated" &&
          derivedStatus !== "draft" &&
          derivedStatus !== "generated" && (
            <div css={statusBadgeStyles}>
              <StatusIndicator
                status={statusInfo.status}
                pulse={statusInfo.pulse}
                tooltip={statusInfo.label}
                size="small"
              />
            </div>
          )}

      </div>
    );
  }
);
ClipBody.displayName = "ClipBody";

/** "4.6s" for sub-minute, "1:23" for ≥1 min. Shown when clip width ≥ compact threshold. */
function formatClipDuration(durationMs: number): string {
  if (durationMs < 60_000) {
    const sec = durationMs / 1000;
    return sec < 10 ? `${sec.toFixed(1)}s` : `${Math.round(sec)}s`;
  }
  const totalSec = Math.round(durationMs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
