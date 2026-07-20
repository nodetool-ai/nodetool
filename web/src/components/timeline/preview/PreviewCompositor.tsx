/** @jsxImportSource @emotion/react */

import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useShallow } from "zustand/react/shallow";

import type {
  ClipShapeStyle,
  ClipTextStyle,
  TimelineClip,
  TrackEffect
} from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { useTimelineHistoryBatch } from "../../../stores/timeline/useTimelineHistoryBatch";
import { useAssetStore } from "../../../stores/AssetStore";
import { getAssetUrl } from "../../../utils/assetHelpers";
import {
  FONT_SIZE_SANS,
  FONT_WEIGHT,
  BORDER_RADIUS,
  Z_INDEX,
  MagicGenerationFill
} from "../../ui_primitives";

import { createCompositor } from "./gpu/createCompositor";
import type {
  CompositeLayer,
  CompositorBlendMode,
  TimelineCompositor
} from "./gpu/types";
import { TransformGizmoOverlay } from "./TransformGizmoOverlay";
import {
  clipSourceTimeSec,
  computeActiveLayers,
  computeActiveLayersWithHorizon,
  createAnimationCompileCache,
  effectiveAssetId,
  hasActiveAnimation,
  isClipActive,
  resolveAnimatedLayerProps,
  resolveTextStaggerContext,
  trackZ,
  PREVIEW_OVERLAY_Z,
  MAX_VIDEO_LAYERS
} from "./sceneModel";
import type { ActiveLayer, ResolvedCaption } from "./sceneModel";
import { CaptionRasterizer } from "./captionRender";
import { TextRasterizer } from "./textRender";
import { ShapeRasterizer } from "./shapeRender";

interface PlaceholderLayer {
  clipId: string;
  trackIndex: number;
  status: TimelineClip["status"];
  name: string;
}

const HOT_POOL_SIZE = MAX_VIDEO_LAYERS;
const COLD_POOL_SIZE = 4;
const TOTAL_POOL_SIZE = HOT_POOL_SIZE + COLD_POOL_SIZE;
/** Preload upcoming clips within this lookahead window (ms). */
const PRELOAD_LOOKAHEAD_MS = 30_000;
/** LRU cap on cached decoded <img> elements. Keeps memory bounded in long
 *  sessions that touch many unique image assets. */
const IMAGE_CACHE_MAX = 64;

const compositorStyles = css({
  position: "relative",
  width: "100%",
  height: "100%",
  backgroundColor: "#000",
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  justifyContent: "center"
});

/**
 * Holds the preview canvas at the sequence's fixed aspect ratio. The
 * fit-rect is computed in JS each resize and applied as inline width /
 * height; the parent flexbox letterboxes / pillarboxes whichever axis
 * runs short.
 */
const frameStyles = css({
  position: "relative"
});

const canvasStyles = css({
  width: "100%",
  height: "100%",
  display: "block"
});

const overlayBadgeStyles = (theme: Theme, color: string) =>
  css({
    position: "absolute",
    top: 4,
    left: 4,
    zIndex: PREVIEW_OVERLAY_Z.badge,
    fontSize: FONT_SIZE_SANS.caption,
    lineHeight: 1,
    padding: theme.spacing(0.5, 1.5),
    borderRadius: BORDER_RADIUS.xs,
    backgroundColor: color,
    color: "#fff",
    pointerEvents: "none",
    fontWeight: FONT_WEIGHT.semibold,
    letterSpacing: 0.5,
    textTransform: "uppercase"
  });

const placeholderLayerStyles = (theme: Theme) =>
  css({
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    gap: 4,
    color: theme.vars.palette.text.disabled,
    fontSize: FONT_SIZE_SANS.label,
    userSelect: "none",
    pointerEvents: "none"
  });

// The shared "magic" wash + shimmer, reused from the sketch editor, washed
// over the whole preview frame while a generating clip is live at the
// playhead — so the preview animates in lockstep with its track clip. Sits
// below the corner status badges (PREVIEW_OVERLAY_Z.badge).
const previewMagicOverlayStyles = css({
  position: "absolute",
  inset: 0,
  zIndex: PREVIEW_OVERLAY_Z.magicWash,
  overflow: "hidden",
  pointerEvents: "none"
});

interface ActiveVideoSlot {
  clipId: string;
  trackIndex: number;
  blendMode: CompositorBlendMode;
  opacity: number;
  assetUrl: string;
  transform?: TimelineClip["transform"];
  borderRadius?: number;
  effects?: TimelineClip["effects"];
  trackEffects?: TrackEffect[];
}

interface ActiveImageLayer {
  clipId: string;
  trackIndex: number;
  blendMode: CompositorBlendMode;
  opacity: number;
  assetUrl: string;
  status: TimelineClip["status"];
  transform?: TimelineClip["transform"];
  borderRadius?: number;
  effects?: TimelineClip["effects"];
  trackEffects?: TrackEffect[];
}

type AssetUrlEntry =
  | { status: "pending" }
  | { status: "resolved"; url: string }
  | { status: "failed" };

interface ActiveCaptionLayer {
  clipId: string;
  trackIndex: number;
  blendMode: CompositorBlendMode;
  opacity: number;
  transform?: TimelineClip["transform"];
  caption: ResolvedCaption;
}

interface ActiveTextLayer {
  clipId: string;
  trackIndex: number;
  blendMode: CompositorBlendMode;
  opacity: number;
  transform?: TimelineClip["transform"];
  borderRadius?: number;
  effects?: TimelineClip["effects"];
  trackEffects?: TrackEffect[];
  textStyle: ClipTextStyle;
}

interface ActiveShapeLayer extends Omit<ActiveTextLayer, "textStyle"> {
  shapeStyle: ClipShapeStyle;
}

function isClipUpcoming(clip: TimelineClip, currentTimeMs: number): boolean {
  return (
    clip.startMs > currentTimeMs &&
    clip.startMs <= currentTimeMs + PRELOAD_LOOKAHEAD_MS
  );
}

export const PreviewCompositor: React.FC = memo(() => {
  const theme = useTheme();

  // Reactive position — now updated only on discrete events (seek/scrub/
  // pause/stop), never per playback frame. Drives the scene at rest.
  const reactiveTimeMs = useTimelinePlaybackStore((s) => s.currentTimeMs);
  const isPlaying = useTimelinePlaybackStore((s) => s.isPlaying);
  const getTimeMs = useTimelinePlaybackStore((s) => s.getTimeMs);

  // The time the React scene (active-layer set, placeholders, gizmo, badges)
  // is computed at. While paused it tracks the reactive position. While
  // playing it is advanced from the transient playhead by the rAF loop below,
  // but only when the *set of active clips* actually changes — so crossing a
  // clip boundary re-binds the pool, yet steady frames within a clip do NOT
  // re-render React.
  const [sceneTimeMs, setSceneTimeMs] = useState(reactiveTimeMs);
  const currentTimeMs = sceneTimeMs;

  const { tracks, clips, sequenceWidth, sequenceHeight } = useTimelineStore(
    useShallow((s) => ({
      tracks: s.tracks,
      clips: s.clips,
      sequenceWidth: s.width,
      sequenceHeight: s.height
    }))
  );

  const patchClip = useTimelineStore((s) => s.patchClip);
  const selectedClipId = useTimelineUIStore((s) =>
    s.selectedClipIds.size === 1 ? [...s.selectedClipIds][0] : null
  );

  // Collapses a whole gizmo drag (60-240 Hz `onChange`) into a single undo
  // entry instead of one per pointermove — see `onDragStart`/`onDragEnd` below.
  const gizmoHistory = useTimelineHistoryBatch();

  const assetUrlCache = useRef<Map<string, AssetUrlEntry>>(new Map());
  const [urlCacheVersion, setUrlCacheVersion] = useState(0);
  const getAsset = useAssetStore((s) => s.get);

  const resolveUrl = useCallback(
    (assetId: string | undefined): string | undefined => {
      if (!assetId) {
        return undefined;
      }
      const cached = assetUrlCache.current.get(assetId);
      if (cached) {
        // pending → fetch already in flight; failed → don't retry every tick
        // (the cache ref survives until remount, when a fresh attempt is made).
        return cached.status === "resolved" ? cached.url : undefined;
      }
      assetUrlCache.current.set(assetId, { status: "pending" });
      getAsset(assetId)
        .then((asset) => {
          const url = getAssetUrl(asset);
          if (url) {
            assetUrlCache.current.set(assetId, { status: "resolved", url });
            setUrlCacheVersion((v) => v + 1);
          } else {
            assetUrlCache.current.set(assetId, { status: "failed" });
          }
        })
        .catch(() => {
          // Asset unavailable — mark failed so the placeholder renders
          // without re-issuing the fetch on every render tick.
          assetUrlCache.current.set(assetId, { status: "failed" });
        });
      return undefined;
    },
    [getAsset]
  );

  // Hidden HTMLVideoElement pool — still browser-decoded, but never rendered.
  // Their pixels are uploaded each frame to GPU textures by the compositor.
  const videoRefs = useRef<HTMLVideoElement[]>([]);
  /** Stable clipId → hot-slot index binding. Survives neighbor-clip churn
   *  during transition overlaps so an active clip keeps its HTMLVideoElement
   *  (no reload + seek glitch when the previous clip ends). */
  const clipSlotMap = useRef<Map<string, number>>(new Map());
  const [poolReady, setPoolReady] = useState(false);
  const poolContainerRef = useRef<HTMLDivElement>(null);

  // Image element cache, keyed by URL — fed to the compositor as image layers.
  // Capped LRU (insertion order = recency) to bound memory in long sessions.
  const imageElementCache = useRef<Map<string, HTMLImageElement>>(new Map());

  // Pending video-element seek closures, keyed by the element. Stored on a
  // ref so the once-attached `loadedmetadata` listener always runs the most
  // recent target rather than a stale snapshot.
  const pendingSeeks = useRef<Map<HTMLVideoElement, () => void>>(new Map());

  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compositorRef = useRef<TimelineCompositor | null>(null);
  const captionRasterizerRef = useRef<CaptionRasterizer>(
    new CaptionRasterizer()
  );
  const textRasterizerRef = useRef<TextRasterizer>(new TextRasterizer());
  const shapeRasterizerRef = useRef<ShapeRasterizer>(new ShapeRasterizer());
  const [gpuReady, setGpuReady] = useState(false);
  const [gpuFailed, setGpuFailed] = useState(false);

  // Frame element CSS size, mirrored into state so the transform gizmo
  // overlay can map clip space → screen pixels.
  const [frameSize, setFrameSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const container = poolContainerRef.current;
    if (!container) {
      return;
    }
    const pool: HTMLVideoElement[] = [];
    for (let i = 0; i < TOTAL_POOL_SIZE; i++) {
      const el = document.createElement("video");
      el.preload = "auto";
      el.playsInline = true;
      el.muted = true; // muted for autoplay policy; audio is via AudioGraph
      el.crossOrigin = "anonymous";
      // Off-screen pixel sink: present in DOM so the browser keeps decoding,
      // but invisible (1x1, opacity 0). Kept inside the offscreen container.
      el.style.cssText =
        "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;";
      pool.push(el);
      container.appendChild(el);
    }
    videoRefs.current = pool;
    setPoolReady(true);

    const pendingSeeksMap = pendingSeeks.current;
    return () => {
      for (const el of pool) {
        el.pause();
        // Plain `el.src = ""` resolves to the document URL and can fire a
        // spurious request; this is what actually clears the media element.
        el.removeAttribute("src");
        el.load();
        if (container.contains(el)) {
          container.removeChild(el);
        }
      }
      videoRefs.current = [];
      pendingSeeksMap.clear();
      setPoolReady(false);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    createCompositor(canvas)
      .then(({ compositor, init }) => {
        if (cancelled) {
          compositor.dispose();
          return;
        }
        if (init.ok) {
          compositorRef.current = compositor;
          setGpuReady(true);
        } else {
          setGpuFailed(true);
          compositor.dispose();
        }
      })
      .catch(() => {
        if (!cancelled) setGpuFailed(true);
      });

    const rasterizer = captionRasterizerRef.current;
    const textRasterizer = textRasterizerRef.current;
    const shapeRasterizer = shapeRasterizerRef.current;
    return () => {
      cancelled = true;
      compositorRef.current?.dispose();
      compositorRef.current = null;
      rasterizer.dispose();
      textRasterizer.dispose();
      shapeRasterizer.dispose();
      setGpuReady(false);
    };
  }, []);

  // Compute a fit-rect that preserves the sequence aspect inside the
  // outer container. Drives both the frame element's CSS pixel dimensions
  // (so the canvas + overlays sit on a fixed-aspect surface) and the
  // canvas backing buffer (devicePixelRatio aware).
  useLayoutEffect(() => {
    const container = containerRef.current;
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (!container || !frame || !canvas) return;
    const apply = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const aspect =
        sequenceWidth > 0 && sequenceHeight > 0
          ? sequenceWidth / sequenceHeight
          : 16 / 9;
      const fitByWidth = { w: rect.width, h: rect.width / aspect };
      const fit =
        fitByWidth.h <= rect.height
          ? fitByWidth
          : { w: rect.height * aspect, h: rect.height };
      frame.style.width = `${fit.w}px`;
      frame.style.height = `${fit.h}px`;
      setFrameSize((prev) =>
        prev.w === fit.w && prev.h === fit.h ? prev : { w: fit.w, h: fit.h }
      );

      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.floor(fit.w * dpr));
      const h = Math.max(1, Math.floor(fit.h * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        compositorRef.current?.resize(w, h);
      }
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(container);
    return () => ro.disconnect();
  }, [sequenceWidth, sequenceHeight]);

  // transform.position is stored in sequence pixels; tell the compositor the
  // sequence resolution so placement doesn't depend on viewport size / DPR.
  useEffect(() => {
    if (!gpuReady) return;
    compositorRef.current?.setReferenceSize(sequenceWidth, sequenceHeight);
  }, [gpuReady, sequenceWidth, sequenceHeight]);

  // While paused (and on every discrete seek/scrub/stop) follow the reactive
  // position exactly so scrubbing repaints the right frame.
  useEffect(() => {
    if (isPlaying) return;
    setSceneTimeMs(reactiveTimeMs);
  }, [reactiveTimeMs, isPlaying]);

  const clipById = useMemo(() => new Map(clips.map((c) => [c.id, c])), [clips]);

  // Memoized preset→curve compilation for motion-design animations, so the
  // rAF loop only samples (never compiles). Invalidated internally when a
  // clip's animations / duration / canvas size change.
  const animCacheRef = useRef(createAnimationCompileCache());
  // Latest sequence resolution, read by the rAF loop (whose closure only
  // rebinds on [gpuReady, isPlaying]) to resolve animation offsets in px.
  const canvasSizeRef = useRef({
    width: sequenceWidth,
    height: sequenceHeight
  });
  canvasSizeRef.current = { width: sequenceWidth, height: sequenceHeight };
  // Active layers from the last scene computation, valid until the next
  // clip/word boundary — used per tick to test for in-flight animation.
  const lastLayersRef = useRef<ActiveLayer[]>([]);
  // Latest React scene time, read by the paused one-shot render path.
  const currentTimeMsRef = useRef(currentTimeMs);
  currentTimeMsRef.current = currentTimeMs;

  // Signature of the visible scene at a given time: the ordered active layer
  // ids plus, for captions, which word is currently spoken (so a highlight
  // change inside one clip still bumps the scene during playback). Used to
  // decide when the rAF loop must re-render React / re-composite. Also
  // returns the change horizon so the loop can skip recomputing this while
  // the query time stays inside the current clip/word boundaries.
  const sceneSignature = useCallback(
    (
      timeMs: number
    ): { signature: string; nextChangeMs: number; layers: ActiveLayer[] } => {
      const { layers, nextChangeMs } = computeActiveLayersWithHorizon(
        tracks,
        clips,
        timeMs,
        { maxVideoLayers: HOT_POOL_SIZE }
      );
      let sig = "";
      for (const l of layers) {
        sig += `${l.kind}:${l.clipId}`;
        if (l.kind === "caption" && l.caption) {
          sig += `#${l.caption.words.findIndex((w) => w.active)}`;
        }
        sig += "|";
      }
      return { signature: sig, nextChangeMs, layers };
    },
    [tracks, clips]
  );

  const {
    activeVideoSlots,
    activeImageLayers,
    activeCaptionLayers,
    activeTextLayers,
    activeShapeLayers,
    placeholderLayers
  } = useMemo(() => {
    const videoSlots: ActiveVideoSlot[] = [];
    const imageLayers: ActiveImageLayer[] = [];
    const captionLayers: ActiveCaptionLayer[] = [];
    const textLayers: ActiveTextLayer[] = [];
    const shapeLayers: ActiveShapeLayer[] = [];
    const placeholders: PlaceholderLayer[] = [];

    // Same scene description the offline renderer consumes — so the preview
    // and the exported video composite identical frames.
    const layers = computeActiveLayers(tracks, clips, currentTimeMs, {
      maxVideoLayers: HOT_POOL_SIZE
    });

    for (const layer of layers) {
      if (layer.kind === "caption" && layer.caption) {
        captionLayers.push({
          clipId: layer.clipId,
          trackIndex: layer.trackIndex,
          blendMode: layer.blendMode,
          opacity: layer.opacity,
          transform: layer.transform,
          caption: layer.caption
        });
        continue;
      }

      if (layer.kind === "text" && layer.textStyle) {
        textLayers.push({
          clipId: layer.clipId,
          trackIndex: layer.trackIndex,
          blendMode: layer.blendMode,
          opacity: layer.opacity,
          transform: layer.transform,
          borderRadius: layer.borderRadius,
          effects: layer.effects,
          trackEffects: layer.trackEffects,
          textStyle: layer.textStyle
        });
        continue;
      }

      if (layer.kind === "shape" && layer.shapeStyle) {
        shapeLayers.push({
          clipId: layer.clipId,
          trackIndex: layer.trackIndex,
          blendMode: layer.blendMode,
          opacity: layer.opacity,
          transform: layer.transform,
          borderRadius: layer.borderRadius,
          effects: layer.effects,
          trackEffects: layer.trackEffects,
          shapeStyle: layer.shapeStyle
        });
        continue;
      }

      const url = resolveUrl(layer.assetId);
      const placeholder: PlaceholderLayer = {
        clipId: layer.clipId,
        trackIndex: layer.trackIndex,
        status: layer.clip.status,
        name: layer.clip.name
      };

      if (layer.kind === "image") {
        imageLayers.push({
          clipId: layer.clipId,
          trackIndex: layer.trackIndex,
          blendMode: layer.blendMode,
          opacity: layer.opacity,
          assetUrl: url ?? "",
          status: layer.clip.status,
          transform: layer.transform,
          borderRadius: layer.borderRadius,
          effects: layer.effects,
          trackEffects: layer.trackEffects
        });
        if (!url) placeholders.push(placeholder);
      } else if (url) {
        videoSlots.push({
          clipId: layer.clipId,
          trackIndex: layer.trackIndex,
          blendMode: layer.blendMode,
          opacity: layer.opacity,
          assetUrl: url,
          transform: layer.transform,
          borderRadius: layer.borderRadius,
          effects: layer.effects,
          trackEffects: layer.trackEffects
        });
      } else {
        placeholders.push(placeholder);
      }
    }

    return {
      activeVideoSlots: videoSlots,
      activeImageLayers: imageLayers,
      activeCaptionLayers: captionLayers,
      activeTextLayers: textLayers,
      activeShapeLayers: shapeLayers,
      placeholderLayers: placeholders
    };
  }, [tracks, clips, currentTimeMs, resolveUrl, urlCacheVersion]);

  // Source dims + transform for the single selected clip, but only while it is
  // actually rendered (active at the playhead) so the gizmo traces a visible
  // box. Dimensions come from the already-decoded media elements.
  const selectedGizmo = useMemo(() => {
    if (!selectedClipId) return null;
    const clip = clipById.get(selectedClipId);
    if (!clip) return null;

    let w = 0;
    let h = 0;
    const vSlot = activeVideoSlots.find((s) => s.clipId === selectedClipId);
    const iLayer = activeImageLayers.find((l) => l.clipId === selectedClipId);
    if (vSlot) {
      const idx = clipSlotMap.current.get(selectedClipId);
      const el = idx !== undefined ? videoRefs.current[idx] : undefined;
      w = el?.videoWidth ?? 0;
      h = el?.videoHeight ?? 0;
    } else if (iLayer?.assetUrl) {
      const img = imageElementCache.current.get(iLayer.assetUrl);
      w = img?.naturalWidth ?? 0;
      h = img?.naturalHeight ?? 0;
    } else {
      return null;
    }
    if (w <= 0 || h <= 0) return null;
    return {
      clipId: selectedClipId,
      transform: clip.transform,
      sourceWidth: w,
      sourceHeight: h
    };
  }, [
    selectedClipId,
    clipById,
    activeVideoSlots,
    activeImageLayers,
    urlCacheVersion
  ]);

  // The pool effect below is keyed on `currentTimeMs` (React state), which
  // only advances on scene bumps — so during one long clip, an upcoming
  // clip's cold-pool preload would never fire before its boundary. This
  // ticks a counter every 2s while playing purely to re-run that effect;
  // every write inside it is already same-value-guarded (see the
  // `data-asset` checks), so the extra evaluations are cheap no-ops for
  // slots that are already correctly bound.
  const [preloadTick, setPreloadTick] = useState(0);
  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => setPreloadTick((t) => t + 1), 2000);
    return () => window.clearInterval(id);
  }, [isPlaying]);

  // Drive the HTMLVideoElement pool (src/seek/play state). Same logic as
  // before, just without setting display/zIndex/blendMode — those are owned
  // by the GPU compositor now.
  useLayoutEffect(() => {
    if (!poolReady) return;
    const pool = videoRefs.current;

    // Stable clipId→hot-slot binding. Reuse existing assignments first,
    // then fill empty slots for newly-active clips. Slots whose clip is no
    // longer active become free for reuse.
    const activeIds = new Set(activeVideoSlots.map((s) => s.clipId));
    for (const [id] of clipSlotMap.current) {
      if (!activeIds.has(id)) clipSlotMap.current.delete(id);
    }
    const usedSlots = new Set(clipSlotMap.current.values());
    for (const slot of activeVideoSlots) {
      if (clipSlotMap.current.has(slot.clipId)) continue;
      for (let i = 0; i < HOT_POOL_SIZE; i++) {
        if (!usedSlots.has(i)) {
          clipSlotMap.current.set(slot.clipId, i);
          usedSlots.add(i);
          break;
        }
      }
    }

    activeVideoSlots.forEach((slot) => {
      const slotIndex = clipSlotMap.current.get(slot.clipId);
      if (slotIndex === undefined || slotIndex >= pool.length) return;
      const el = pool[slotIndex];

      if (el.getAttribute("data-asset") !== slot.assetUrl) {
        el.src = slot.assetUrl;
        el.setAttribute("data-asset", slot.assetUrl);
        el.load();
      }

      const clip = clipById.get(slot.clipId);
      // If the speed change has been baked into the asset, the asset already
      // plays at the right rate; otherwise the source media is at original
      // speed and 1 timeline second consumes `rate` source seconds.
      const rate = clip?.speedBaked
        ? 1
        : Math.max(0.0001, clip?.speedMultiplier ?? 1);

      // Setting currentTime before HAVE_METADATA is silently clamped to 0 and
      // a subsequent play() can reject with AbortError. Defer until the
      // element reports metadata; on next render the slot's pending closure
      // (kept in pendingSeeks) re-runs with fresh state.
      const applySeek = () => {
        if (el.readyState < 1) return;
        // While playing, `currentTimeMs` (sceneTimeMs) is frozen between
        // scene bumps — the 2s preload-tick re-run of this effect would
        // otherwise seek the element BACKWARD to that stale position once
        // the video's own clock has drifted past the 0.15s threshold.
        // Read the live transient playhead instead, and do it here (at
        // call time, not effect-run time) so the loadedmetadata-deferred
        // path also gets a fresh value rather than a stale closure.
        const targetSec = clip
          ? clipSourceTimeSec(clip, isPlaying ? getTimeMs() : currentTimeMs)
          : 0;
        if (!isPlaying) {
          if (Math.abs(el.currentTime - targetSec) > 0.04) {
            el.currentTime = targetSec;
          }
        } else {
          if (Math.abs(el.currentTime - targetSec) > 0.15) {
            el.currentTime = targetSec;
          }
        }
        el.playbackRate = rate;

        if (isPlaying && el.paused) {
          void el.play().catch(() => {
            // Autoplay blocked; continue scrubbing via currentTime.
          });
        } else if (!isPlaying && !el.paused) {
          el.pause();
        }
      };

      if (el.readyState >= 1) {
        applySeek();
      } else {
        // Always stash the latest closure so the listener runs with the most
        // recent target. Only attach the listener once; mark the element so
        // re-runs of this effect don't pile up handlers.
        pendingSeeks.current.set(el, applySeek);
        if (el.getAttribute("data-seek-pending") !== "1") {
          el.setAttribute("data-seek-pending", "1");
          el.addEventListener(
            "loadedmetadata",
            () => {
              el.removeAttribute("data-seek-pending");
              const fn = pendingSeeks.current.get(el);
              if (fn) {
                pendingSeeks.current.delete(el);
                fn();
              }
            },
            { once: true }
          );
        }
      }
    });

    // Pause unused hot-pool slots so their decoders go idle.
    for (let i = 0; i < HOT_POOL_SIZE; i++) {
      if (usedSlots.has(i)) continue;
      const el = pool[i];
      if (el && !el.paused) el.pause();
    }

    // Preload upcoming clips into cold pool slots. Sorted soonest-first so
    // that with more than COLD_POOL_SIZE upcoming clips, the ones closest to
    // the playhead win the slots (array order is otherwise arbitrary).
    const upcomingVideoClips = clips
      .filter(
        (c) =>
          (c.mediaType === "video" || c.mediaType === "overlay") &&
          isClipUpcoming(c, currentTimeMs)
      )
      .sort((a, b) => a.startMs - b.startMs)
      .slice(0, COLD_POOL_SIZE);

    upcomingVideoClips.forEach((clip, i) => {
      const slotIndex = HOT_POOL_SIZE + i;
      if (slotIndex >= pool.length) return;
      const el = pool[slotIndex];
      const assetId = effectiveAssetId(clip);
      const url = resolveUrl(assetId);
      if (url && el.getAttribute("data-asset") !== url) {
        el.src = url;
        el.setAttribute("data-asset", url);
        void el.load();
      }
    });
  }, [
    poolReady,
    activeVideoSlots,
    currentTimeMs,
    isPlaying,
    getTimeMs,
    clips,
    clipById,
    resolveUrl,
    // Not read directly — bumped every 2s during playback purely to
    // re-evaluate cold-pool preloads mid-clip (see the effect above).
    preloadTick
  ]);

  // Resolve / preload image elements for image layers.
  const ensureImageElement = useCallback(
    (url: string): HTMLImageElement | null => {
      if (!url) return null;
      const cache = imageElementCache.current;
      const cached = cache.get(url);
      if (cached) {
        // LRU touch (delete+reinsert) is only needed when eviction is
        // imminent. While the cache has spare capacity nothing is ever
        // evicted, so skip the churn on this per-layer, per-frame hot path.
        if (cache.size >= IMAGE_CACHE_MAX) {
          cache.delete(url);
          cache.set(url, cached);
        }
        return cached.complete && cached.naturalWidth > 0 ? cached : null;
      }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.onload = () => {
        // Trigger a re-render on first decode so the compositor picks it up.
        setUrlCacheVersion((v) => v + 1);
      };
      img.src = url;
      imageElementCache.current.set(url, img);
      // Evict least-recently-used entries until under the cap.
      while (imageElementCache.current.size > IMAGE_CACHE_MAX) {
        const oldestKey = imageElementCache.current.keys().next().value;
        if (oldestKey === undefined || oldestKey === url) break;
        imageElementCache.current.delete(oldestKey);
      }
      return null;
    },
    []
  );

  // Build the GPU layer list from active slots and image layers, resolving
  // each layer's motion-design animation at `atMs` (the frame being drawn).
  const buildLayers = useCallback(
    (atMs: number): CompositeLayer[] => {
      const out: CompositeLayer[] = [];
      const pool = videoRefs.current;
      const canvas = { width: sequenceWidth, height: sequenceHeight };
      const cache = animCacheRef.current;

      activeVideoSlots.forEach((slot) => {
        const slotIndex = clipSlotMap.current.get(slot.clipId);
        if (slotIndex === undefined) return;
        const el = pool[slotIndex];
        // Keep the layer in the list even if the video momentarily drops below
        // HAVE_CURRENT_DATA (e.g. during a scrub seek). The compositor reuses
        // the previously uploaded texture so we don't flash to black.
        if (!el || el.videoWidth === 0) return;
        const clip = clipById.get(slot.clipId);
        const anim = clip
          ? resolveAnimatedLayerProps(
              { clip, transform: slot.transform, opacity: slot.opacity },
              atMs,
              canvas,
              cache
            )
          : { transform: slot.transform, opacity: slot.opacity, mask: undefined };
        out.push({
          id: `v:${slot.clipId}`,
          source: el,
          opacity: anim.opacity,
          blendMode: slot.blendMode,
          zIndex: trackZ(slot.trackIndex),
          transform: anim.transform,
          mask: anim.mask,
          borderRadius: slot.borderRadius,
          effects: anim.effects ?? slot.effects,
          trackEffects: slot.trackEffects
        });
      });

      for (const layer of activeImageLayers) {
        if (!layer.assetUrl) continue;
        const img = ensureImageElement(layer.assetUrl);
        if (!img) continue;
        const clip = clipById.get(layer.clipId);
        const anim = clip
          ? resolveAnimatedLayerProps(
              { clip, transform: layer.transform, opacity: layer.opacity },
              atMs,
              canvas,
              cache
            )
          : { transform: layer.transform, opacity: layer.opacity, mask: undefined };
        out.push({
          id: `i:${layer.clipId}`,
          source: img,
          opacity: anim.opacity,
          blendMode: layer.blendMode,
          zIndex: trackZ(layer.trackIndex),
          transform: anim.transform,
          mask: anim.mask,
          borderRadius: layer.borderRadius,
          effects: anim.effects ?? layer.effects,
          trackEffects: layer.trackEffects
        });
      }

      for (const layer of activeCaptionLayers) {
        const bitmap = captionRasterizerRef.current.rasterize(
          layer.caption,
          sequenceWidth,
          sequenceHeight
        );
        if (!bitmap) continue;
        const clip = clipById.get(layer.clipId);
        const anim = clip
          ? resolveAnimatedLayerProps(
              { clip, transform: layer.transform, opacity: layer.opacity },
              atMs,
              canvas,
              cache
            )
          : { transform: layer.transform, opacity: layer.opacity, mask: undefined };
        out.push({
          id: `c:${layer.clipId}`,
          source: bitmap,
          opacity: anim.opacity,
          blendMode: layer.blendMode,
          zIndex: trackZ(layer.trackIndex),
          transform: anim.transform,
          mask: anim.mask
        });
      }

      for (const layer of activeTextLayers) {
        const clip = clipById.get(layer.clipId);
        // Staggered per-word motion is drawn into the raster itself; block
        // animations still resolve at the layer below.
        const stagger = clip
          ? resolveTextStaggerContext(clip, atMs, canvas, cache)
          : null;
        const bitmap = textRasterizerRef.current.rasterize(
          layer.textStyle,
          sequenceWidth,
          sequenceHeight,
          stagger
        );
        if (!bitmap) continue;
        const anim = clip
          ? resolveAnimatedLayerProps(
              { clip, transform: layer.transform, opacity: layer.opacity },
              atMs,
              canvas,
              cache
            )
          : { transform: layer.transform, opacity: layer.opacity, mask: undefined };
        out.push({
          id: `t:${layer.clipId}`,
          source: bitmap,
          opacity: anim.opacity,
          blendMode: layer.blendMode,
          zIndex: trackZ(layer.trackIndex),
          transform: anim.transform,
          mask: anim.mask,
          borderRadius: layer.borderRadius,
          effects: anim.effects ?? layer.effects,
          trackEffects: layer.trackEffects
        });
      }

      for (const layer of activeShapeLayers) {
        const bitmap = shapeRasterizerRef.current.rasterize(
          layer.shapeStyle,
          sequenceWidth,
          sequenceHeight
        );
        if (!bitmap) continue;
        const clip = clipById.get(layer.clipId);
        const anim = clip
          ? resolveAnimatedLayerProps(
              { clip, transform: layer.transform, opacity: layer.opacity },
              atMs,
              canvas,
              cache
            )
          : { transform: layer.transform, opacity: layer.opacity, mask: undefined };
        out.push({
          id: `s:${layer.clipId}`,
          source: bitmap,
          opacity: anim.opacity,
          blendMode: layer.blendMode,
          zIndex: trackZ(layer.trackIndex),
          transform: anim.transform,
          mask: anim.mask,
          borderRadius: layer.borderRadius,
          effects: anim.effects ?? layer.effects,
          trackEffects: layer.trackEffects
        });
      }

      return out;
    },
    [
      activeVideoSlots,
      activeImageLayers,
      activeCaptionLayers,
      activeTextLayers,
      activeShapeLayers,
      clipById,
      ensureImageElement,
      sequenceWidth,
      sequenceHeight
    ]
  );

  const renderFrame = useCallback(() => {
    if (!gpuReady) return;
    const compositor = compositorRef.current;
    if (!compositor) return;
    compositor.setLayers(buildLayersRef.current(currentTimeMsRef.current));
    compositor.render();
  }, [gpuReady]);

  // Latest-frame builder ref so renderFrame and the rAF loop can always call
  // the current buildLayers without listing it as a dep (it changes identity
  // every clock tick, which would tear down effects every frame).
  const buildLayersRef = useRef(buildLayers);
  buildLayersRef.current = buildLayers;

  // One-shot render whenever scene state changes (paused mode + scrubbing +
  // inspector edits). `buildLayers` is the dep that matters: its identity
  // changes whenever the active-layer set does — a clip's effects (colour
  // sliders), transform, opacity, or the layer set itself — so editing a
  // property while paused re-composites the preview in realtime. While
  // playing the rAF loop owns rendering, so skip this redundant pass.
  useEffect(() => {
    if (isPlaying) return;
    renderFrame();
  }, [renderFrame, isPlaying, buildLayers]);

  // A paused scrub sets el.currentTime, which decodes the target frame
  // asynchronously — so the one-shot render above runs before the frame is
  // ready and paints a stale (or empty) texture. Re-composite once each video
  // element fires `seeked`, when the decoded frame is actually available.
  // `loadeddata` matters too: a clip whose target time equals the element's
  // current time (e.g. the playhead sits at the clip's first frame) never
  // seeks, so without it the freshly loaded video stays unpainted until the
  // next scrub.
  useEffect(() => {
    if (!poolReady) return;
    const pool = videoRefs.current;
    const onFrameReady = () => renderFrame();
    pool.forEach((el) => {
      el.addEventListener("seeked", onFrameReady);
      el.addEventListener("loadeddata", onFrameReady);
    });
    return () => {
      pool.forEach((el) => {
        el.removeEventListener("seeked", onFrameReady);
        el.removeEventListener("loadeddata", onFrameReady);
      });
    };
  }, [poolReady, renderFrame]);

  // Stable refs so the playback rAF loop reads the latest closures without
  // re-subscribing (which would tear down + restart the loop every render).
  const sceneSignatureRef = useRef(sceneSignature);
  sceneSignatureRef.current = sceneSignature;
  const getTimeMsRef = useRef(getTimeMs);
  getTimeMsRef.current = getTimeMs;

  // Latest `tracks`/`clips` identities, refreshed every render, so the rAF
  // loop (whose closure is only recreated when `[gpuReady, isPlaying]`
  // change) can detect a document mutation without re-subscribing.
  const latestTracksRef = useRef(tracks);
  latestTracksRef.current = tracks;
  const latestClipsRef = useRef(clips);
  latestClipsRef.current = clips;

  // Change-horizon bookkeeping for the tick loop below: the `tracks`/`clips`
  // identities and playhead position the last signature+horizon computation
  // used, so steady-state frames can skip recomputing it entirely.
  const lastComputeTracksRef = useRef(tracks);
  const lastComputeClipsRef = useRef(clips);
  const lastLiveMsRef = useRef(0);
  const lastNextChangeMsRef = useRef(Number.NEGATIVE_INFINITY);

  // While playing, drive a rAF loop off the TRANSIENT playhead (`getTimeMs`),
  // not React state. It (a) bumps the React scene only when the active clip
  // set changes — so we re-bind the video pool / placeholders at boundaries
  // without re-rendering on every steady frame, and (b) re-composites with a
  // dirty flag so a static (image/caption only) scene doesn't burn GPU work.
  useEffect(() => {
    if (!gpuReady || !isPlaying) return;
    const compositor = compositorRef.current;
    if (!compositor) return;

    let raf = 0;
    // Seed with the current scene so the first playing frame doesn't trigger a
    // spurious scene bump. Also seeds the change horizon and the "last
    // computed at" bookkeeping the skip-check below relies on.
    const seedMs = getTimeMsRef.current();
    const seed = sceneSignatureRef.current(seedMs);
    let lastSignature = seed.signature;
    lastLiveMsRef.current = seedMs;
    lastNextChangeMsRef.current = seed.nextChangeMs;
    lastLayersRef.current = seed.layers;
    lastComputeTracksRef.current = latestTracksRef.current;
    lastComputeClipsRef.current = latestClipsRef.current;
    // Force a composite on the very first frame after play starts so any
    // pending texture uploads flush even before a video reports as playing.
    let forceRender = true;

    const tick = () => {
      const liveMs = getTimeMsRef.current();

      // Steady-state frames (no clip/caption-word boundary crossed, no seek,
      // no document mutation) skip re-deriving the scene entirely — the prior
      // horizon already proves the active set can't have changed.
      const needsRecompute =
        liveMs >= lastNextChangeMsRef.current ||
        liveMs < lastLiveMsRef.current ||
        latestTracksRef.current !== lastComputeTracksRef.current ||
        latestClipsRef.current !== lastComputeClipsRef.current;

      let setChanged = false;
      if (needsRecompute) {
        const result = sceneSignatureRef.current(liveMs);
        setChanged = result.signature !== lastSignature;
        lastSignature = result.signature;
        lastNextChangeMsRef.current = result.nextChangeMs;
        lastLayersRef.current = result.layers;
        lastComputeTracksRef.current = latestTracksRef.current;
        lastComputeClipsRef.current = latestClipsRef.current;
        if (setChanged) {
          setSceneTimeMs(liveMs);
        }
      }
      lastLiveMsRef.current = liveMs;

      // A frame needs re-compositing when the active set just changed, or when
      // any active video is decoding new pixels (i.e. actually playing). Pure
      // image/caption scenes are static between boundary changes, so skip the
      // redundant clear+blit — UNLESS a motion-design animation is in flight,
      // which changes transform/opacity every tick even with a cached layer set.
      let dirty = setChanged || forceRender;
      forceRender = false;
      if (!dirty) {
        const pool = videoRefs.current;
        for (const idx of clipSlotMap.current.values()) {
          const el = pool[idx];
          if (el && !el.paused && !el.ended && el.videoWidth > 0) {
            dirty = true;
            break;
          }
        }
      }
      if (
        !dirty &&
        hasActiveAnimation(
          lastLayersRef.current,
          liveMs,
          canvasSizeRef.current,
          animCacheRef.current
        )
      ) {
        dirty = true;
      }

      if (dirty) {
        compositor.setLayers(buildLayersRef.current(liveMs));
        compositor.render();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [gpuReady, isPlaying]);

  const hasAnything =
    activeVideoSlots.length > 0 ||
    activeImageLayers.length > 0 ||
    activeCaptionLayers.length > 0 ||
    activeTextLayers.length > 0 ||
    activeShapeLayers.length > 0 ||
    placeholderLayers.length > 0;

  const generatingClips = useMemo(
    () =>
      clips.filter(
        (c) => c.status === "generating" && isClipActive(c, currentTimeMs)
      ),
    [clips, currentTimeMs]
  );

  const staleActiveClips = useMemo(
    () =>
      clips.filter(
        (c) =>
          c.status === "stale" &&
          isClipActive(c, currentTimeMs) &&
          (c.mediaType === "video" ||
            c.mediaType === "overlay" ||
            c.mediaType === "image")
      ),
    [clips, currentTimeMs]
  );

  return (
    <div
      ref={containerRef}
      css={compositorStyles}
      data-testid="preview-compositor"
    >
      <div ref={frameRef} css={frameStyles}>
        <canvas ref={canvasRef} css={canvasStyles} aria-hidden />

        <div
          ref={poolContainerRef}
          style={{
            position: "absolute",
            width: 0,
            height: 0,
            overflow: "hidden",
            pointerEvents: "none"
          }}
        />

        {selectedGizmo && (
          <TransformGizmoOverlay
            clipId={selectedGizmo.clipId}
            transform={selectedGizmo.transform}
            sourceWidth={selectedGizmo.sourceWidth}
            sourceHeight={selectedGizmo.sourceHeight}
            sequenceWidth={sequenceWidth}
            sequenceHeight={sequenceHeight}
            frameWidth={frameSize.w}
            frameHeight={frameSize.h}
            onChange={(id, next) => {
              patchClip(id, { transform: next });
              gizmoHistory.mark();
            }}
            onDragStart={gizmoHistory.begin}
            onDragEnd={gizmoHistory.end}
          />
        )}

        {placeholderLayers.map((layer) => (
          <div
            key={layer.clipId}
            style={{
              position: "absolute",
              inset: 0,
              zIndex: trackZ(layer.trackIndex)
            }}
          >
            <div css={placeholderLayerStyles(theme)}>
              <span style={{ fontSize: 24, opacity: 0.4 }}>▭</span>
              <span style={{ fontSize: theme.fontSizeSmaller, opacity: 0.5 }}>
                {layer.name}
              </span>
            </div>
          </div>
        ))}

        {staleActiveClips.map((c) => (
          <div
            key={`stale-${c.id}`}
            css={overlayBadgeStyles(theme, "#c08000")}
            style={{ zIndex: PREVIEW_OVERLAY_Z.badge }}
          >
            stale
          </div>
        ))}

        {generatingClips.length > 0 && (
          <div css={previewMagicOverlayStyles} aria-hidden>
            <MagicGenerationFill />
          </div>
        )}

        {generatingClips.map((c) => (
          <div
            key={`gen-${c.id}`}
            css={overlayBadgeStyles(theme, "#0055aa")}
            style={{ zIndex: PREVIEW_OVERLAY_Z.badge }}
          >
            generating…
          </div>
        ))}

        {gpuFailed && (
          <div
            css={placeholderLayerStyles(theme)}
            style={{ zIndex: Z_INDEX.raised, color: "#c08000" }}
          >
            <span style={{ fontSize: theme.fontSizeSmall }}>
              Preview rendering unavailable
            </span>
          </div>
        )}

        {!hasAnything && !gpuFailed && (
          <div
            css={placeholderLayerStyles(theme)}
            style={{ zIndex: Z_INDEX.raised }}
          >
            <span style={{ fontSize: 32, opacity: 0.15 }}>▶</span>
            <span style={{ fontSize: theme.fontSizeSmall, opacity: 0.25 }}>
              No media at {Math.round(currentTimeMs / 1000)}s
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

PreviewCompositor.displayName = "PreviewCompositor";
