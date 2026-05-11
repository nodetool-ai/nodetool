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
import { shallow } from "zustand/shallow";

import type { TimelineClip, TrackEffect } from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import { useAssetStore } from "../../../stores/AssetStore";
import { getAssetUrl } from "../../../utils/assetHelpers";

import { WebGPUCompositor } from "./gpu/compositor";
import type { CompositeLayer, CompositorBlendMode } from "./gpu/types";

interface PlaceholderLayer {
  clipId: string;
  trackIndex: number;
  status: TimelineClip["status"];
  name: string;
}

const HOT_POOL_SIZE = 8;
const COLD_POOL_SIZE = 4;
const TOTAL_POOL_SIZE = HOT_POOL_SIZE + COLD_POOL_SIZE;
/** Preload upcoming clips within this lookahead window (ms). */
const PRELOAD_LOOKAHEAD_MS = 30_000;
/**
 * Top-of-UI track (lowest `track.index`) renders on top in the composite —
 * matches Premiere / Resolve / FCP. Compositor draws layers from low z to
 * high z, so we invert the UI index. Constant offset keeps numbers
 * positive for DOM placeholder z-indices too.
 */
const LAYER_Z_BASE = 1000;
const trackZ = (uiIndex: number): number => LAYER_Z_BASE - uiIndex;

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
    fontWeight: 700,
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

function isClipActive(clip: TimelineClip, currentTimeMs: number): boolean {
  return (
    currentTimeMs >= clip.startMs &&
    currentTimeMs < clip.startMs + clip.durationMs
  );
}

/**
 * Opacity multiplier for a clip given the playhead position. Implements
 * the incoming `transitionIn` ramp (0→1 over `durationMs`). Returns 1 when
 * no transition applies. Crossfade is the only type currently supported.
 */
function transitionOpacity(clip: TimelineClip, currentTimeMs: number): number {
  const t = clip.transitionIn;
  if (!t || t.durationMs <= 0) return 1;
  const intoClip = currentTimeMs - clip.startMs;
  if (intoClip >= t.durationMs) return 1;
  if (intoClip <= 0) return 0;
  return intoClip / t.durationMs;
}

function isClipUpcoming(clip: TimelineClip, currentTimeMs: number): boolean {
  return (
    clip.startMs > currentTimeMs &&
    clip.startMs <= currentTimeMs + PRELOAD_LOOKAHEAD_MS
  );
}

function effectiveAssetId(clip: TimelineClip): string | undefined {
  switch (clip.status) {
    case "generated":
    case "stale":
    case "locked":
    case "generating":
      return clip.currentAssetId;
    default:
      return undefined;
  }
}

function resolveBlendMode(
  b: TimelineClip["blendMode"]
): CompositorBlendMode {
  return b ?? "normal";
}

export const PreviewCompositor: React.FC = memo(() => {
  const theme = useTheme();

  const currentTimeMs = useTimelinePlaybackStore((s) => s.currentTimeMs);
  const isPlaying = useTimelinePlaybackStore((s) => s.isPlaying);

  const { tracks, clips, sequenceWidth, sequenceHeight } = useTimelineStore(
    (s) => ({
      tracks: s.tracks,
      clips: s.clips,
      sequenceWidth: s.width,
      sequenceHeight: s.height
    }),
    shallow
  );

  const assetUrlCache = useRef<Map<string, string>>(new Map());
  const [urlCacheVersion, setUrlCacheVersion] = useState(0);
  const getAsset = useAssetStore((s) => s.get);

  const resolveUrl = useCallback(
    (assetId: string | undefined): string | undefined => {
      if (!assetId) {
        return undefined;
      }
      if (assetUrlCache.current.has(assetId)) {
        return assetUrlCache.current.get(assetId);
      }
      getAsset(assetId)
        .then((asset) => {
          const url = getAssetUrl(asset);
          if (url) {
            assetUrlCache.current.set(assetId, url);
            setUrlCacheVersion((v) => v + 1);
          }
        })
        .catch(() => {
          // Asset unavailable — leave cache empty; placeholder will render.
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
  const imageElementCache = useRef<Map<string, HTMLImageElement>>(new Map());

  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compositorRef = useRef<WebGPUCompositor | null>(null);
  const [gpuReady, setGpuReady] = useState(false);
  const [gpuFailed, setGpuFailed] = useState(false);

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

    return () => {
      for (const el of pool) {
        el.pause();
        el.src = "";
        if (container.contains(el)) {
          container.removeChild(el);
        }
      }
      videoRefs.current = [];
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

    return () => {
      cancelled = true;
      compositorRef.current?.dispose();
      compositorRef.current = null;
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

  const sortedTracks = useMemo(
    () => [...tracks].sort((a, b) => a.index - b.index),
    [tracks]
  );

  const clipsByTrackId = useMemo(() => {
    const m = new Map<string, TimelineClip[]>();
    for (const c of clips) {
      const arr = m.get(c.trackId);
      if (arr) arr.push(c);
      else m.set(c.trackId, [c]);
    }
    return m;
  }, [clips]);

  const clipById = useMemo(
    () => new Map(clips.map((c) => [c.id, c])),
    [clips]
  );

  const { activeVideoSlots, activeImageLayers, placeholderLayers } = useMemo(() => {
    const videoSlots: ActiveVideoSlot[] = [];
    const imageLayers: ActiveImageLayer[] = [];
    const placeholders: PlaceholderLayer[] = [];

    for (const track of sortedTracks) {
      if (!track.visible) continue;
      const trackClips = clipsByTrackId.get(track.id) ?? [];
      // All clips overlapping the playhead. With transitions, two adjacent
      // clips can be active simultaneously during the cross-fade overlap.
      // Order by startMs so the outgoing (older) clip composites first and
      // the incoming clip blends on top.
      const activeClips = trackClips
        .filter((c) => isClipActive(c, currentTimeMs))
        .sort((a, b) => a.startMs - b.startMs);

      for (const clip of activeClips) {
        if (clip.mediaType === "audio") continue;

        const assetId = effectiveAssetId(clip);
        const url = resolveUrl(assetId);
        const baseOpacity = clip.opacity ?? 1;
        const opacity = baseOpacity * transitionOpacity(clip, currentTimeMs);

        if (
          clip.mediaType === "image" &&
          (track.type === "video" || track.type === "overlay")
        ) {
          imageLayers.push({
            clipId: clip.id,
            trackIndex: track.index,
            blendMode: resolveBlendMode(clip.blendMode),
            opacity,
            assetUrl: url ?? "",
            status: clip.status,
            transform: clip.transform,
            borderRadius: clip.borderRadius,
            effects: clip.effects,
            trackEffects: track.effects
          });
          if (!url) {
            placeholders.push({
              clipId: clip.id,
              trackIndex: track.index,
              status: clip.status,
              name: clip.name
            });
          }
        } else if (
          (clip.mediaType === "video" || clip.mediaType === "overlay") &&
          (track.type === "video" || track.type === "overlay")
        ) {
          if (url && videoSlots.length < HOT_POOL_SIZE) {
            videoSlots.push({
              clipId: clip.id,
              trackIndex: track.index,
              blendMode: resolveBlendMode(clip.blendMode),
              opacity,
              assetUrl: url,
              transform: clip.transform,
              borderRadius: clip.borderRadius,
              effects: clip.effects,
              trackEffects: track.effects
            });
          } else if (!url) {
            placeholders.push({
              clipId: clip.id,
              trackIndex: track.index,
              status: clip.status,
              name: clip.name
            });
          }
        }
      }
    }

    return {
      activeVideoSlots: videoSlots,
      activeImageLayers: imageLayers,
      placeholderLayers: placeholders
    };
  }, [sortedTracks, clipsByTrackId, currentTimeMs, resolveUrl, urlCacheVersion]);

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
      const clipOffsetMs =
        currentTimeMs - (clip?.startMs ?? 0) + (clip?.inPointMs ?? 0);
      const targetSec = Math.max(0, clipOffsetMs / 1000);

      if (!isPlaying) {
        if (Math.abs(el.currentTime - targetSec) > 0.04) {
          el.currentTime = targetSec;
        }
      } else {
        if (Math.abs(el.currentTime - targetSec) > 0.15) {
          el.currentTime = targetSec;
        }
      }
      el.playbackRate = clip?.speedMultiplier ?? 1;

      if (isPlaying && el.paused) {
        void el.play().catch(() => {
          // Autoplay blocked; continue scrubbing via currentTime.
        });
      } else if (!isPlaying && !el.paused) {
        el.pause();
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

    return out;
  }, [activeVideoSlots, activeImageLayers, ensureImageElement]);

  // One-shot render whenever scene state changes (paused mode + scrubbing).
  useEffect(() => {
    if (!gpuReady) return;
    const compositor = compositorRef.current;
    if (!compositor) return;
    compositor.setLayers(buildLayers());
    compositor.render();
  }, [gpuReady, buildLayers]);

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
