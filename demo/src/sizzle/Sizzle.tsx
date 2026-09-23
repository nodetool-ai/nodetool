/**
 * The sizzle cut: a 25-second, beat-cut brand spot for social and launches.
 *
 * Cut to the trailer score (136 BPM). The score has a hit at 4.1 s, a
 * silence from 6.5 s, and a drop at 8.15 s, and the picture follows it:
 *
 *   Open      0–4.1 s    "Every model. One canvas." over the takes
 *   Hit       4.1 s      the mark slams in
 *   Brief     6.5–8.15   one sentence is typed into the quiet
 *   Montage   8.15 s     seven product surfaces, one per bar
 *   Honesty   four beats, four words-cards
 *   Close     mark, tagline, URL
 *
 * Every surface shot replays a real cast through the real product UI, sped
 * up. Replay is a deterministic seek, so compression costs nothing.
 */
import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  ChatDemoPlayer,
  DemoPlayer,
  DocDemoPlayer,
  TimelineDemoPlayer,
  HERO_BRIEF,
  heroBriefCast,
  heroStoryboardCast,
  heroTimelineCast,
  promoTrailerCast,
} from "@web-demo";

import { getDocCast } from "../casts/docRegistry";
import { useInterFont } from "../promo/fonts";
import { frameRect } from "../promo/helpers";
import { usePendingMediaDelay } from "../promo/usePendingMediaDelay";
import {
  PROMO_ACCENT_GRADIENT,
  PROMO_FONT,
  PROMO_TEXT,
  PROMO_TEXT_DIM,
} from "../promo/theme";

export const SIZZLE_FPS = 30;

const BEAT_S = 60 / 136;
const DROP_S = 8.15;
/** The frame of beat `k`, counted from the drop. */
const beat = (k: number): number =>
  Math.round((DROP_S + k * BEAT_S) * SIZZLE_FPS);

const HIT = Math.round(4.09 * SIZZLE_FPS);
const BRIEF_FROM = Math.round(6.4 * SIZZLE_FPS);
const DROP = beat(0);
const HONESTY_FROM = beat(28);
const CLOSE_FROM = beat(32);
const MUSIC_END = Math.round(24.32 * SIZZLE_FPS);
export const SIZZLE_DURATION_FRAMES = MUSIC_END + 36;

const BG = "#04060d";
const TAKES = ["take-rider", "take-sparks", "take-drift", "take-wheel", "take-blower", "shot-chained"];

const asset = (file: string): string => staticFile(`casts/promo/${file}`);

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const expoOut = Easing.out(Easing.exp);

// ─── Shared pieces ──────────────────────────────────────────────────────────

/** Two slow colour fields and a grain layer, under everything. */
const Backdrop: React.FC<{ energy?: number }> = ({ energy = 1 }) => {
  const frame = useCurrentFrame();
  const a = frame / 90;
  return (
    <AbsoluteFill style={{ background: BG, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          opacity: 0.55 * energy,
          background: `radial-gradient(40% 50% at ${30 + Math.sin(a) * 12}% ${35 + Math.cos(a * 0.7) * 10}%, rgba(232,121,249,0.35), transparent 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          opacity: 0.45 * energy,
          background: `radial-gradient(45% 45% at ${72 + Math.cos(a * 0.8) * 10}% ${70 + Math.sin(a * 0.6) * 8}%, rgba(251,113,133,0.3), transparent 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          opacity: 0.5,
          backgroundImage:
            "linear-gradient(rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.06) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
          maskImage: "radial-gradient(70% 70% at 50% 50%, black, transparent)",
        }}
      />
    </AbsoluteFill>
  );
};

/** A white flash that decays over a few frames, on each cut. */
const Flash: React.FC<{ strength?: number; frames?: number }> = ({
  strength = 0.55,
  frames = 6,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, frames], [strength, 0], clamp);
  if (opacity <= 0) {
    return null;
  }
  return <AbsoluteFill style={{ background: "#fff", opacity, mixBlendMode: "screen" }} />;
};

/** A word that lands hard: scale down from oversize, blur to sharp. */
const Slam: React.FC<{
  text: string;
  size?: number;
  gradient?: boolean;
  at?: number;
}> = ({ text, size = 190, gradient = false, at = 0 }) => {
  const frame = useCurrentFrame() - at;
  if (frame < 0) {
    return null;
  }
  const t = interpolate(frame, [0, 7], [0, 1], { ...clamp, easing: expoOut });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          fontFamily: PROMO_FONT,
          fontWeight: 800,
          fontSize: size,
          letterSpacing: -size * 0.045,
          lineHeight: 1,
          color: PROMO_TEXT,
          textAlign: "center",
          transform: `scale(${1.45 - 0.45 * t})`,
          filter: `blur(${(1 - t) * 14}px)`,
          opacity: Math.min(1, frame / 2),
          textShadow: gradient ? undefined : "0 10px 60px rgba(0,0,0,0.6)",
          ...(gradient
            ? {
                backgroundImage: PROMO_ACCENT_GRADIENT,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }
            : {}),
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

/** The mark and wordmark, side by side. */
const Mark: React.FC<{ size: number }> = ({ size }) => (
  <div style={{ display: "flex", alignItems: "center", gap: size * 0.28 }}>
    <Img src={asset("logo.png")} style={{ width: size, height: size }} />
    <div
      style={{
        fontFamily: PROMO_FONT,
        fontWeight: 800,
        fontSize: size * 0.82,
        letterSpacing: -size * 0.035,
        color: PROMO_TEXT,
        lineHeight: 1,
      }}
    >
      NodeTool
    </div>
  </div>
);

// ─── Open ───────────────────────────────────────────────────────────────────

/** The six takes pop into a grid, then collapse to a point at the hit. */
const Open: React.FC = () => {
  const frame = useCurrentFrame();
  const collapse = interpolate(frame, [96, HIT], [0, 1], {
    ...clamp,
    easing: Easing.in(Easing.cubic),
  });
  const cellW = 560;
  const cellH = 315;
  const gap = 24;
  return (
    <AbsoluteFill>
      <Backdrop energy={0.6} />
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${interpolate(frame, [25, 96], [1.08, 1], clamp) * (1 - collapse * 0.92)}) rotate(${collapse * -8}deg)`,
          opacity: 1 - collapse * 0.6,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(3, ${cellW}px)`,
            gap,
          }}
        >
          {TAKES.map((take, i) => {
            const at = 25 + i * 4;
            const t = interpolate(frame, [at, at + 8], [0, 1], { ...clamp, easing: expoOut });
            return (
              <div
                key={take}
                style={{
                  width: cellW,
                  height: cellH,
                  borderRadius: 18,
                  overflow: "hidden",
                  opacity: t * 0.5,
                  transform: `scale(${0.7 + 0.3 * t})`,
                  boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
                }}
              >
                <Sequence from={at} layout="none">
                  <OffthreadVideo
                    src={asset(`${take}.webm`)}
                    muted
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </Sequence>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: 1 - collapse }}>
        <Sequence from={2} durationInFrames={23}>
          <Slam text="Every model." />
        </Sequence>
        <Sequence from={25}>
          <Slam text="One canvas." />
        </Sequence>
      </AbsoluteFill>
      <Sequence from={25}>
        <Flash strength={0.35} />
      </Sequence>
    </AbsoluteFill>
  );
};

// ─── Hit ────────────────────────────────────────────────────────────────────

const Hit: React.FC = () => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [0, 10], [0, 1], { ...clamp, easing: expoOut });
  const ring = interpolate(frame, [0, 24], [0, 1], { ...clamp, easing: expoOut });
  const tagline = interpolate(frame, [18, 30], [0, 1], { ...clamp, easing: expoOut });
  const out = interpolate(frame, [BRIEF_FROM - HIT - 8, BRIEF_FROM - HIT], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Backdrop energy={1.4} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            position: "absolute",
            width: 1800 * ring,
            height: 1800 * ring,
            borderRadius: "50%",
            border: `${6 * (1 - ring) + 1}px solid rgba(232,121,249,${0.8 * (1 - ring)})`,
          }}
        />
        <div
          style={{
            transform: `scale(${(1.6 - 0.6 * t) * interpolate(frame, [10, 80], [1, 1.04], clamp)})`,
            filter: `blur(${(1 - t) * 18}px)`,
          }}
        >
          <Mark size={170} />
        </div>
        <div
          style={{
            position: "absolute",
            top: 660,
            fontFamily: PROMO_FONT,
            fontWeight: 500,
            fontSize: 40,
            color: PROMO_TEXT_DIM,
            opacity: tagline,
            transform: `translateY(${(1 - tagline) * 20}px)`,
            letterSpacing: -0.5,
          }}
        >
          The open-source, agent-first creative workspace.
        </div>
      </AbsoluteFill>
      <Flash strength={0.9} frames={10} />
    </AbsoluteFill>
  );
};

// ─── Brief ──────────────────────────────────────────────────────────────────

/** The quiet before the drop: the project's one sentence, typed. */
const Brief: React.FC = () => {
  const frame = useCurrentFrame();
  const length = DROP - BRIEF_FROM;
  const chars = Math.round(
    interpolate(frame, [4, length - 10], [0, HERO_BRIEF.length], clamp)
  );
  const caret = Math.floor(frame / 8) % 2 === 0 || chars < HERO_BRIEF.length;
  const push = interpolate(frame, [0, length], [1, 1.06], clamp);
  return (
    <AbsoluteFill>
      <Backdrop energy={0.35} />
      <AbsoluteFill
        style={{ alignItems: "center", justifyContent: "center", transform: `scale(${push})` }}
      >
        <div
          style={{
            width: 1460,
            padding: "40px 52px",
            borderRadius: 28,
            background: "rgba(15,23,42,0.85)",
            border: "1px solid rgba(148,163,184,0.25)",
            boxShadow: "0 40px 120px rgba(0,0,0,0.6), 0 0 0 1px rgba(232,121,249,0.08)",
            fontFamily: PROMO_FONT,
            fontSize: 50,
            fontWeight: 500,
            lineHeight: 1.3,
            letterSpacing: -0.8,
            color: PROMO_TEXT,
            minHeight: 130,
          }}
        >
          {HERO_BRIEF.slice(0, chars)}
          <span
            style={{
              display: "inline-block",
              width: 4,
              height: 54,
              marginLeft: 4,
              verticalAlign: "-8px",
              background: "#e879f9",
              opacity: caret ? 1 : 0,
            }}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─── Montage ────────────────────────────────────────────────────────────────

const SHOT_FRAMES = beat(4) - beat(0);

/**
 * A product surface in a floating, tilted window. The surface is laid out at
 * `logicalWidth` CSS pixels and scaled into the window, so the UI reads at a
 * size a viewer can take in during one bar.
 */
const Window: React.FC<{
  logicalWidth: number;
  tilt: 1 | -1;
  length: number;
  children: React.ReactNode;
}> = ({ logicalWidth, tilt, length, children }) => {
  const frame = useCurrentFrame();
  const W = 1560;
  const H = 878;
  const zoom = W / logicalWidth;
  const enter = interpolate(frame, [0, 9], [0, 1], { ...clamp, easing: expoOut });
  const drift = interpolate(frame, [0, length], [0, 1], clamp);
  // A small bump on the bar's third beat keeps the shot on the music.
  const bump = interpolate(
    frame - Math.round(2 * BEAT_S * SIZZLE_FPS),
    [0, 2, 10],
    [0, 1, 0],
    clamp
  );
  const rotY = tilt * (14 * (1 - enter) + 7 - 6 * drift);
  const rotX = 6 - 3 * drift;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", perspective: 2400 }}>
      <div
        style={{
          width: W,
          height: H,
          borderRadius: 22,
          overflow: "hidden",
          background: "#0b1020",
          border: "1px solid rgba(148,163,184,0.25)",
          boxShadow:
            "0 60px 160px rgba(0,0,0,0.7), 0 0 120px rgba(232,121,249,0.12)",
          transform: `translateX(${tilt * -160 * (1 - enter)}px) translateY(-20px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(${(1.14 - 0.14 * enter + 0.05 * drift) * (1 + 0.015 * bump)})`,
          filter: `blur(${(1 - enter) * 10}px)`,
        }}
      >
        <div
          style={{
            width: logicalWidth,
            height: H / zoom,
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** The shot's name, large in the lower left, with a counter. */
const ShotLabel: React.FC<{ index: number; total: number; word: string; line: string }> = ({
  index,
  total,
  word,
  line,
}) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [2, 10], [0, 1], { ...clamp, easing: expoOut });
  return (
    <AbsoluteFill style={{ fontFamily: PROMO_FONT, pointerEvents: "none" }}>
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to top, rgba(4,6,13,0.9) 0%, rgba(4,6,13,0.4) 22%, transparent 40%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 90,
          bottom: 70,
          transform: `translateX(${(1 - t) * -60}px)`,
          opacity: t,
        }}
      >
        <div
          style={{
            fontSize: 150,
            fontWeight: 800,
            letterSpacing: -7,
            lineHeight: 0.95,
            color: PROMO_TEXT,
            textShadow: "0 8px 50px rgba(0,0,0,0.7)",
          }}
        >
          {word}
        </div>
        <div
          style={{
            marginTop: 14,
            display: "flex",
            alignItems: "center",
            gap: 18,
            fontSize: 34,
            fontWeight: 500,
            color: PROMO_TEXT,
            opacity: 0.85,
          }}
        >
          <div
            style={{
              width: 64 * t,
              height: 6,
              borderRadius: 3,
              backgroundImage: PROMO_ACCENT_GRADIENT,
            }}
          />
          {line}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          right: 90,
          top: 64,
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: 2,
          color: PROMO_TEXT_DIM,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </div>
    </AbsoluteFill>
  );
};

/** Maps the shot's frames onto a slice of a cast's clock. */
const useCastMs = (fromMs: number, toMs: number): number =>
  interpolate(useCurrentFrame(), [0, SHOT_FRAMES], [fromMs, toMs], clamp);

const ChatShot: React.FC = () => (
  <ChatDemoPlayer cast={heroBriefCast} timeMs={useCastMs(1500, 11400)} />
);

const BoardShot: React.FC<{ fromMs: number; toMs: number }> = ({ fromMs, toMs }) => {
  const frame = useCurrentFrame();
  const onPendingMedia = usePendingMediaDelay("sizzle-board");
  return (
    <DocDemoPlayer
      cast={heroStoryboardCast}
      timeMs={useCastMs(fromMs, toMs)}
      resolveAssetUrl={asset}
      mediaTimeMs={(frame / SIZZLE_FPS) * 1000}
      onPendingMedia={onPendingMedia}
    />
  );
};

/** The graph canvas, framed on the four takes as they render. */
const CanvasShot: React.FC = () => {
  const onPendingMedia = usePendingMediaDelay("sizzle-canvas");
  const viewport = frameRect({ x0: -60, y0: 10, x1: 1215, y1: 995 }, 1920, 1080, 70, 1.3);
  return (
    <DemoPlayer
      cast={promoTrailerCast}
      timeMs={useCastMs(2600, 9400)}
      resolveAssetUrl={asset}
      viewport={viewport}
      onPendingMedia={onPendingMedia}
    />
  );
};

const DocShot: React.FC<{ castId: string; fromMs: number; toMs: number }> = ({
  castId,
  fromMs,
  toMs,
}) => <DocDemoPlayer cast={getDocCast(castId)} timeMs={useCastMs(fromMs, toMs)} />;

const CutShot: React.FC = () => {
  const onPendingMedia = usePendingMediaDelay("sizzle-cut");
  return (
    <TimelineDemoPlayer
      cast={heroTimelineCast}
      timeMs={useCastMs(200, 11400)}
      resolveAssetUrl={asset}
      tracksHeightPx={300}
      onPendingMedia={onPendingMedia}
      chrome={false}
    />
  );
};

type MontageShot = {
  word: string;
  line: string;
  logicalWidth: number;
  render: () => React.ReactNode;
};

const SHOTS: MontageShot[] = [
  { word: "Direct.", line: "An agent plans the whole project", logicalWidth: 1040, render: () => <ChatShot /> },
  { word: "Board.", line: "Pre-vis every shot before you spend", logicalWidth: 1440, render: () => <BoardShot fromMs={700} toMs={7600} /> },
  { word: "Render.", line: "Stills become clips, in place", logicalWidth: 1440, render: () => <BoardShot fromMs={7600} toMs={18400} /> },
  { word: "Compare.", line: "Seedance · Wan · any model, your keys", logicalWidth: 1920, render: () => <CanvasShot /> },
  { word: "Paint.", line: "Layers, masks and diffusion", logicalWidth: 1700, render: () => <DocShot castId="sketch-assistant" fromMs={500} toMs={14800} /> },
  { word: "Voice.", line: "The script is the source of truth", logicalWidth: 1400, render: () => <DocShot castId="script-assistant" fromMs={600} toMs={18000} /> },
  { word: "Cut.", line: "Generate at the playhead", logicalWidth: 1600, render: () => <CutShot /> },
];

const Montage: React.FC = () => (
  <>
    {SHOTS.map((shot, i) => {
      const from = beat(i * 4) - DROP;
      const length = beat(i * 4 + 4) - beat(i * 4);
      return (
        <Sequence key={shot.word} from={from} durationInFrames={length} name={`Shot ${shot.word}`}>
          <Backdrop energy={1} />
          <Window logicalWidth={shot.logicalWidth} tilt={i % 2 === 0 ? 1 : -1} length={length}>
            {shot.render()}
          </Window>
          <ShotLabel index={i} total={SHOTS.length} word={shot.word} line={shot.line} />
          <Flash strength={i === 0 ? 0.7 : 0.22} frames={i === 0 ? 10 : 4} />
        </Sequence>
      );
    })}
  </>
);

// ─── Honesty ────────────────────────────────────────────────────────────────

const HONESTY = ["Your keys.", "No credits.", "No markup.", "Open source."];

const Honesty: React.FC = () => (
  <>
    {HONESTY.map((word, i) => {
      const from = beat(28 + i) - HONESTY_FROM;
      const length = beat(29 + i) - beat(28 + i);
      return (
        <Sequence key={word} from={from} durationInFrames={length}>
          <AbsoluteFill style={{ background: BG }}>
            <AbsoluteFill style={{ opacity: 0.28 }}>
              <OffthreadVideo
                src={asset(`${TAKES[i]}.webm`)}
                muted
                trimBefore={20}
                style={{ width: "100%", height: "100%", objectFit: "cover", filter: "saturate(1.2)" }}
              />
            </AbsoluteFill>
            <AbsoluteFill
              style={{ background: "radial-gradient(60% 60% at 50% 50%, rgba(4,6,13,0.4), rgba(4,6,13,0.9))" }}
            />
            <Slam text={word} size={220} gradient={i === 3} />
            <Flash strength={0.18} frames={3} />
          </AbsoluteFill>
        </Sequence>
      );
    })}
  </>
);

// ─── Close ──────────────────────────────────────────────────────────────────

const Close: React.FC = () => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [0, 10], [0, 1], { ...clamp, easing: expoOut });
  const sub = interpolate(frame, [10, 22], [0, 1], { ...clamp, easing: expoOut });
  const cta = interpolate(frame, [20, 32], [0, 1], { ...clamp, easing: expoOut });
  const end = SIZZLE_DURATION_FRAMES - CLOSE_FROM;
  const fade = interpolate(frame, [end - 14, end], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <Backdrop energy={1.2} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        <div
          style={{
            transform: `scale(${(1.3 - 0.3 * t) * interpolate(frame, [10, end], [1, 1.04], clamp)})`,
            filter: `blur(${(1 - t) * 14}px)`,
          }}
        >
          <Mark size={150} />
        </div>
        <div
          style={{
            marginTop: 44,
            fontFamily: PROMO_FONT,
            fontWeight: 600,
            fontSize: 64,
            letterSpacing: -2,
            opacity: sub,
            transform: `translateY(${(1 - sub) * 24}px)`,
            backgroundImage: PROMO_ACCENT_GRADIENT,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Every model. One canvas. Yours.
        </div>
        <div
          style={{
            marginTop: 40,
            padding: "16px 34px",
            borderRadius: 999,
            border: "1px solid rgba(248,250,252,0.3)",
            fontFamily: PROMO_FONT,
            fontWeight: 500,
            fontSize: 34,
            color: PROMO_TEXT,
            opacity: cta,
            transform: `translateY(${(1 - cta) * 20}px)`,
          }}
        >
          Free &amp; open source · nodetool.ai
        </div>
      </AbsoluteFill>
      <Flash strength={0.8} frames={10} />
    </AbsoluteFill>
  );
};

// ─── Composition ────────────────────────────────────────────────────────────

export const Sizzle: React.FC = () => {
  useInterFont();
  const { durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: BG }}>
      <Sequence from={0} durationInFrames={HIT} name="Open">
        <Open />
      </Sequence>
      <Sequence from={HIT} durationInFrames={BRIEF_FROM - HIT} name="Hit">
        <Hit />
      </Sequence>
      <Sequence from={BRIEF_FROM} durationInFrames={DROP - BRIEF_FROM} name="Brief">
        <Brief />
      </Sequence>
      <Sequence from={DROP} durationInFrames={HONESTY_FROM - DROP} name="Montage">
        <Montage />
      </Sequence>
      <Sequence from={HONESTY_FROM} durationInFrames={CLOSE_FROM - HONESTY_FROM} name="Honesty">
        <Honesty />
      </Sequence>
      <Sequence from={CLOSE_FROM} durationInFrames={durationInFrames - CLOSE_FROM} name="Close">
        <Close />
      </Sequence>
      <Audio
        src={asset("trailer-music.mp3")}
        volume={(f) => interpolate(f, [0, 3, MUSIC_END - 20, MUSIC_END], [0, 0.9, 0.9, 0], clamp)}
      />
    </AbsoluteFill>
  );
};
