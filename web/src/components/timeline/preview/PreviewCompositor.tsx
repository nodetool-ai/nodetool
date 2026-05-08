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

import type { TimelineClip } from "@nodetool-ai/timeline";
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

const compositorStyles = css({
  position: "relative",
  width: "100%",
  height: "100%",
  backgroundColor: "#000",
  overflow: "hidden"
});

const canvasStyles = css({
  position: "absolute",
  inset: 0,
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
}

function isClipActive(clip: TimelineClip, currentTimeMs: number): boolean {
  return (
    currentTimeMs >= clip.startMs &&
    currentTimeMs < clip.startMs + clip.durationMs
  );
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

  const { tracks, clips } = useTimelineStore(
    (s) => ({ tracks: s.tracks, clips: s.clips }),
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
  const [poolReady, setPoolReady] = useState(false);
  const poolContainerRef = useRef<HTMLDivElement>(null);

  // Image element cache, keyed by URL — fed to the compositor as image layers.
  const imageElementCache = useRef<Map<string, HTMLImageElement>>(new Map());

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

  // Keep the canvas backing-store sized to its CSS box (devicePixelRatio aware).
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const apply = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        compositorRef.current?.resize(w, h);
      }
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

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
      const clip = trackClips.find((c) => isClipActive(c, currentTimeMs));
      if (!clip || clip.mediaType === "audio") continue;

      const assetId = effectiveAssetId(clip);
      const url = resolveUrl(assetId);

      if (clip.mediaType === "image" && track.type === "video") {
        imageLayers.push({
          clipId: clip.id,
          trackIndex: track.index,
          blendMode: resolveBlendMode(clip.blendMode),
          opacity: clip.opacity ?? 1,
          assetUrl: url ?? "",
          status: clip.status,
          transform: clip.transform,
          borderRadius: clip.borderRadius,
          effects: clip.effects
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
            opacity: clip.opacity ?? 1,
            assetUrl: url,
            transform: clip.transform,
            borderRadius: clip.borderRadius,
            effects: clip.effects
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

    activeVideoSlots.forEach((slot, slotIndex) => {
      if (slotIndex >= pool.length) return;
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

    // Pause + clear unused hot-pool slots so their decoders go idle.
    for (let i = activeVideoSlots.length; i < HOT_POOL_SIZE; i++) {
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

    activeVideoSlots.forEach((slot, slotIndex) => {
      const el = pool[slotIndex];
      if (!el || el.readyState < 2) return; // HAVE_CURRENT_DATA
      out.push({
        id: `v:${slot.clipId}`,
        source: el,
        opacity: slot.opacity,
        blendMode: slot.blendMode,
        zIndex: slot.trackIndex,
        transform: slot.transform,
        borderRadius: slot.borderRadius,
        effects: slot.effects
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
        zIndex: layer.trackIndex,
        transform: layer.transform,
        borderRadius: layer.borderRadius,
        effects: layer.effects
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
    <div css={compositorStyles} data-testid="preview-compositor">
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
            zIndex: layer.trackIndex
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
  );
});

PreviewCompositor.displayName = "PreviewCompositor";
