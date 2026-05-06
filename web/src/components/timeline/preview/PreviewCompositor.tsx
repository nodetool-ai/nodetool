/** @jsxImportSource @emotion/react */
/**
 * PreviewCompositor
 *
 * DOM-based preview compositor for the timeline editor.
 *
 * For each track / clip whose time range covers `currentTimeMs`:
 *  - **Video / overlay** — one of up to 8 pooled `<video>` elements is
 *    assigned; `currentTime` and `playbackRate` are set every frame.
 *  - **Image** — an `<img>` element is rendered absolutely in the layer.
 *  - **Audio** — registered with `AudioGraph` (no DOM rendering here).
 *  - **Overlay tracks** — `mix-blend-mode` from `clip.blendMode` + `opacity`
 *    from `clip.opacity`. Stacked via `z-index = trackIndex`.
 *
 * Stale clips are rendered with a "stale" overlay badge.
 * Failed / missing / draft clips show a placeholder overlay.
 * Generating clips show a progress overlay (or prior asset if available).
 *
 * Element pool: 8 hot slots (active) + 4 cold slots (upcoming, preloaded).
 */

import React, {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useCallback
} from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { shallow } from "zustand/shallow";

import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import { useAssetStore } from "../../../stores/AssetStore";


const HOT_POOL_SIZE = 8;
const COLD_POOL_SIZE = 4;
const TOTAL_POOL_SIZE = HOT_POOL_SIZE + COLD_POOL_SIZE;
/** Preload upcoming clips within this lookahead window (ms). */
const PRELOAD_LOOKAHEAD_MS = 30_000;

const compositorStyles = (theme: Theme) =>
  css({
    position: "relative",
    width: "100%",
    height: "100%",
    backgroundColor: "#000",
    overflow: "hidden"
  });

const layerStyles = (
  zIndex: number,
  blendMode: string,
  opacity: number,
  visible: boolean
) =>
  css({
    position: "absolute",
    inset: 0,
    zIndex,
    mixBlendMode: blendMode as React.CSSProperties["mixBlendMode"],
    opacity,
    display: visible ? "block" : "none"
  });

const videoStyles = css({
  width: "100%",
  height: "100%",
  objectFit: "contain",
  display: "block"
});

const imgStyles = css({
  width: "100%",
  height: "100%",
  objectFit: "contain",
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
  blendMode: string;
  opacity: number;
  assetUrl: string;
}

interface ActiveImageLayer {
  clipId: string;
  trackIndex: number;
  blendMode: string;
  opacity: number;
  assetUrl: string;
  status: TimelineClip["status"];
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

function toBlendMode(b: TimelineClip["blendMode"]): string {
  if (!b || b === "normal") {
    return "normal";
  }
  if (b === "add") {
    return "screen"; // closest CSS equivalent
  }
  return b;
}

/**
 * Determine the effective clip media URL.
 *
 * - `generated` / `stale` / `locked` → use the current asset (if any).
 * - `generating` → use the prior asset if available (graceful degradation).
 * - `failed` / `missing` / `draft` → no URL (placeholder will be shown).
 */
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

export interface PreviewCompositorProps {
  /** Pixel width of the preview area (for aspect-ratio correction). */
  width?: number;
  /** Pixel height of the preview area. */
  height?: number;
  /** Sequence output width in pixels (used to size the inner stage). */
  sequenceWidth?: number;
  /** Sequence output height in pixels. */
  sequenceHeight?: number;
}

/**
 * PreviewCompositor renders the composited timeline preview.
 *
 * It subscribes to `TimelinePlaybackStore.currentTimeMs` at high frequency
 * (every frame during playback) but uses shallow selectors + memoisation to
 * avoid cascading re-renders in the tracks tree.
 */
export const PreviewCompositor: React.FC<PreviewCompositorProps> = memo(
  ({ sequenceWidth = 1920, sequenceHeight = 1080 }) => {
    const theme = useTheme();

    const currentTimeMs = useTimelinePlaybackStore((s) => s.currentTimeMs);
    const isPlaying = useTimelinePlaybackStore((s) => s.isPlaying);

    const { tracks, clips } = useTimelineStore(
      (s) => ({ tracks: s.tracks, clips: s.clips }),
      shallow
    );

    const assetUrlCache = useRef<Map<string, string>>(new Map());
    const getAsset = useAssetStore((s) => s.get);

    // Resolve asset URL from cache, else schedule a fetch.
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
            // asset is the normalized response from AssetStore; get_url is
            // present at runtime even though the TS type chain is incomplete
            // when the websocket package dist is absent.
            const url = (asset as unknown as { get_url?: string | null })?.get_url;
            if (url) {
              assetUrlCache.current.set(assetId, url);
            }
          })
          .catch(() => {
            // Asset unavailable — leave cache empty; placeholder will render.
          });
        return undefined;
      },
      [getAsset]
    );

    const videoRefs = useRef<HTMLVideoElement[]>([]);
    const [poolReady, setPoolReady] = useState(false);

    useEffect(() => {
      const pool: HTMLVideoElement[] = [];
      for (let i = 0; i < TOTAL_POOL_SIZE; i++) {
        const el = document.createElement("video");
        el.preload = "auto";
        el.playsInline = true;
        el.muted = true; // muted for autoplay policy; audio is via AudioGraph
        el.style.cssText =
          "width:100%;height:100%;object-fit:contain;display:block;position:absolute;inset:0;";
        pool.push(el);
      }
      videoRefs.current = pool;
      setPoolReady(true);

      return () => {
        for (const el of pool) {
          el.pause();
          el.src = "";
        }
        videoRefs.current = [];
      };
    }, []);

    const trackById = useMemo(
      () => new Map(tracks.map((t) => [t.id, t])),
      [tracks]
    );

    const sortedTracks = useMemo(
      () => [...tracks].sort((a, b) => a.index - b.index),
      [tracks]
    );

    const activeVideoSlots = useMemo((): ActiveVideoSlot[] => {
      const result: ActiveVideoSlot[] = [];
      for (const track of sortedTracks) {
        if (
          !track.visible ||
          (track.type !== "video" && track.type !== "overlay")
        ) {
          continue;
        }
        const clip = clips.find(
          (c) => c.trackId === track.id && isClipActive(c, currentTimeMs)
        );
        if (!clip) {
          continue;
        }
        const assetId = effectiveAssetId(clip);
        const url = resolveUrl(assetId);
        if (!url) {
          continue; // will render placeholder layer instead
        }
        if (result.length >= HOT_POOL_SIZE) {
          break; // pool exhausted
        }
        result.push({
          clipId: clip.id,
          trackIndex: track.index,
          blendMode: toBlendMode(clip.blendMode),
          opacity: clip.opacity ?? 1,
          assetUrl: url
        });
      }
      return result;
    }, [sortedTracks, clips, currentTimeMs, resolveUrl]);

    // Active image clips.
    const activeImageLayers = useMemo((): ActiveImageLayer[] => {
      const result: ActiveImageLayer[] = [];
      for (const track of sortedTracks) {
        if (!track.visible || track.type !== "video") {
          continue;
        }
        const clip = clips.find(
          (c) =>
            c.trackId === track.id &&
            c.mediaType === "image" &&
            isClipActive(c, currentTimeMs)
        );
        if (!clip) {
          continue;
        }
        const assetId = effectiveAssetId(clip);
        result.push({
          clipId: clip.id,
          trackIndex: track.index,
          blendMode: toBlendMode(clip.blendMode),
          opacity: clip.opacity ?? 1,
          assetUrl: resolveUrl(assetId) ?? "",
          status: clip.status
        });
      }
      return result;
    }, [sortedTracks, clips, currentTimeMs, resolveUrl]);

    // Clips that need a placeholder (no asset URL, in active range).
    const placeholderLayers = useMemo(() => {
      const result: Array<{
        clipId: string;
        trackIndex: number;
        status: TimelineClip["status"];
        name: string;
      }> = [];
      for (const track of sortedTracks) {
        if (!track.visible) {
          continue;
        }
        const clip = clips.find(
          (c) => c.trackId === track.id && isClipActive(c, currentTimeMs)
        );
        if (!clip) {
          continue;
        }
        if (
          clip.mediaType === "audio"
        ) {
          continue;
        }
        // Only show placeholder if we have no asset URL.
        const assetId = effectiveAssetId(clip);
        const url = resolveUrl(assetId);
        if (url) {
          continue;
        }
        result.push({
          clipId: clip.id,
          trackIndex: track.index,
          status: clip.status,
          name: clip.name
        });
      }
      return result;
    }, [sortedTracks, clips, currentTimeMs, resolveUrl]);

    useLayoutEffect(() => {
      if (!poolReady) {
        return;
      }
      const pool = videoRefs.current;

      for (let i = 0; i < pool.length; i++) {
        pool[i].hidden = true;
      }

      activeVideoSlots.forEach((slot, slotIndex) => {
        if (slotIndex >= pool.length) {
          return;
        }
        const el = pool[slotIndex];
        el.hidden = false;

        // Update src only when it changes to avoid flicker.
        if (el.src !== slot.assetUrl && el.getAttribute("data-asset") !== slot.assetUrl) {
          el.src = slot.assetUrl;
          el.setAttribute("data-asset", slot.assetUrl);
        }

        const clipOffsetMs =
          currentTimeMs -
          (clips.find((c) => c.id === slot.clipId)?.startMs ?? 0) +
          (clips.find((c) => c.id === slot.clipId)?.inPointMs ?? 0);
        const targetSec = Math.max(0, clipOffsetMs / 1000);

        // Only seek if the video is not actively playing (avoid stuttering).
        if (!isPlaying) {
          if (Math.abs(el.currentTime - targetSec) > 0.04) {
            el.currentTime = targetSec;
          }
        } else {
          // During playback, allow natural play but correct large drifts.
          if (Math.abs(el.currentTime - targetSec) > 0.15) {
            el.currentTime = targetSec;
          }
        }

        const speed = clips.find((c) => c.id === slot.clipId)?.speedMultiplier ?? 1;
        el.playbackRate = speed;

        el.style.zIndex = String(slot.trackIndex);
        el.style.mixBlendMode = slot.blendMode;
        el.style.opacity = String(slot.opacity);

        if (isPlaying && el.paused) {
          void el.play().catch(() => {
            // Autoplay blocked; continue scrubbing via currentTime.
          });
        } else if (!isPlaying && !el.paused) {
          el.pause();
        }
      });

      // Preload upcoming clips in cold pool slots.
      const upcomingVideoClips = clips
        .filter(
          (c) =>
            (c.mediaType === "video" || c.mediaType === "overlay") &&
            isClipUpcoming(c, currentTimeMs)
        )
        .slice(0, COLD_POOL_SIZE);

      upcomingVideoClips.forEach((clip, i) => {
        const slotIndex = HOT_POOL_SIZE + i;
        if (slotIndex >= pool.length) {
          return;
        }
        const el = pool[slotIndex];
        el.hidden = true; // keep preloaded but hidden
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
      resolveUrl
    ]);

    const poolContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!poolReady || !poolContainerRef.current) {
        return;
      }
      const container = poolContainerRef.current;
      for (const el of videoRefs.current) {
        container.appendChild(el);
      }
      return () => {
        for (const el of videoRefs.current) {
          if (container.contains(el)) {
            container.removeChild(el);
          }
        }
      };
    }, [poolReady]);

    const hasAnything =
      activeVideoSlots.length > 0 ||
      activeImageLayers.length > 0 ||
      placeholderLayers.length > 0;

    return (
      <div css={compositorStyles(theme)} data-testid="preview-compositor">
        <div
          ref={poolContainerRef}
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none"
          }}
        />

        {activeImageLayers.map((layer) => (
          <div
            key={layer.clipId}
            css={layerStyles(
              layer.trackIndex,
              layer.blendMode,
              layer.opacity,
              !!layer.assetUrl
            )}
          >
            {layer.assetUrl ? (
              <img
                css={imgStyles}
                src={layer.assetUrl}
                alt=""
                aria-hidden
                draggable={false}
              />
            ) : null}
          </div>
        ))}

        {placeholderLayers.map((layer) => (
          <div
            key={layer.clipId}
            css={layerStyles(layer.trackIndex, "normal", 0.85, true)}
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
              (c.mediaType === "video" || c.mediaType === "overlay" || c.mediaType === "image")
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
            (c) =>
              c.status === "generating" &&
              isClipActive(c, currentTimeMs)
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

        {!hasAnything && (
          <div
            css={placeholderLayerStyles(theme)}
            style={{ zIndex: 1 }}
          >
            <span style={{ fontSize: 32, opacity: 0.15 }}>▶</span>
            <span style={{ fontSize: 12, opacity: 0.25 }}>
              No media at {Math.round(currentTimeMs / 1000)}s
            </span>
          </div>
        )}
      </div>
    );
  }
);

PreviewCompositor.displayName = "PreviewCompositor";
