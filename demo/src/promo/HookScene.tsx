/**
 * Scene 1 — the hook. The finished trailer plays full-frame for ~1.5s, then
 * shrinks onto the timeline editor's preview monitor while the real editor
 * (final state of the Act-2 cast) fades in behind it: the pull-back from
 * "a film" to "the app that made it".
 *
 * The landing is exact: the monitor's canvas rect is measured from the
 * player's DOM (held with delayRender until layout settles), and the cast
 * parks its playhead inside the opening drift clip so the monitor shows the
 * same footage the full-frame film is playing when the two meet.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { TimelineDemoPlayer, promoTimelineCast } from "@web-demo";
import { usePendingMediaDelay } from "./usePendingMediaDelay";
import { Headline } from "./overlays";
import { easeOutProgress } from "./helpers";
import { PROMO_BG } from "./theme";

const resolvePromoAsset = (file: string): string =>
  staticFile(`casts/promo/${file}`);

/** Cast time (ms) showing the finished cut with the playhead parked on the
 *  drift clip (see the final `seek` event in promoTimelineCast). */
const FINAL_CUT_MS = 16950;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The preview monitor's on-screen rect, measured from the player's canvas
 * and normalized into composition pixels (the Studio preview scales the page
 * with a CSS transform; headless rendering is 1:1). Holds the first frame
 * open until layout settles; falls back to a centered 16:9 estimate if the
 * canvas never reports a size.
 */
function useMonitorRect(
  hostRef: React.RefObject<HTMLDivElement | null>,
  compositionWidth: number,
  fallback: Rect
): Rect {
  const [rect, setRect] = useState<Rect | null>(null);
  const [handle] = useState(() => delayRender("hook: measure monitor rect"));

  useEffect(() => {
    let tries = 0;
    let raf = 0;
    let done = false;
    let previous: Rect | null = null;
    const finish = () => {
      if (!done) {
        done = true;
        continueRender(handle);
      }
    };
    // The player DOM holds several canvases (clip waveforms, thumbnail
    // scratch surfaces, and un-laid-out canvases at the 300×150 default).
    // The monitor is the large one at the sequence's 16:9 aspect; require
    // two identical measurements so a mid-resize rect is never accepted.
    const findMonitor = (host: HTMLElement): DOMRect | null => {
      let best: DOMRect | null = null;
      for (const canvas of host.querySelectorAll("canvas")) {
        const r = canvas.getBoundingClientRect();
        if (r.width < 100 || r.height < 60) continue;
        if (Math.abs(r.width / r.height - 16 / 9) > 0.06) continue;
        if (!best || r.width * r.height > best.width * best.height) best = r;
      }
      return best;
    };
    const measure = () => {
      const host = hostRef.current;
      const r = host ? findMonitor(host) : null;
      if (host && r) {
        const hostRect = host.getBoundingClientRect();
        if (hostRect.width > 0) {
          const scale = hostRect.width / compositionWidth;
          const next: Rect = {
            x: (r.x - hostRect.x) / scale,
            y: (r.y - hostRect.y) / scale,
            w: r.width / scale,
            h: r.height / scale,
          };
          if (
            previous &&
            Math.abs(previous.x - next.x) < 1 &&
            Math.abs(previous.y - next.y) < 1 &&
            Math.abs(previous.w - next.w) < 1 &&
            Math.abs(previous.h - next.h) < 1
          ) {
            setRect(next);
            finish();
            return;
          }
          previous = next;
        }
      }
      if (++tries > 300) {
        finish(); // keep the fallback rect rather than hang the render
        return;
      }
      raf = requestAnimationFrame(measure);
    };
    measure();
    return () => {
      cancelAnimationFrame(raf);
      finish();
    };
  }, [hostRef, compositionWidth, handle]);

  return rect ?? fallback;
}

export const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const onPendingMedia = usePendingMediaDelay("hook");
  const hostRef = useRef<HTMLDivElement>(null);

  const tracksHeightPx = Math.round(height * 0.3);
  // Estimate in case measuring fails: a 16:9 fit inside the preview area.
  const previewH = height - tracksHeightPx - 40;
  const fitH = Math.min(previewH, (width * 9) / 16);
  const fitW = (fitH * 16) / 9;
  const monitor = useMonitorRect(hostRef, width, {
    x: (width - fitW) / 2,
    y: 0,
    w: fitW,
    h: fitH,
  });

  // Full-frame drift, then the pull-back onto the monitor.
  const drift = interpolate(frame, [0, 50], [1.05, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const pull = easeOutProgress(frame, 44, 88);

  const left = interpolate(pull, [0, 1], [0, monitor.x]);
  const top = interpolate(pull, [0, 1], [0, monitor.y]);
  const boxW = interpolate(pull, [0, 1], [width, monitor.w]);
  const boxH = interpolate(pull, [0, 1], [height, monitor.h]);
  const radius = interpolate(pull, [0, 1], [0, 6]);

  const editorOpacity = easeOutProgress(frame, 40, 72);
  const videoVolume = interpolate(frame, [0, 60, 92], [1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: PROMO_BG }}>
      <AbsoluteFill ref={hostRef} style={{ opacity: editorOpacity }}>
        <TimelineDemoPlayer
          cast={promoTimelineCast}
          timeMs={FINAL_CUT_MS}
          resolveAssetUrl={resolvePromoAsset}
          tracksHeightPx={tracksHeightPx}
          onPendingMedia={onPendingMedia}
        />
      </AbsoluteFill>

      <div
        style={{
          position: "absolute",
          left,
          top,
          width: boxW,
          height: boxH,
          borderRadius: radius,
          overflow: "hidden",
          boxShadow:
            pull > 0.05 ? "0 30px 90px rgba(0,0,0,0.75)" : undefined,
        }}
      >
        <OffthreadVideo
          src={resolvePromoAsset("hook.mp4")}
          volume={videoVolume}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${drift})`,
          }}
        />
      </div>

      <Headline from={46} to={94} text="Made in NodeTool. Start to finish." />
    </AbsoluteFill>
  );
};
