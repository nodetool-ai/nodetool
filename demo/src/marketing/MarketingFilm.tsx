import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  OffthreadVideo,
  Series,
  staticFile,
  useCurrentFrame
} from "remotion";
import { useInterFont } from "../promo/fonts";
import {
  PROMO_ACCENT_GRADIENT,
  PROMO_BG,
  PROMO_FONT,
  PROMO_FONT_MONO,
  PROMO_FUCHSIA,
  PROMO_TEXT,
  PROMO_TEXT_DIM
} from "../promo/theme";
import {
  editFrames,
  MARKETING_FPS,
  shotFrames,
  type MarketingEdit,
  type MarketingShot
} from "./catalog";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const EASE = Easing.bezier(0.22, 1, 0.36, 1);

interface ShotProps {
  readonly shot: MarketingShot;
  readonly slug: string;
  readonly index: number;
}

function Shot({ shot, slug, index }: ShotProps): React.JSX.Element {
  const frame = useCurrentFrame();
  const duration = shotFrames(shot);
  const [x, y, width, height] = shot.crop;
  const fit = Math.min(1664 / width, 688 / height);
  const panelWidth = width * fit;
  const panelHeight = height * fit;
  const arrival = interpolate(frame, [0, 20], [0, 1], {
    ...CLAMP,
    easing: EASE
  });
  const exit = interpolate(frame, [duration - 7, duration - 1], [1, 0], CLAMP);
  const drift = interpolate(
    frame,
    [20, Math.max(21, duration - 8)],
    [1, 1.035],
    { ...CLAMP, easing: Easing.inOut(Easing.cubic) }
  );

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 96,
          top: 103,
          right: 96,
          overflow: "hidden"
        }}
      >
        <div
          style={{
            fontSize: 60,
            lineHeight: 1.12,
            fontWeight: 600,
            letterSpacing: -2,
            translate: `0 ${interpolate(frame, [0, 17], [76, 0], { ...CLAMP, easing: EASE })}px`,
            opacity: exit
          }}
        >
          {shot.title}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 98,
          top: 187,
          color: PROMO_TEXT_DIM,
          fontSize: 27,
          opacity: interpolate(frame, [6, 23], [0, 1], CLAMP) * exit,
          translate: `0 ${interpolate(frame, [6, 24], [14, 0], { ...CLAMP, easing: EASE })}px`
        }}
      >
        {shot.detail}
      </div>

      <div
        style={{
          position: "absolute",
          inset: "267px 0 80px",
          perspective: 1800
        }}
      >
        <div
          style={{
            position: "absolute",
            left: (1920 - panelWidth) / 2,
            top: (733 - panelHeight) / 2,
            width: panelWidth,
            height: panelHeight,
            borderRadius: 20,
            opacity: arrival * exit,
            transform: `translateY(${(1 - arrival) * 38}px) rotateX(${(1 - arrival) * 3}deg) rotateY(${(1 - arrival) * (index % 2 === 0 ? -2 : 2)}deg) scale(${drift})`,
            boxShadow:
              "0 32px 80px rgba(0,0,0,0.55), 0 0 64px rgba(232,121,249,0.08)",
            border: "1px solid rgba(148,163,184,0.28)",
            overflow: "hidden",
            background: PROMO_BG
          }}
        >
          <AbsoluteFill
            style={{
              filter: `blur(${interpolate(frame, [0, 12], [5, 0], CLAMP)}px)`
            }}
          >
            <OffthreadVideo
              src={staticFile(`casts/marketing/${slug}.mp4`)}
              trimBefore={Math.round(shot.start * MARKETING_FPS)}
              playbackRate={
                (Math.round(shot.end * MARKETING_FPS) -
                  Math.round(shot.start * MARKETING_FPS)) /
                duration
              }
              muted
              style={{
                position: "absolute",
                maxWidth: "none",
                width: 1920 * fit,
                height: 1080 * fit,
                left: -x * fit,
                top: -y * fit
              }}
            />
          </AbsoluteFill>
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              backgroundImage: PROMO_ACCENT_GRADIENT,
              transformOrigin: "left",
              scale: `${arrival} 1`,
              opacity: 0.65
            }}
          />
          <AbsoluteFill
            style={{
              pointerEvents: "none",
              background:
                "linear-gradient(110deg, transparent 35%, rgba(255,255,255,0.07) 49%, transparent 62%)",
              translate: `${interpolate(frame, [0, 32], [-120, 120], CLAMP)}% 0`,
              opacity: interpolate(frame, [0, 10, 32], [0, 1, 0], CLAMP)
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
}

export function MarketingFilm({
  edit
}: {
  readonly edit: MarketingEdit;
}): React.JSX.Element {
  useInterFont();
  const frame = useCurrentFrame();
  const total = editFrames(edit);
  let cursor = 0;
  const markers = edit.shots.map((shot) => {
    const from = cursor;
    cursor += shotFrames(shot);
    return { from, to: cursor, title: shot.title };
  });

  return (
    <AbsoluteFill
      style={{
        background: PROMO_BG,
        color: PROMO_TEXT,
        fontFamily: PROMO_FONT,
        overflow: "hidden"
      }}
    >
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 18% 78%, rgba(232,121,249,0.12), transparent 55%), radial-gradient(ellipse at 86% 20%, rgba(251,113,133,0.07), transparent 52%)",
          scale: 1.1,
          translate: `${Math.sin(frame / 150) * 16}px ${Math.cos(frame / 170) * 10}px`
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 98,
          right: 98,
          top: 49,
          display: "flex",
          justifyContent: "space-between",
          fontFamily: PROMO_FONT_MONO,
          fontSize: 17,
          letterSpacing: 3,
          color: PROMO_TEXT_DIM
        }}
      >
        <span style={{ color: PROMO_FUCHSIA }}>{edit.category}</span>
        <span>NODETOOL</span>
      </div>
      <Series>
        {edit.shots.map((shot, index) => (
          <Series.Sequence key={shot.start} durationInFrames={shotFrames(shot)}>
            <Shot shot={shot} slug={edit.slug} index={index} />
          </Series.Sequence>
        ))}
      </Series>
      <div
        style={{
          position: "absolute",
          left: 98,
          right: 98,
          bottom: 41,
          display: "flex",
          gap: 8
        }}
      >
        {markers.map((marker) => (
          <div
            key={marker.from}
            style={{
              flex: marker.to - marker.from,
              height: 3,
              background: "rgba(148,163,184,0.16)",
              overflow: "hidden",
              borderRadius: 4
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                backgroundImage: PROMO_ACCENT_GRADIENT,
                transformOrigin: "left",
                scale: `${interpolate(frame, [marker.from, marker.to - 1], [0, 1], CLAMP)} 1`
              }}
            />
          </div>
        ))}
      </div>
      <AbsoluteFill
        style={{
          background: PROMO_BG,
          opacity: Math.max(
            interpolate(frame, [0, 8], [1, 0], CLAMP),
            interpolate(frame, [total - 8, total - 1], [0, 1], CLAMP)
          )
        }}
      />
    </AbsoluteFill>
  );
}
