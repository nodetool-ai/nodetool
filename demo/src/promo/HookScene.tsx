/**
 * Scene 1 — the hook. The finished trailer plays full-frame for ~1.5s, then
 * scales down toward the timeline editor's preview monitor while the real
 * editor (final state of the Act-2 cast) fades in behind it: the pull-back
 * from "a film" to "the app that made it".
 */
import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
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

/** Cast time (ms) showing the finished cut in the editor behind the hook. */
const FINAL_CUT_MS = 16600;

export const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const onPendingMedia = usePendingMediaDelay("hook");

  // Full-frame drift, then the pull-back into the monitor.
  const drift = interpolate(frame, [0, 50], [1.05, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const pull = easeOutProgress(frame, 44, 88);

  const tracksHeightPx = Math.round(height * 0.3);
  // Approximate center of the preview monitor in the editor behind.
  const monitorCx = width * 0.5;
  const monitorCy = (height - tracksHeightPx) * 0.47;
  const targetScale = 0.44;

  const scale = interpolate(pull, [0, 1], [drift, targetScale]);
  const tx = interpolate(pull, [0, 1], [0, monitorCx - width / 2]);
  const ty = interpolate(pull, [0, 1], [0, monitorCy - height / 2]);
  const radius = interpolate(pull, [0, 1], [0, 18]);

  const editorOpacity = easeOutProgress(frame, 40, 72);
  const videoVolume = interpolate(frame, [0, 60, 92], [1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: PROMO_BG }}>
      <AbsoluteFill style={{ opacity: editorOpacity }}>
        <TimelineDemoPlayer
          cast={promoTimelineCast}
          timeMs={FINAL_CUT_MS}
          resolveAssetUrl={resolvePromoAsset}
          tracksHeightPx={tracksHeightPx}
          onPendingMedia={onPendingMedia}
        />
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          borderRadius: radius,
          overflow: "hidden",
          boxShadow:
            pull > 0.05 ? "0 30px 90px rgba(0,0,0,0.75)" : undefined,
        }}
      >
        <OffthreadVideo
          src={resolvePromoAsset("hook.mp4")}
          volume={videoVolume}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>

      <Headline from={46} to={94} text="Made in NodeTool. Start to finish." />
    </AbsoluteFill>
  );
};
