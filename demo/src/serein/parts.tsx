/**
 * Shared visual parts of the Serein reference film: backdrops, the email
 * card, the mark, the labels and the finishing layers.
 */
import React from "react";
import { AbsoluteFill } from "remotion";
import {
  CARD,
  CATEGORY_COLOR,
  DIM,
  DUSK,
  DUSK_STOPS,
  Email,
  FONT,
  HEIGHT,
  INK,
  LATER,
  LINE,
  TEXT,
  WIDTH,
  easeOutExpo,
  hash,
  lerp,
  ms,
  prog,
} from "./theme";

type Style = React.CSSProperties;

/** Places its child with its centre at (x, y) px from the frame centre. */
export function At({
  x = 0,
  y = 0,
  transform = "",
  style,
  children,
}: {
  x?: number;
  y?: number;
  transform?: string;
  style?: Style;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      style={{
        position: "absolute",
        left: WIDTH / 2,
        top: HEIGHT / 2,
        transform: `translate(-50%, -50%) translate(${x}px, ${y}px) ${transform}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Fill({ color, style }: { color: string; style?: Style }): React.JSX.Element {
  return <AbsoluteFill style={{ background: color, ...style }} />;
}

/** The `gradientField` generator: soft blobs of colour `b` drifting over `a`. */
export function GradientField({
  f,
  a,
  b,
  opacity = 1,
}: {
  f: number;
  a: string;
  b: string;
  opacity?: number;
}): React.JSX.Element {
  const t = f / 30;
  const blob = (cx: number, cy: number, r: number): string =>
    `radial-gradient(circle ${r}px at ${cx}px ${cy}px, ${b} 0%, ${b}cc 30%, transparent 100%)`;
  const layers = [
    blob(520 + 180 * Math.sin(t * 0.35), 300 + 120 * Math.cos(t * 0.27), 1100),
    blob(1480 + 160 * Math.cos(t * 0.3), 820 + 140 * Math.sin(t * 0.22 + 1), 1000),
    blob(1100 + 260 * Math.sin(t * 0.18 + 2), 120 + 100 * Math.sin(t * 0.4), 760),
  ];
  return (
    <AbsoluteFill style={{ opacity, background: `${layers.join(", ")}, ${a}` }} />
  );
}

/** A soft radial glow centred at (x, y). */
export function Glow({
  x = 0,
  y = 0,
  size = 900,
  color = "rgba(167,139,250,0.25)",
  opacity = 1,
}: {
  x?: number;
  y?: number;
  size?: number;
  color?: string;
  opacity?: number;
}): React.JSX.Element {
  return (
    <At x={x} y={y}>
      <div
        style={{
          width: size,
          height: size,
          opacity,
          background: `radial-gradient(circle closest-side, ${color} 0%, ${color.replace(/[\d.]+\)$/, "0.1)")} 55%, transparent 100%)`,
        }}
      />
    </At>
  );
}

/** A white screen-blend flash, linear from `peak` to 0. */
export function Flash({
  f,
  from = 0,
  dur,
  peak,
}: {
  f: number;
  from?: number;
  dur: number;
  peak: number;
}): React.JSX.Element | null {
  const o = peak * (1 - prog(f, from, dur));
  if (f < from || o <= 0) return null;
  return <AbsoluteFill style={{ background: "#fff", opacity: o, mixBlendMode: "screen" }} />;
}

/** Fades the frame to INK, linear. */
export function FadeOut({ f, from, dur }: { f: number; from: number; dur: number }): React.JSX.Element | null {
  const o = prog(f, from, dur);
  if (o <= 0) return null;
  return <AbsoluteFill style={{ background: INK, opacity: o }} />;
}

export function Vignette({ strength = 0.7 }: { strength?: number }): React.JSX.Element {
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 75% 70% at 50% 50%, transparent 35%, rgba(5,8,18,${strength}) 100%)`,
      }}
    />
  );
}

/** Film grain (amount 0.05) and a fixed-seed dither over the whole film. */
export function Grain({ f }: { f: number }): React.JSX.Element {
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <svg width={WIDTH} height={HEIGHT} style={{ position: "absolute", inset: 0 }}>
        <filter id={`grain-${f}`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={(f % 97) + 1} />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <filter id="dither" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="turbulence" baseFrequency="1.7" numOctaves="1" seed="11" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#grain-${f})`} opacity={0.05} style={{ mixBlendMode: "overlay" }} />
        <rect width="100%" height="100%" filter="url(#dither)" opacity={0.035} style={{ mixBlendMode: "soft-light" }} />
      </svg>
    </AbsoluteFill>
  );
}

/** Text filled with the DUSK gradient. */
export function Dusk({ children, style }: { children: React.ReactNode; style?: Style }): React.JSX.Element {
  return (
    <span
      style={{
        backgroundImage: DUSK,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

const SCRAMBLE_SET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789#$%&";

/** Decodes `text` left to right between local frames `from` and `from + dur` (fixed seed). */
export function scramble(text: string, f: number, from: number, dur: number, seed = 7): string {
  if (f >= from + dur) return text;
  const p = (f - from) / dur;
  const tick = Math.floor(f / 2);
  return [...text]
    .map((ch, i) => {
      if (ch === " ") return ch;
      if (f >= from && i / text.length < p) return ch;
      return SCRAMBLE_SET[Math.floor(hash(seed * 1000 + i * 31 + tick) * SCRAMBLE_SET.length)];
    })
    .join("");
}

export interface CardProps {
  email: Email;
  width?: number;
  height?: number;
  radius?: number;
  senderSize?: number;
  subjectSize?: number;
  subjectColor?: string;
  subject?: string;
  unread?: boolean;
  shadowY?: number;
  avatar?: number;
  style?: Style;
  children?: React.ReactNode;
}

/** The email card from BRIEF.md section 5. */
export function EmailCard({
  email,
  width = 420,
  height = 88,
  radius = 18,
  senderSize = 20,
  subjectSize = 18,
  subjectColor = DIM,
  subject,
  unread = false,
  shadowY = 12,
  avatar = 36,
  style,
  children,
}: CardProps): React.JSX.Element {
  const inset = Math.round(20 * (avatar / 36));
  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        borderRadius: radius,
        background: CARD,
        border: `1px solid ${LINE}`,
        boxShadow: `0 ${shadowY}px ${36 / 3 * 2}px rgba(0,0,0,0.45)`,
        boxSizing: "border-box",
        fontFamily: FONT,
        overflow: "hidden",
        ...style,
      }}
    >
      {unread && (
        <div
          style={{
            position: "absolute",
            left: 7,
            top: height / 2 - 4,
            width: 8,
            height: 8,
            borderRadius: 4,
            background: LATER,
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          left: inset,
          top: children ? inset : (height - avatar) / 2,
          width: avatar,
          height: avatar,
          borderRadius: avatar / 2,
          background: CATEGORY_COLOR[email.category],
          opacity: 0.7,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: inset * 2 + avatar - 4,
          right: inset + senderSize * 3,
          top: children ? inset - 2 : height / 2 - (senderSize + subjectSize) * 0.62,
          whiteSpace: "nowrap",
        }}
      >
        <div style={{ fontSize: senderSize, fontWeight: 600, color: TEXT, lineHeight: 1.2 }}>
          {email.sender}
        </div>
        <div
          style={{
            fontSize: subjectSize,
            fontWeight: 400,
            color: subjectColor,
            lineHeight: 1.3,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {subject ?? email.subject}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          right: inset,
          top: children ? inset + 2 : height / 2 - 10,
          fontSize: Math.round(senderSize * 0.8),
          color: DIM,
          lineHeight: 1.2,
        }}
      >
        {email.time}
      </div>
      {children}
    </div>
  );
}

/** A skeleton card: the card shape with placeholder bars. */
export function SkeletonCard({ brightness = 1 }: { brightness?: number }): React.JSX.Element {
  return (
    <div
      style={{
        width: 420,
        height: 88,
        borderRadius: 18,
        background: CARD,
        border: `1px solid ${LINE}`,
        boxSizing: "border-box",
        position: "relative",
        filter: `brightness(${brightness})`,
      }}
    >
      <div style={{ position: "absolute", left: 20, top: 26, width: 36, height: 36, borderRadius: 18, background: "rgba(148,163,184,0.16)" }} />
      <div style={{ position: "absolute", left: 72, top: 28, width: 150, height: 12, borderRadius: 6, background: "rgba(148,163,184,0.2)" }} />
      <div style={{ position: "absolute", left: 72, top: 50, width: 240, height: 10, borderRadius: 5, background: "rgba(148,163,184,0.12)" }} />
    </div>
  );
}

export interface MarkState {
  ring: number;
  horizon: number;
  sun: number;
  sunOpacity: number;
}

export const MARK_DRAWN: MarkState = { ring: 1, horizon: 1, sun: 1, sunOpacity: 1 };

/** The Serein mark, 120 px: a ring, a horizon line and a dusk sun, with a glow. */
export function Mark({ state, size = 120 }: { state: MarkState; size?: number }): React.JSX.Element {
  const r = 57;
  const circ = 2 * Math.PI * r;
  const hy = 19;
  const lineLen = 150;
  return (
    <svg
      width={size}
      height={size}
      viewBox="-60 -60 120 120"
      overflow="visible"
      style={{
        overflow: "visible",
        filter: `drop-shadow(0 0 ${40 / 3}px rgba(167,139,250,0.8)) drop-shadow(0 0 4px rgba(248,250,252,0.35))`,
      }}
    >
      <defs>
        <linearGradient id="mark-dusk" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={DUSK_STOPS[0]} />
          <stop offset="0.5" stopColor={DUSK_STOPS[1]} />
          <stop offset="1" stopColor={DUSK_STOPS[2]} />
        </linearGradient>
      </defs>
      <circle
        r={r}
        fill="none"
        stroke={TEXT}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - state.ring)}
        transform="rotate(-90)"
        opacity={state.ring > 0 ? 1 : 0}
      />
      <line
        x1={-lineLen / 2}
        y1={hy}
        x2={-lineLen / 2 + lineLen * state.horizon}
        y2={hy}
        stroke={TEXT}
        strokeWidth={6}
        strokeLinecap="round"
        opacity={state.horizon > 0.001 ? 1 : 0}
      />
      <circle
        cx={0}
        cy={-8}
        r={22}
        fill="url(#mark-dusk)"
        opacity={state.sunOpacity}
        transform={`translate(0 -8) scale(${state.sun}) translate(0 8)`}
      />
    </svg>
  );
}

/** "Serein" in 140 px 800; characters slide up 40 px and fade in (30 ms stagger, 400 ms each). */
export function Wordmark({ f, start }: { f: number; start: number }): React.JSX.Element {
  return (
    <div
      style={{
        fontFamily: FONT,
        fontSize: 140,
        fontWeight: 800,
        letterSpacing: "-0.035em",
        color: TEXT,
        lineHeight: 1,
        display: "flex",
        paddingBottom: 8,
      }}
    >
      {[..."Serein"].map((ch, i) => {
        const p = prog(f, start + i * 0.9, 12, easeOutExpo);
        return (
          <span key={i} style={{ display: "inline-block", opacity: p, transform: `translateY(${lerp(40, 0, p)}px)` }}>
            {ch}
          </span>
        );
      })}
    </div>
  );
}

/** "01 — SORT": 24 px 600 DIM, 4 px tracking, a wipe from the left over 10 frames from frame 4. */
export function Kicker({ f, text }: { f: number; text: string }): React.JSX.Element {
  const p = prog(f, 4, 10, easeOutExpo);
  return (
    <div
      style={{
        position: "absolute",
        left: 96,
        top: 96,
        fontFamily: FONT,
        fontSize: 24,
        fontWeight: 600,
        letterSpacing: 4,
        textTransform: "uppercase",
        color: DIM,
        lineHeight: 1,
        opacity: Math.min(1, p * 2),
        clipPath: `inset(-10px ${(1 - p) * 100}% -10px -10px)`,
      }}
    >
      {text}
    </div>
  );
}

/** The bottom-left headline: 72 px 800, words rise 30 px with a 60 ms stagger from frame 10. */
export function Headline({ f, text }: { f: number; text: string }): React.JSX.Element {
  const words = text.split(" ");
  return (
    <div
      style={{
        position: "absolute",
        left: 96,
        bottom: 96 - 72 * 0.22,
        fontFamily: FONT,
        fontSize: 72,
        fontWeight: 800,
        letterSpacing: "-0.03em",
        color: TEXT,
        lineHeight: 1,
        display: "flex",
        gap: "0.25em",
        whiteSpace: "nowrap",
      }}
    >
      {words.map((w, i) => {
        const p = prog(f, 10 + i * ms(60), 14, easeOutExpo);
        return (
          <span key={i} style={{ display: "inline-block", opacity: p, transform: `translateY(${lerp(30, 0, p)}px)` }}>
            {w}
          </span>
        );
      })}
    </div>
  );
}

/** A full-frame gradient from transparent at 55% to INK at 85% alpha at the bottom. */
export function Scrim(): React.JSX.Element {
  return (
    <AbsoluteFill
      style={{ background: "linear-gradient(180deg, transparent 55%, rgba(10,15,31,0.85) 100%)" }}
    />
  );
}

/** A pill sized to its text. */
export function Pill({
  children,
  border = LINE,
  background = CARD,
  style,
}: {
  children: React.ReactNode;
  border?: string;
  background?: string;
  style?: Style;
}): React.JSX.Element {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 22px",
        borderRadius: 999,
        background,
        border: `1px solid ${border}`,
        fontFamily: FONT,
        whiteSpace: "nowrap",
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** A `particles` burst in DUSK colours, fixed seed. */
export function Particles({ f, from, dur, count = 90 }: { f: number; from: number; dur: number; count?: number }): React.JSX.Element | null {
  const t = f - from;
  if (t < 0 || t > dur) return null;
  const p = t / dur;
  return (
    <AbsoluteFill style={{ mixBlendMode: "screen" }}>
      {Array.from({ length: count }, (_, i) => {
        const ang = hash(i * 3 + 1) * Math.PI * 2;
        const speed = 260 + hash(i * 3 + 2) * 620;
        const d = speed * (1 - Math.pow(1 - p, 3));
        const size = 3 + hash(i * 3 + 3) * 9;
        const col = DUSK_STOPS[i % 3];
        const o = (1 - p) * (0.6 + 0.4 * hash(i + 99));
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: WIDTH / 2 + Math.cos(ang) * d * 1.25 - size / 2,
              top: HEIGHT / 2 - 40 + Math.sin(ang) * d * 0.8 - size / 2,
              width: size,
              height: size,
              borderRadius: size,
              background: col,
              opacity: o,
              boxShadow: `0 0 ${size * 2}px ${col}`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
}
