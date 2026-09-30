import React from "react";
import { AbsoluteFill, interpolate, random, useCurrentFrame } from "remotion";
import { BAR, BEAT, COLOR, FONT, HEIGHT, WIDTH } from "./theme";

export const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
export const easeOut = (x: number): number => 1 - (1 - clamp01(x)) ** 3;
export const easeIn = (x: number): number => clamp01(x) ** 3;
export const easeInOut = (x: number): number => {
  const t = clamp01(x);
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
};
/** Overshooting ease for slams. */
export const backOut = (x: number, s = 2.2): number => {
  const t = clamp01(x) - 1;
  return 1 + (s + 1) * t ** 3 + s * t ** 2;
};

/** 0..1 pulse that decays over `len` frames after every beat. */
export function beatPulse(frame: number, len = 8, every = BEAT): number {
  const into = frame % every;
  return into < len ? 1 - into / len : 0;
}

/** Camera shake that spikes on each beat and decays. */
export function Shake({
  children,
  amount,
}: {
  children: React.ReactNode;
  amount: number;
}): React.JSX.Element {
  const frame = useCurrentFrame();
  const p = beatPulse(frame, 10) * amount;
  const x = (random(`sx${Math.floor(frame / 2)}`) - 0.5) * 2 * p;
  const y = (random(`sy${Math.floor(frame / 2)}`) - 0.5) * 2 * p;
  const r = (random(`sr${Math.floor(frame / 2)}`) - 0.5) * 0.6 * p * 0.1;
  const zoom = 1 + p * 0.004;
  return (
    <AbsoluteFill style={{ transform: `translate(${x}px, ${y}px) rotate(${r}deg) scale(${zoom})` }}>
      {children}
    </AbsoluteFill>
  );
}

/** Radial speed streaks. `intensity` 0..1. */
export function SpeedLines({
  intensity,
  color = "#ffffff",
  seed = "sl",
  cx = WIDTH / 2,
  cy = HEIGHT / 2,
}: {
  intensity: number;
  color?: string;
  seed?: string;
  cx?: number;
  cy?: number;
}): React.JSX.Element | null {
  const frame = useCurrentFrame();
  if (intensity <= 0.01) return null;
  const count = 90;
  const lines: React.ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const angle = random(`${seed}a${i}`) * Math.PI * 2;
    const speed = 0.6 + random(`${seed}s${i}`) * 1.4;
    const cycle = (frame * 0.045 * speed + random(`${seed}o${i}`)) % 1;
    const r0 = 180 + cycle * 1500;
    const len = (60 + random(`${seed}l${i}`) * 260) * (0.4 + cycle) * intensity;
    const x1 = cx + Math.cos(angle) * r0;
    const y1 = cy + Math.sin(angle) * r0;
    const x2 = cx + Math.cos(angle) * (r0 + len);
    const y2 = cy + Math.sin(angle) * (r0 + len);
    const w = 1 + random(`${seed}w${i}`) * 2.5;
    lines.push(
      <line
        key={i}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth={w}
        strokeOpacity={(0.25 + 0.55 * cycle) * intensity}
        strokeLinecap="round"
      />,
    );
  }
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <svg width={WIDTH} height={HEIGHT} style={{ mixBlendMode: "screen" }}>
        {lines}
      </svg>
    </AbsoluteFill>
  );
}

/** Horizontal motion streaks for side-scrolling speed. */
export function HorizonStreaks({ intensity, seed = "hs" }: { intensity: number; seed?: string }): React.JSX.Element | null {
  const frame = useCurrentFrame();
  if (intensity <= 0.01) return null;
  const items: React.ReactNode[] = [];
  for (let i = 0; i < 40; i++) {
    const y = random(`${seed}y${i}`) * HEIGHT;
    const speed = 50 + random(`${seed}v${i}`) * 90;
    const len = 150 + random(`${seed}l${i}`) * 500;
    const x = WIDTH + 400 - ((frame * speed + random(`${seed}x${i}`) * 4000) % (WIDTH + 1200));
    items.push(
      <div
        key={i}
        style={{
          position: "absolute",
          left: x,
          top: y,
          width: len * intensity,
          height: 2 + random(`${seed}h${i}`) * 2,
          background: `linear-gradient(90deg, rgba(255,255,255,0.7), transparent)`,
          opacity: 0.5 * intensity,
        }}
      />,
    );
  }
  return <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "screen" }}>{items}</AbsoluteFill>;
}

/** Full-frame flash that fades over `len` frames from `at`. */
export function Flash({ at, len = 8, color = "#ffffff", max = 0.9 }: { at: number; len?: number; color?: string; max?: number }): React.JSX.Element | null {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < 0 || t > len) return null;
  return <AbsoluteFill style={{ background: color, opacity: max * (1 - t / len), mixBlendMode: "screen" }} />;
}

/** Text with an RGB split that widens with `split`. */
export function ChromaText({
  children,
  split,
  style,
}: {
  children: React.ReactNode;
  split: number;
  style: React.CSSProperties;
}): React.JSX.Element {
  return (
    <div
      style={{
        ...style,
        textShadow: `${split}px 0 0 rgba(255,40,80,0.85), ${-split}px 0 0 rgba(40,220,255,0.85)`,
      }}
    >
      {children}
    </div>
  );
}

/** Film grain and vignette. */
export function Grain(): React.JSX.Element {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <svg width={WIDTH} height={HEIGHT} style={{ position: "absolute", opacity: 0.09, mixBlendMode: "overlay" }}>
        <filter id="vgrain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={frame % 30} />
        </filter>
        <rect width="100%" height="100%" filter="url(#vgrain)" />
      </svg>
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)",
        }}
      />
    </AbsoluteFill>
  );
}

/** Slices the frame into diagonal shards that slide away: a fast wipe. */
export function Wipe({ at, len = 14, color = COLOR.ember, reverse = false }: { at: number; len?: number; color?: string; reverse?: boolean }): React.JSX.Element | null {
  const frame = useCurrentFrame();
  const t = (frame - at) / len;
  if (t < 0 || t > 1) return null;
  const bands = 5;
  return (
    <AbsoluteFill style={{ overflow: "hidden", pointerEvents: "none" }}>
      {Array.from({ length: bands }, (_, i) => {
        const local = clamp01(t * 1.6 - i * 0.12);
        const inX = interpolate(easeInOut(local), [0, 0.5, 1], [-1.3, 0, 1.3]) * WIDTH * (reverse ? -1 : 1);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: -200,
              top: (i * HEIGHT) / bands - 40,
              width: WIDTH + 400,
              height: HEIGHT / bands + 80,
              background: i % 2 ? color : COLOR.ink,
              transform: `translateX(${inX}px) skewX(-18deg)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
}

/** Big label used for section slams. */
export function SlamLabel({
  at,
  text,
  sub,
  color = COLOR.text,
  hold = BAR,
}: {
  at: number;
  text: string;
  sub?: string;
  color?: string;
  hold?: number;
}): React.JSX.Element | null {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < 0 || t > hold) return null;
  const s = interpolate(backOut(t / 8, 2.4), [0, 1], [2.4, 1]);
  const out = clamp01((t - (hold - 8)) / 8);
  const split = 14 * (1 - clamp01(t / 10)) + 3 * beatPulse(frame, 6);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
      <div style={{ transform: `scale(${s * (1 + out * 0.4)})`, opacity: 1 - out, textAlign: "center" }}>
        <ChromaText
          split={split}
          style={{ fontFamily: FONT.hud, fontSize: 250, lineHeight: 0.9, color, letterSpacing: 6 }}
        >
          {text}
        </ChromaText>
        {sub ? (
          <div style={{ fontFamily: FONT.mono, fontSize: 30, color: COLOR.dim, marginTop: 18, letterSpacing: 4 }}>
            {sub}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}

/** Soft additive-looking glow from an alpha gradient, safe inside transformed parents. */
export function Glow({ size, color = "255,150,60", strength = 0.6, style }: { size: number; color?: string; strength?: number; style?: React.CSSProperties }): React.JSX.Element {
  return (
    <div
      style={{
        position: "absolute",
        width: size,
        height: size,
        borderRadius: "50%",
        background: `radial-gradient(circle, rgba(${color},${strength}) 0%, rgba(${color},${strength * 0.35}) 30%, rgba(${color},0) 68%)`,
        pointerEvents: "none",
        ...style,
      }}
    />
  );
}
