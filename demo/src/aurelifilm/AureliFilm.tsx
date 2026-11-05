/**
 * Marketing film for the Comfy "Open Source Higgsfield" story: the AURELI
 * coffee ad, from cast to cut, in NodeTool on ComfyUI.
 *
 * The surfaces are drawn and sped up. The footage is real: the film's shots were
 * rendered with open-weights LTX-2.3 on Comfy Cloud from a first and a last
 * frame, with the graph shown in the Graph beat. The Camera beat uses first-frame-only
 * LTX-2.3 and the Filters beat uses Runway Aleph 2 through Comfy.
 */
import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame
} from "remotion";

import { useInterFont } from "../promo/fonts";
import { C as THEME, FONT, MONO, R } from "../heroflow/theme";

export const FPS = 30;

/** Colors of the NodeTool logo, blue through violet to coral. */
const BRAND = { blue: "#4FA0E4", violet: "#A371F0", coral: "#FF5F6D" };
const BRAND_GRADIENT = `linear-gradient(100deg, ${BRAND.blue}, ${BRAND.violet} 50%, ${BRAND.coral})`;
const C = { ...THEME, fuchsia: BRAND.coral, video: BRAND.violet, image: BRAND.blue };

const asset = (file: string): string => staticFile(`casts/aureli/${file}`);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = (f: number, a: number, b: number): number => {
  const x = interpolate(f, [a, b], [0, 1], clamp);
  return 1 - (1 - x) * (1 - x) * (1 - x);
};

const SHOTS = [
  { id: "s1a", name: "Café", move: "Push in", seconds: 2.7 },
  { id: "s1b", name: "Hands", move: "Tilt up", seconds: 3 },
  { id: "s2", name: "Through the mist", move: "Drift forward", seconds: 8 },
  { id: "s3", name: "Under the canopy", move: "Sink", seconds: 4 },
  { id: "s4b", name: "Cup", move: "Reveal", seconds: 4 },
  { id: "s5", name: "Packshot", move: "Reveal", seconds: 4 }
] as const;

const Clip: React.FC<{ id: string; rate?: number; startFrom?: number; filter?: string }> = ({
  id,
  rate,
  startFrom,
  filter
}) => (
  <OffthreadVideo
    src={asset(`ltx/${id}.mp4`)}
    muted
    playbackRate={rate}
    startFrom={startFrom}
    style={{ width: "100%", height: "100%", objectFit: "cover", filter }}
  />
);

/** Fat words that rise one by one out of a mask, and leave upward when `out` is set. */
const Kinetic: React.FC<{ text: string; size: number; delay?: number; out?: number }> = ({ text, size, delay = 0, out }) => {
  const f = useCurrentFrame();
  const words = text.split(" ");
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", columnGap: size * 0.26 }}>
      {words.map((w, i) => {
        const p = spring({ frame: f - delay - i * 3, fps: FPS, config: { damping: 18, stiffness: 150 } });
        const q = out === undefined ? 0 : ease(f, out + i * 2, out + i * 2 + 9);
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", padding: `${size * 0.06}px ${size * 0.04}px ${size * 0.14}px`, lineHeight: 1 }}>
            <span
              style={{
                display: "inline-block",
                fontSize: size,
                fontWeight: 800,
                letterSpacing: -size * 0.035,
                transform: `translateY(${(1 - p + -q) * 125}%) rotate(${(1 - p) * 7}deg)`,
                transformOrigin: "0 100%"
              }}
            >
              {w}
            </span>
          </span>
        );
      })}
    </div>
  );
};

/** Caption at the foot of a beat. */
const Line: React.FC<{ text: string; sub?: string }> = ({ text, sub }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 44, textAlign: "center", filter: "drop-shadow(0 4px 22px rgba(0,0,0,0.9))" }}>
      <Kinetic text={text} size={66} />
      {sub ? <div style={{ fontSize: 30, fontWeight: 500, opacity: ease(f, 10, 20), textShadow: "0 2px 12px rgba(0,0,0,0.95)" }}>{sub}</div> : null}
    </div>
  );
};

const Surface: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <AbsoluteFill style={{ background: C.stage, padding: "44px 70px 190px" }}>
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: C.paper,
        border: `1px solid ${C.line}`,
        borderRadius: R.xl,
        overflow: "hidden"
      }}
    >
      <div style={{ padding: "16px 26px", fontSize: 24, fontWeight: 600, borderBottom: `1px solid ${C.line}` }}>{title}</div>
      <div style={{ flex: 1, position: "relative", padding: 26, minHeight: 0 }}>{children}</div>
    </div>
  </AbsoluteFill>
);

// ─── Beats ──────────────────────────────────────────────────────────────────

const HOOK = ["s1a", "s1b", "s2", "s3", "s4b", "s5"];
const HOOK_START = [0, 0, 110, 10, 60, 60];

const Hook: React.FC = () => (
  <AbsoluteFill>
    {HOOK.map((id, i) => (
      <Sequence key={id} from={i * 30} durationInFrames={30} layout="none">
        <AbsoluteFill>
          <Clip id={id} startFrom={HOOK_START[i]} />
        </AbsoluteFill>
      </Sequence>
    ))}
    <AbsoluteFill style={{ background: "rgba(5,6,10,0.28)", alignItems: "center", justifyContent: "center", padding: "0 110px", filter: "drop-shadow(0 8px 40px rgba(0,0,0,0.75))" }}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "0 110px" }}>
        <Kinetic text="One coffee ad." size={190} delay={12} out={72} />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "0 110px" }}>
        <Kinetic text="One open-source studio." size={190} delay={86} />
      </AbsoluteFill>
    </AbsoluteFill>
  </AbsoluteFill>
);

const Logo: React.FC<{ size: number; delay: number }> = ({ size, delay }) => {
  const f = useCurrentFrame();
  const p = spring({ frame: f - delay, fps: FPS, config: { damping: 14, stiffness: 130 } });
  return <Img src={asset("logo.png")} style={{ width: size, height: size, objectFit: "contain", transform: `scale(${p}) rotate(${(1 - p) * -30}deg)` }} />;
};

const Title: React.FC = () => {
  const f = useCurrentFrame();
  const p = ease(f, 18, 32);
  return (
    <AbsoluteFill style={{ background: C.stage, alignItems: "center", justifyContent: "center" }}>
      <Logo size={210} delay={0} />
      <Kinetic text="NodeTool" size={170} delay={6} />
      <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: -1, opacity: p, transform: `translateY(${(1 - p) * 24}px)`, background: BRAND_GRADIENT, WebkitBackgroundClip: "text", color: "transparent" }}>
        The open-source AI film studio, on ComfyUI
      </div>
    </AbsoluteFill>
  );
};

const CAST = [
  { file: "frau", name: "Woman", kind: "Character" },
  { file: "tasse", name: "Cup", kind: "Prop" },
  { file: "tuete", name: "N°1 Neblina", kind: "Prop" },
  { file: "cafe", name: "Café", kind: "Location" },
  { file: "regenwald", name: "Cloud forest", kind: "Location" },
  { file: "look", name: "AURELI look", kind: "Style" }
];

const pop = (f: number, delay: number): number =>
  spring({ frame: f - delay, fps: FPS, config: { damping: 11, stiffness: 180 } });

/** Live proxy of a shot, small enough to play many at once. */
const LIVE_START: Record<string, number> = { s1b: 0, s2: 90, s3: 20 }; // skip the mist at the head of these shots
const LIVE_RATE: Record<string, number> = { s1b: 0.4, s3: 0.25 }; // keep these on their clear frames for the whole beat
const Live: React.FC<{ id: string }> = ({ id }) => (
  <OffthreadVideo src={asset(`grid/${id}.mp4`)} muted startFrom={LIVE_START[id]} playbackRate={LIVE_RATE[id]} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
);

const FLASH = 8;
// Entity index → shot index. The look wires to every shot.
const WIRES = [[0, 0], [0, 1], [1, 4], [1, 5], [2, 5], [3, 0], [4, 2], [4, 3], [5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [5, 5]];

const Cast: React.FC = () => {
  const f = useCurrentFrame();
  const flashEnd = CAST.length * FLASH;
  if (f < flashEnd) {
    const i = Math.floor(f / FLASH);
    const c = CAST[i];
    const local = f - i * FLASH;
    return (
      <AbsoluteFill style={{ background: "#000", alignItems: "center", justifyContent: "center" }}>
        <Img src={asset(`entities/${c.file}.jpg`)} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover", transform: `scale(${1.22 - local * 0.025})` }} />
        <AbsoluteFill style={{ background: `rgba(255,255,255,${interpolate(local, [0, 3], [0.7, 0], clamp)})` }} />
        <div style={{ position: "relative", fontSize: 170, fontWeight: 800, letterSpacing: -5, textShadow: "0 8px 60px rgba(0,0,0,0.95)", transform: `scale(${1.25 - pop(local, 0) * 0.25})` }}>
          {c.name}
        </div>
      </AbsoluteFill>
    );
  }
  const g = f - flashEnd;
  const W = 1840 / 6;
  const cardX = (i: number): number => 40 + (i + 0.5) * W;
  return (
    <AbsoluteFill style={{ background: C.stage }}>
      <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0 }}>
        {WIRES.map(([a, b], i) => {
          const d = `M${cardX(a)} 320 C${cardX(a)} 420 ${cardX(b)} 400 ${cardX(b)} 500`;
          const drawn = ease(g, 20 + i, 32 + i);
          return (
            <g key={i}>
              <path d={d} fill="none" stroke={C.lineStrong} strokeWidth={3} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - drawn} />
              <path d={d} fill="none" stroke={C.fuchsia} strokeWidth={6} pathLength={1} strokeDasharray="0.14 0.86" strokeDashoffset={-((g - i * 3) / 22)} opacity={drawn} style={{ filter: `drop-shadow(0 0 10px ${C.fuchsia})` }} />
            </g>
          );
        })}
      </svg>
      {CAST.map((c, i) => {
        const p = pop(g, i * 2);
        return (
          <div key={c.file} style={{ position: "absolute", left: 40 + i * W + 8, top: 36, width: W - 16, height: 284, borderRadius: R.lg, overflow: "hidden", border: `2px solid ${C.lineStrong}`, opacity: Math.min(1, p * 2), transform: `translateY(${(1 - p) * -360}px) rotate(${(1 - p) * (i % 2 ? 9 : -9)}deg)` }}>
            <Img src={asset(`entities/${c.file}.jpg`)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <div style={{ position: "absolute", left: 12, bottom: 8, fontSize: 26, fontWeight: 600, textShadow: "0 2px 10px #000" }}>{c.name}</div>
          </div>
        );
      })}
      {SHOTS.map((s, i) => {
        const p = pop(g, 28 + i * 4);
        return (
          <div key={s.id} style={{ position: "absolute", left: 40 + i * W + 8, top: 500, width: W - 16, height: 300, borderRadius: R.lg, overflow: "hidden", border: `2px solid ${C.video}`, opacity: Math.min(1, p * 2), transform: `scale(${0.4 + p * 0.6})`, boxShadow: `0 0 ${(1 - ease(g, 34 + i * 4, 56 + i * 4)) * 60}px ${C.fuchsia}` }}>
            <Live id={s.id} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const STEP = 14;

const Board: React.FC = () => {
  const f = useCurrentFrame();
  const scale = interpolate(f, [0, 150], [1.05, 1], clamp);
  return (
    <AbsoluteFill style={{ background: C.stage, padding: 10 }}>
      <div style={{ width: "100%", height: "100%", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gridTemplateRows: "repeat(2, 1fr)", gap: 10, transform: `scale(${scale})` }}>
        {SHOTS.map((s, i) => {
          const on = 6 + i * STEP;
          const live = ease(f, on, on + 14);
          return (
            <div key={s.id} style={{ position: "relative", overflow: "hidden", borderRadius: R.lg }}>
              <Img src={asset(`stills/${s.id}.jpg`)} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(1) brightness(0.55)" }} />
              {f >= on ? <AbsoluteFill style={{ opacity: live }}><Live id={s.id} /></AbsoluteFill> : null}
              <div style={{ position: "absolute", left: 18, top: 14, fontSize: 30, fontWeight: 800, letterSpacing: -0.5, textShadow: "0 2px 10px #000" }}>{i + 1} · {s.name}</div>
              <div style={{ position: "absolute", left: 18, top: 58, padding: "4px 14px", fontSize: 21, fontWeight: 600, borderRadius: R.pill, background: BRAND.violet, opacity: live }}>
                {s.move} · {s.seconds} s
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const NODES = [
  { x: 0, y: 30, name: "LoadImage", note: "First frame", color: C.image },
  { x: 0, y: 300, name: "LoadImage", note: "Last frame", color: C.image },
  { x: 390, y: 165, name: "LTXVAddGuide", note: "frame_idx −1", color: C.video },
  { x: 780, y: 165, name: "SamplerCustomAdvanced", note: "LTX-2.3 22B", color: C.video },
  { x: 1190, y: 165, name: "SaveVideo", note: "1280×704", color: C.success }
];
const LINKS = [[0, 3], [1, 2], [2, 3], [3, 4]];
const NODE_W = 330;
const NODE_H = 120;

const PLAY_AT = 46;
const PLAY_FRAMES = 80; // the 8 s clip at 3×
const STRIP = [0, 7, 1, 6, 2, 5, 3, 4];

const FrameTag: React.FC<{ text: string; show: number }> = ({ text, show }) => (
  <div style={{ position: "absolute", left: 40, top: 36, padding: "10px 24px", fontSize: 44, fontWeight: 600, fontFamily: MONO, borderRadius: R.md, background: C.fuchsia, transform: `scale(${show})`, transformOrigin: "0 50%" }}>{text}</div>
);

const Graph: React.FC = () => {
  const f = useCurrentFrame();
  const end = PLAY_AT + PLAY_FRAMES;
  if (f < PLAY_AT) {
    const a = pop(f, 0);
    const b = pop(f, 6);
    const card = (file: string, label: string, left: number, p: number, dir: number): React.ReactNode => (
      <div style={{ position: "absolute", left, top: 70, width: 840, height: 470, borderRadius: R.lg, overflow: "hidden", border: `3px solid ${C.fuchsia}`, transform: `translateX(${(1 - p) * dir * 1100}px) rotate(${(1 - p) * dir * 8}deg)` }}>
        <Img src={asset(`frames/${file}.png`)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", left: 18, top: 12, fontSize: 40, fontWeight: 600, fontFamily: MONO, textShadow: "0 2px 12px #000" }}>{label}</div>
      </div>
    );
    return (
      <AbsoluteFill style={{ background: C.stage }}>
        {card("first", "FIRST", 90, a, -1)}
        {card("last", "LAST", 990, b, 1)}
        <div style={{ position: "absolute", left: 90, right: 90, top: 590, display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 6 }}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
            const p = pop(f, 14 + STRIP.indexOf(i) * 3);
            return <Img key={i} src={asset(`frames/s2-${i}.jpg`)} style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: R.sm, opacity: Math.min(1, p * 2), transform: `scale(${p})` }} />;
          })}
        </div>
      </AbsoluteFill>
    );
  }
  const scale = 0.45 + ease(f, PLAY_AT, PLAY_AT + 8) * 0.55;
  const dim = ease(f, end, end + 10) * 0.72;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <Img src={asset("frames/last.png")} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover" }} />
        <Sequence from={PLAY_AT} durationInFrames={PLAY_FRAMES} layout="none">
          <AbsoluteFill><Clip id="s2" rate={3} /></AbsoluteFill>
        </Sequence>
      </AbsoluteFill>
      {f < end ? (
        <>
          {f < PLAY_AT + 34 ? <FrameTag text="FIRST" show={pop(f, PLAY_AT + 4)} /> : null}
          {f >= end - 26 ? <FrameTag text="LAST" show={pop(f, end - 26)} /> : null}
        </>
      ) : null}
      <AbsoluteFill style={{ background: `rgba(5,6,10,${dim})` }} />
      {f >= end ? (
        <div style={{ position: "absolute", left: 90, top: 200 }}>
          <svg width={1600} height={470} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
            {LINKS.map(([a, b], i) => {
              const A = NODES[a];
              const B = NODES[b];
              const x1 = A.x + NODE_W;
              const y1 = A.y + NODE_H / 2;
              const x2 = B.x;
              const y2 = B.y + NODE_H / 2;
              const d = `M${x1} ${y1} C${x1 + 60} ${y1} ${x2 - 60} ${y2} ${x2} ${y2}`;
              return (
                <g key={i}>
                  <path d={d} fill="none" stroke={C.lineStrong} strokeWidth={4} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - ease(f, end + 6 + i * 3, end + 14 + i * 3)} />
                  <path d={d} fill="none" stroke={C.fuchsia} strokeWidth={7} pathLength={1} strokeDasharray="0.2 0.8" strokeDashoffset={-((f - end) / 14)} opacity={ease(f, end + 14, end + 20)} style={{ filter: `drop-shadow(0 0 10px ${C.fuchsia})` }} />
                </g>
              );
            })}
          </svg>
          {NODES.map((n, i) => {
            const p = pop(f, end + i * 3);
            return (
              <div key={i} style={{ position: "absolute", left: n.x, top: n.y, width: NODE_W, height: NODE_H, opacity: Math.min(1, p * 2), transform: `scale(${p})`, background: C.raised, borderRadius: R.md, borderTop: `5px solid ${n.color}`, padding: "14px 18px", fontFamily: MONO }}>
                <div style={{ fontSize: 23, fontWeight: 600 }}>{n.name}</div>
                <div style={{ fontSize: 22, color: C.dim, marginTop: 8 }}>{n.note}</div>
              </div>
            );
          })}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

const MOVES = [
  { name: "Orbit", file: "orbit" },
  { name: "Crash zoom in", file: "crash-zoom-in" },
  { name: "FPV fly-through", file: "fpv-drone-fly-through" },
  { name: "Whip pan", file: "whip-pan" },
  { name: "Dolly zoom", file: "dolly-zoom" },
  { name: "Through object pass", file: "through-object-pass" },
  { name: "Overhead spiral", file: "overhead-spiral" }
];
const CAMERA_PRESETS = ["FPV drone fly-through", "arc", "bullet time", "crane down", "crane up", "crash zoom in", "crash zoom out", "dolly in", "dolly out", "dolly zoom (vertigo)", "dutch roll", "handheld", "handheld follow", "low-angle hero rise", "orbit", "orbit left", "orbit right", "overhead spiral", "pan left", "pan right", "parallax slide", "pedestal down", "pedestal up", "pull back reveal", "rack focus", "slow pull out", "snorricam", "speed ramp", "static", "steadicam", "through-object pass", "tilt down", "tilt up", "top-down rise", "tracking", "truck left", "truck right", "whip pan", "zoom in", "zoom out"];
const MOVE_FRAMES = 30;

const Camera: React.FC = () => {
  const f = useCurrentFrame();
  const wallAt = MOVES.length * MOVE_FRAMES;
  return (
    <AbsoluteFill style={{ background: C.stage }}>
      {MOVES.map((m, i) => (
        <Sequence key={m.file} from={i * MOVE_FRAMES} durationInFrames={MOVE_FRAMES} layout="none">
          <AbsoluteFill>
            <OffthreadVideo src={asset(`camera/${m.file}.mp4`)} muted playbackRate={2.5} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", filter: "drop-shadow(0 6px 30px rgba(0,0,0,0.8))" }}>
              <Kinetic text={m.name} size={130} />
            </AbsoluteFill>
          </AbsoluteFill>
        </Sequence>
      ))}
      {f >= wallAt ? (
        <div style={{ position: "absolute", left: 50, right: 50, top: 44, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 18 }}>
          {CAMERA_PRESETS.map((name, i) => {
            const p = pop(f, wallAt + i * 0.7);
            return (
              <div key={name} style={{ padding: "15px 30px", fontSize: 40, fontWeight: 600, borderRadius: R.pill, background: C.raised, border: `2px solid ${[BRAND.blue, BRAND.violet, BRAND.coral][i % 3]}`, opacity: Math.min(1, p * 2), transform: `scale(${p})` }}>
                {name}
              </div>
            );
          })}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

const LOOKS = [
  { name: "Original", file: "ltx/s1a" },
  { name: "Anime", file: "filters/anime" },
  { name: "Clay", file: "filters/clay" },
  { name: "Comic", file: "filters/comic" },
  { name: "Neon", file: "filters/neon" },
  { name: "Noir", file: "filters/noir" },
  { name: "Oil painting", file: "filters/oil-painting" },
  { name: "Pixel", file: "filters/pixel" },
  { name: "Watercolor", file: "filters/watercolor" }
];

const FilterClip: React.FC<{ file: string; rate: number }> = ({ file, rate }) => (
  <OffthreadVideo src={asset(`${file}.mp4`)} muted playbackRate={rate} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
);

const LookTag: React.FC<{ name: string; size: number }> = ({ name, size }) => (
  <div style={{ position: "absolute", left: 14, top: 12, fontSize: size, fontWeight: 600, textShadow: "0 2px 10px #000" }}>{name}</div>
);

const Filters: React.FC = () => {
  const f = useCurrentFrame();
  const single = 9 * 14; // 4.2 s at 0.6× stays inside the 2.7 s clips
  return (
    <AbsoluteFill style={{ background: C.stage }}>
      {f < single ? (
        <AbsoluteFill>
          <FilterClip file={LOOKS[Math.floor(f / 14)].file} rate={0.6} />
          <LookTag name={LOOKS[Math.floor(f / 14)].name} size={46} />
        </AbsoluteFill>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gridTemplateRows: "repeat(3, 1fr)", gap: 6, width: "100%", height: "100%" }}>
          {LOOKS.map((l) => (
            <div key={l.name} style={{ position: "relative", overflow: "hidden" }}>
              <FilterClip file={`grid/${l.file.split("/")[1]}`} rate={0.6} />
              <LookTag name={l.name} size={26} />
            </div>
          ))}
        </div>
      )}
      <Line text="One shot. Eight AI filters." sub="Restyle presets, one click, through Comfy" />
    </AbsoluteFill>
  );
};

const Timeline: React.FC = () => {
  const f = useCurrentFrame();
  const total = SHOTS.reduce((n, s) => n + s.seconds, 0);
  const span = 7.4 * FPS;
  const head = interpolate(f, [34, span], [0, 1], clamp);
  let at = 0;
  const spans = SHOTS.map((s) => {
    const r = { ...s, at };
    at += s.seconds;
    return r;
  });
  return (
    <Surface title="Timeline · AURELI · 25.9 s">
      <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 16 }}>
        <div style={{ flex: 1, minHeight: 0, display: "flex", justifyContent: "center" }}>
          <div style={{ height: "100%", aspectRatio: "16 / 9", borderRadius: R.md, overflow: "hidden", background: "#000", position: "relative" }}>
            <Img src={asset(`stills/${f < span / 2 ? "s1a" : "s5"}.jpg`)} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover" }} />
            {spans.map((s) => {
              const start = 34 + (s.at / total) * (span - 34);
              const frames = (s.seconds / total) * (span - 34);
              return (
                <Sequence key={s.id} from={Math.round(start)} durationInFrames={Math.round(frames) + 2} layout="none">
                  <AbsoluteFill><Clip id={s.id} rate={(total * FPS) / (span - 34)} /></AbsoluteFill>
                </Sequence>
              );
            })}
          </div>
        </div>
        <div style={{ position: "relative", height: 170 }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 96, display: "flex", gap: 3 }}>
            {spans.map((s, i) => {
              const p = ease(f, i * 5, 12 + i * 5);
              return (
                <div
                  key={s.id}
                  style={{
                    flexGrow: s.seconds,
                    flexBasis: 0,
                    position: "relative",
                    borderRadius: R.sm,
                    overflow: "hidden",
                    opacity: p,
                    transform: `translateY(${(1 - p) * -90}px)`,
                    border: `1px solid ${C.video}`
                  }}
                >
                  <Img src={asset(`stills/${s.id}.jpg`)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              );
            })}
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 108, height: 52, borderRadius: R.sm, background: "rgba(8,184,255,0.25)", border: `1px solid ${C.audio}`, opacity: ease(f, 28, 38), padding: "12px 16px", fontSize: 22 }}>
            Music
          </div>
          <div style={{ position: "absolute", top: -4, bottom: 0, left: `${head * 100}%`, width: 3, background: C.fuchsia }} />
        </div>
      </div>
    </Surface>
  );
};

const Close: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Clip id="s5" startFrom={60} />
      <AbsoluteFill style={{ background: `rgba(5,6,10,${ease(f, 40, 70) * 0.82})`, alignItems: "center", justifyContent: "center" }}>
        <div style={{ opacity: ease(f, 48, 70), textAlign: "center" }}>
          <Logo size={150} delay={48} />
          <div style={{ fontSize: 120, fontWeight: 800, letterSpacing: -4 }}>NodeTool</div>
          <div style={{ fontSize: 46, fontWeight: 600, marginTop: 10, background: BRAND_GRADIENT, WebkitBackgroundClip: "text", color: "transparent" }}>Open source. Rendering on ComfyUI.</div>
          <div style={{ fontSize: 32, color: C.dim, marginTop: 22, fontFamily: MONO }}>github.com/nodetool-ai/nodetool</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const BEATS: Array<{ frames: number; caption?: string; sub?: string; render: React.ReactNode }> = [
  { frames: 180, render: <Hook /> },
  { frames: 70, render: <Title /> },
  { frames: 140, caption: "Cast it once.", sub: "Entities carry your people, props and places across shots", render: <Cast /> },
  { frames: 150, caption: "Board it.", sub: "Every shot gets its action and camera move", render: <Board /> },
  { frames: 175, caption: "First frame. Last frame. Everything between.", sub: "Open-weights LTX-2.3 on Comfy Cloud. Open the graph, change anything.", render: <Graph /> },
  { frames: 285, caption: "40 camera presets.", sub: "Seven shown here, on open-weights LTX-2.3 on Comfy Cloud", render: <Camera /> },
  { frames: 240, render: <Filters /> },
  { frames: 225, caption: "Cut it.", sub: "Tracks, music and effects in one timeline", render: <Timeline /> },
  { frames: 120, render: <Close /> }
];

export const TOTAL_FRAMES = BEATS.reduce((n, b) => n + b.frames, 0);

export const AureliFilm: React.FC = () => {
  useInterFont();
  let from = 0;
  return (
    <AbsoluteFill style={{ background: C.stage, fontFamily: FONT, color: C.text }}>
      {BEATS.map((b, i) => {
        const start = from;
        from += b.frames;
        return (
          <Sequence key={i} from={start} durationInFrames={b.frames}>
            {b.render}
            {b.caption ? <Line text={b.caption} sub={b.sub} /> : null}
          </Sequence>
        );
      })}
      <Audio src={asset("music.wav")} volume={(f) => interpolate(f, [TOTAL_FRAMES - 45, TOTAL_FRAMES - 1], [1, 0], clamp)} />
    </AbsoluteFill>
  );
};
