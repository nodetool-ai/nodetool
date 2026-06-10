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

import type { TimelineClip, TrackEffect } from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { useAssetStore } from "../../../stores/AssetStore";
import { getAssetUrl } from "../../../utils/assetHelpers";

import { WebGPUCompositor } from "./gpu/compositor";
import type { CompositeLayer, CompositorBlendMode } from "./gpu/types";
import { TransformGizmoOverlay } from "./TransformGizmoOverlay";
import {
  clipSourceTimeSec,
  computeActiveLayers,
  effectiveAssetId,
  isClipActive,
  trackZ,
  MAX_VIDEO_LAYERS
} from "./sceneModel";
import type { ResolvedCaption } from "./sceneModel";
import { CaptionRasterizer } from "./captionRender";

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

const overlayBadgeStyles = (color: string) =>
  css({
    position: "absolute",
    top: 4,
    left: 4,
    zIndex: 9999,
    fontSize: 9,
    lineHeight: 1,
    padding: "2px 5px",
    borderRadius: 3,
    backgroundColor: color,
    color: "#fff",
    pointerEvents: "none",
    fontWeight: 600,
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
    fontSize: 13,
    userSelect: "none",
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

function isClipUpcoming(clip: TimelineClip, currentTimeMs: number): boolean {
  return (
    clip.startMs > currentTimeMs &&
    clip.startMs <= currentTimeMs + PRELOAD_LOOKAHEAD_MS
  );
}

export const PreviewCompositor: React.FC = memo(() => {
  const theme = useTheme();

  const currentTimeMs = useTimelinePlaybackStore((s) => s.currentTimeMs);
  const isPlaying = useTimelinePlaybackStore((s) => s.isPlaying);

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
  const compositorRef = useRef<WebGPUCompositor | null>(null);
  const captionRasterizerRef = useRef<CaptionRasterizer>(new CaptionRasterizer());
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
        el.src = "";
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

    const compositor = new WebGPUCompositor();
    compositor
      .init(canvas)
      .then((res) => {
        if (cancelled) {
          compositor.dispose();
          return;
        }
        if (res.ok) {
          compositorRef.current = compositor;
          setGpuReady(true);
        } else {
          setGpuFailed(true);
          compositor.dispose();
        }
      })
      .catch(() => {
        if (!cancelled) setGpuFailed(true);
        compositor.dispose();
      });

    const rasterizer = captionRasterizerRef.current;
    return () => {
      cancelled = true;
      compositorRef.current?.dispose();
      compositorRef.current = null;
      rasterizer.dispose();
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

  const clipById = useMemo(
    () => new Map(clips.map((c) => [c.id, c])),
    [clips]
  );

  const {
    activeVideoSlots,
    activeImageLayers,
    activeCaptionLayers,
    placeholderLayers
  } = useMemo(() => {
    const videoSlots: ActiveVideoSlot[] = [];
    const imageLayers: ActiveImageLayer[] = [];
    const captionLayers: ActiveCaptionLayer[] = [];
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
      const targetSec = clip ? clipSourceTimeSec(clip, currentTimeMs) : 0;

      // Setting currentTime before HAVE_METADATA is silently clamped to 0 and
      // a subsequent play() can reject with AbortError. Defer until the
      // element reports metadata; on next render the slot's pending closure
      // (kept in pendingSeeks) re-runs with fresh state.
      const applySeek = () => {
        if (el.readyState < 1) return;
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

    // Preload upcoming clips into cold pool slots.
    const upcomingVideoClips = clips
      .filter(
        (c) =>
          (c.mediaType === "video" || c.mediaType === "overlay") &&
          isClipUpcoming(c, currentTimeMs)
      )
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
    clips,
    clipById,
    resolveUrl
  ]);

  // Resolve / preload image elements for image layers.
  const ensureImageElement = useCallback(
    (url: string): HTMLImageElement | null => {
      if (!url) return null;
      const cached = imageElementCache.current.get(url);
      if (cached) {
        // Touch as most-recent for LRU ordering.
        imageElementCache.current.delete(url);
        imageElementCache.current.set(url, cached);
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

  // Build the GPU layer list from active slots and image layers.
  const buildLayers = useCallback((): CompositeLayer[] => {
    const out: CompositeLayer[] = [];
    const pool = videoRefs.current;

    activeVideoSlots.forEach((slot) => {
      const slotIndex = clipSlotMap.current.get(slot.clipId);
      if (slotIndex === undefined) return;
      const el = pool[slotIndex];
      // Keep the layer in the list even if the video momentarily drops below
      // HAVE_CURRENT_DATA (e.g. during a scrub seek). The compositor reuses
      // the previously uploaded texture so we don't flash to black.
      if (!el || el.videoWidth === 0) return;
      out.push({
        id: `v:${slot.clipId}`,
        source: el,
        opacity: slot.opacity,
        blendMode: slot.blendMode,
        zIndex: trackZ(slot.trackIndex),
        transform: slot.transform,
        borderRadius: slot.borderRadius,
        effects: slot.effects,
        trackEffects: slot.trackEffects
      });
    });

    for (const layer of activeImageLayers) {
      if (!layer.assetUrl) continue;
      const img = ensureImageElement(layer.assetUrl);
      if (!img) continue;
      out.push({
        id: `i:${layer.clipId}`,
        source: img,
        opacity: layer.opacity,
        blendMode: layer.blendMode,
        zIndex: trackZ(layer.trackIndex),
        transform: layer.transform,
        borderRadius: layer.borderRadius,
        effects: layer.effects,
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
      out.push({
        id: `c:${layer.clipId}`,
        source: bitmap,
        opacity: layer.opacity,
        blendMode: layer.blendMode,
        zIndex: trackZ(layer.trackIndex),
        transform: layer.transform
      });
    }

    return out;
  }, [
    activeVideoSlots,
    activeImageLayers,
    activeCaptionLayers,
    ensureImageElement,
    sequenceWidth,
    sequenceHeight
  ]);

  const renderFrame = useCallback(() => {
    if (!gpuReady) return;
    const compositor = compositorRef.current;
    if (!compositor) return;
    compositor.setLayers(buildLayers());
    compositor.render();
  }, [gpuReady, buildLayers]);

  // One-shot render whenever scene state changes (paused mode + scrubbing).
  useEffect(() => {
    renderFrame();
  }, [renderFrame]);

  // A paused scrub sets el.currentTime, which decodes the target frame
  // asynchronously — so the one-shot render above runs before the frame is
  // ready and paints a stale (or empty) texture. Re-composite once each video
  // element fires `seeked`, when the decoded frame is actually available.
  useEffect(() => {
    if (!poolReady) return;
    const pool = videoRefs.current;
    const onSeeked = () => renderFrame();
    pool.forEach((el) => el.addEventListener("seeked", onSeeked));
    return () => {
      pool.forEach((el) => el.removeEventListener("seeked", onSeeked));
    };
  }, [poolReady, renderFrame]);

  // While playing, drive a rAF render loop so video frame textures stay fresh
  // between AudioContext-clock store updates.
  useEffect(() => {
    if (!gpuReady || !isPlaying) return;
    const compositor = compositorRef.current;
    if (!compositor) return;

    let raf = 0;
    const tick = () => {
      compositor.setLayers(buildLayers());
      compositor.render();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [gpuReady, isPlaying, buildLayers]);

  const hasAnything =
    activeVideoSlots.length > 0 ||
    activeImageLayers.length > 0 ||
    placeholderLayers.length > 0;

  return (
    <div ref={containerRef} css={compositorStyles} data-testid="preview-compositor">
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
            onChange={(id, next) => patchClip(id, { transform: next })}
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
              <span style={{ fontSize: 11, opacity: 0.5 }}>{layer.name}</span>
            </div>
          </div>
        ))}

        {clips
          .filter(
            (c) =>
              c.status === "stale" &&
              isClipActive(c, currentTimeMs) &&
              (c.mediaType === "video" ||
                c.mediaType === "overlay" ||
                c.mediaType === "image")
          )
          .map((c) => (
            <div
              key={`stale-${c.id}`}
              css={overlayBadgeStyles("#c08000")}
              style={{ zIndex: 9999 }}
            >
              stale
            </div>
          ))}

        {clips
          .filter(
            (c) => c.status === "generating" && isClipActive(c, currentTimeMs)
          )
          .map((c) => (
            <div
              key={`gen-${c.id}`}
              css={overlayBadgeStyles("#0055aa")}
              style={{ zIndex: 9999 }}
            >
              generating…
            </div>
          ))}

        {gpuFailed && (
          <div
            css={placeholderLayerStyles(theme)}
            style={{ zIndex: 1, color: "#c08000" }}
          >
            <span style={{ fontSize: 12 }}>WebGPU not available</span>
          </div>
        )}

        {!hasAnything && !gpuFailed && (
          <div css={placeholderLayerStyles(theme)} style={{ zIndex: 1 }}>
            <span style={{ fontSize: 32, opacity: 0.15 }}>▶</span>
            <span style={{ fontSize: 12, opacity: 0.25 }}>
              No media at {Math.round(currentTimeMs / 1000)}s
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

PreviewCompositor.displayName = "PreviewCompositor";
