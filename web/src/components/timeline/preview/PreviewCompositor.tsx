/** @jsxImportSource @emotion/react */

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

import type { TimelineClip } from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import { useAssetStore } from "../../../stores/AssetStore";
import { getAssetUrl } from "../../../utils/assetHelpers";

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
 * `failed` / `missing` / `draft` clips have no asset (placeholder shown).
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

export const PreviewCompositor: React.FC = memo(
  () => {
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
            blendMode: toBlendMode(clip.blendMode),
            opacity: clip.opacity ?? 1,
            assetUrl: url ?? "",
            status: clip.status
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
              blendMode: toBlendMode(clip.blendMode),
              opacity: clip.opacity ?? 1,
              assetUrl: url
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

      return { activeVideoSlots: videoSlots, activeImageLayers: imageLayers, placeholderLayers: placeholders };
    }, [sortedTracks, clipsByTrackId, currentTimeMs, resolveUrl, urlCacheVersion]);

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

        const clip = clipById.get(slot.clipId);
        const clipOffsetMs =
          currentTimeMs - (clip?.startMs ?? 0) + (clip?.inPointMs ?? 0);
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

        el.playbackRate = clip?.speedMultiplier ?? 1;

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
      clipById,
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
