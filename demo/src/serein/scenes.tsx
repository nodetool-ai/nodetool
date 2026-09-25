/**
 * The scenes of the Serein reference film. Each scene takes its local frame
 * `f`, which counts from the scene start in BRIEF.md section 4.
 */
import React from "react";
import { AbsoluteFill } from "remotion";
import {
  At,
  Dusk,
  EmailCard,
  FadeOut,
  Fill,
  Flash,
  GradientField,
  Glow,
  Headline,
  Kicker,
  MARK_DRAWN,
  Mark,
  Particles,
  Pill,
  Scrim,
  SkeletonCard,
  Vignette,
  Wordmark,
  scramble,
} from "./parts";
import {
  CALM,
  CARD,
  CATEGORY_COLOR,
  Category,
  DIM,
  DUSK,
  EMAILS,
  FONT,
  HEIGHT,
  INK,
  INK2,
  LINE,
  NOW,
  TEXT,
  VIOLET,
  WIDTH,
  beat,
  blurCss,
  easeInOutExpo,
  easeOutCubic,
  easeOutExpo,
  hash,
  lerp,
  mixHex,
  ms,
  prog,
  spr,
  S4A,
} from "./theme";

let measureCtx: CanvasRenderingContext2D | null = null;
/** The rendered width of one line of Inter text. */
function textWidth(text: string, size: number, weight: number): number {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * size * 0.55;
  measureCtx.font = `${weight} ${size}px Inter`;
  return measureCtx.measureText(text).width;
}

const fmt = (n: number): string => Math.round(n).toLocaleString("en-US");

// ---------------------------------------------------------------------------
// The card wall (S1, reused dimmed in S5)

interface WallCard {
  x: number;
  y: number;
  email: number;
}

/** Spreads `n` cards over columns 460 px apart and a tall strip, so the wall covers the frame while it scrolls. */
function layerCards(n: number, cols: number[], y0: number, span: number, seed: number): WallCard[] {
  return Array.from({ length: n }, (_, k) => ({
    x: cols[(k * 3 + seed) % cols.length] * 460 + (hash(seed * 50 + k) - 0.5) * 60,
    y: y0 + (k / n) * span + (hash(seed * 70 + k) - 0.5) * 80,
    email: 0,
  }));
}

const FAR = layerCards(9, [-2, 0, 2, -1, 1], -640, 1950, 1).map((c, k) => ({ ...c, email: k }));
const MID = layerCards(7, [-1, 1, 0, -2, 2], -560, 1900, 2).map((c, k) => ({ ...c, x: c.x + 230, email: 9 + k }));
const NEAR = layerCards(5, [-1, 1, 0], -380, 1700, 3).map((c, k) => ({ ...c, x: c.x - 115, email: (16 + k) % 18 }));
const SKELETON = Array.from({ length: 40 }, (_, i) => {
  const col = i % 5;
  const row = Math.floor(i / 5);
  return { x: (col - 2) * 460 + 230, y: -700 + row * 250 + (col % 2) * 125, b: 1 - 0.01 * i };
});

export interface WallState {
  /** Mid-layer scroll in px; the far layer moves 0.85×, the near layer 1.19× (1.4× the far). */
  scroll: number;
  push: number;
  wiggleX?: number;
  wiggleY?: number;
  unread?: boolean;
}

export function Wall({ scroll, push, wiggleX = 0, wiggleY = 0, unread = true }: WallState): React.JSX.Element {
  const nearBlur = 3.2 + 2.4 * (push / 260);
  const layer = (cards: WallCard[], depth: number, speed: number, opacity: number, blur: number): React.ReactNode => (
    <div style={{ position: "absolute", transformStyle: "preserve-3d", transform: `translateZ(${depth}px) translateY(${-scroll * speed}px)` }}>
      {cards.map((c, i) => (
        <div
          key={i}
          style={{ position: "absolute", left: c.x - 210, top: c.y - 44, opacity, filter: blur > 0 ? `blur(${blur}px)` : undefined }}
        >
          <EmailCard email={EMAILS[c.email]} unread={unread} />
        </div>
      ))}
    </div>
  );
  return (
    <AbsoluteFill style={{ perspective: 1800, perspectiveOrigin: "50% 50%", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: WIDTH / 2,
          top: HEIGHT / 2,
          transformStyle: "preserve-3d",
          transform: `translateZ(${push}px) translate(${wiggleX}px, ${wiggleY}px) rotateZ(-12deg) rotateX(28deg)`,
        }}
      >
        <div style={{ position: "absolute", transformStyle: "preserve-3d", transform: `translateZ(-340px) translateY(${-scroll * 0.8}px)` }}>
          {SKELETON.map((s, i) => (
            <div key={i} style={{ position: "absolute", left: s.x - 210, top: s.y - 44, opacity: 0.6, filter: "blur(4px)" }}>
              <SkeletonCard brightness={s.b} />
            </div>
          ))}
        </div>
        {layer(FAR, -300, 0.85, 0.5, 4.5)}
        {layer(MID, 0, 1, 1, 0)}
        {layer(NEAR, 220, 1.19, 1, nearBlur)}
      </div>
    </AbsoluteFill>
  );
}

/** Mid-layer scroll: 0 → −700 px over S1, twice as fast from frame 96. */
export function floodScroll(f: number): number {
  const v = 700 / 148;
  return f < 96 ? v * f : v * 96 + 2 * v * (f - 96);
}

// ---------------------------------------------------------------------------
// Glitch and RGB split

/** Horizontal slice displacement of `children`, driven by `amount` 0..1. */
function Glitch({ f, amount, height, children }: { f: number; amount: number; height: number; children: React.ReactNode }): React.JSX.Element {
  if (amount <= 0.001) return <>{children}</>;
  const bands = 9;
  const tick = Math.floor(f / 2);
  return (
    <div style={{ position: "relative" }}>
      <div style={{ visibility: "hidden" }}>{children}</div>
      {Array.from({ length: bands }, (_, i) => {
        const on = hash(i * 13 + tick * 7) > 0.45;
        const dx = on ? (hash(i * 17 + tick * 3) - 0.5) * 2 * amount * 140 : 0;
        const top = (i / bands) * height;
        const bottom = height - ((i + 1) / bands) * height;
        return (
          <div key={i} style={{ position: "absolute", inset: 0, clipPath: `inset(${top}px -400px ${bottom}px -400px)`, transform: `translateX(${dx}px)` }}>
            {children}
          </div>
        );
      })}
    </div>
  );
}

/** An SVG filter that splits R and B sideways by `d` px. Reference it as `url(#<id>)`. */
export function RgbSplitDef({ id, d }: { id: string; d: number }): React.JSX.Element {
  return (
    <svg width={0} height={0} style={{ position: "absolute" }}>
      <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feOffset in="SourceGraphic" dx={-d} dy={0} result="ro" />
        <feColorMatrix in="ro" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
        <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
        <feOffset in="SourceGraphic" dx={d} dy={0} result="bo" />
        <feColorMatrix in="bo" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
        <feBlend in="r" in2="g" mode="screen" result="rg" />
        <feBlend in="rg" in2="b" mode="screen" />
      </filter>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// S1 The flood (0–122)

export function Flood({ f }: { f: number }): React.JSX.Element {
  const build = prog(f, 96, 26);
  const wig = 6 * build;
  const push = 260 * prog(f, 0, 122);
  const enter = prog(f, 8, 12, easeOutExpo);
  // BRIEF.md asks for easeInExpo, but C1 wants "near 300" at frame 40; easeInQuad meets C1.
  const count = 2847 * Math.pow(prog(f, 12, 88), 2);
  const glitch = 0.5 * build;
  const split = 0.4 * build;
  const line: React.CSSProperties = { fontFamily: FONT, fontSize: 48, fontWeight: 400, color: DIM, letterSpacing: "-0.01em" };
  return (
    <AbsoluteFill>
      <RgbSplitDef id="s1-split" d={split * 30} />
      <AbsoluteFill style={{ filter: split > 0.001 ? "url(#s1-split)" : undefined }}>
        <Fill color={INK} />
        <GradientField f={f} a={INK} b={INK2} opacity={0.6} />
        <Wall
          scroll={floodScroll(f)}
          push={push}
          wiggleX={wig * (Math.sin(f * 1.7) + Math.sin(f * 2.9 + 1)) * 0.5}
          wiggleY={wig * (Math.sin(f * 2.3 + 2) + Math.sin(f * 3.7)) * 0.5}
        />
        <Glow size={1500} color="rgba(10,15,31,0.75)" />
        <AbsoluteFill style={{ opacity: enter, filter: blurCss(30 * (1 - enter)) }}>
          <At y={-190}><div style={line}>You have</div></At>
          <At y={0}>
            <Glitch f={f} amount={glitch} height={300}>
              <div
                style={{
                  fontFamily: FONT,
                  fontSize: 300,
                  fontWeight: 800,
                  letterSpacing: "-0.045em",
                  color: TEXT,
                  lineHeight: 1,
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                  textShadow: "0 20px 80px rgba(0,0,0,0.5)",
                }}
              >
                {fmt(count)}
              </div>
            </Glitch>
          </At>
          <At y={190}><div style={line}>unread emails.</div></At>
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// S2 The name (123–191)

export function LogoRow({ f, markFrom, wordFrom }: { f: number; markFrom: number | null; wordFrom: number }): React.JSX.Element {
  const state =
    markFrom === null
      ? MARK_DRAWN
      : {
          ring: prog(f, markFrom, 16, easeOutExpo),
          horizon: prog(f, markFrom + 6, 14, easeOutExpo),
          sun: lerp(0.6, 1, spr(f, markFrom + 12)),
          sunOpacity: prog(f, markFrom + 12, 4),
        };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
      <Mark state={state} />
      <Wordmark f={f} start={wordFrom} />
    </div>
  );
}

export function Name({ f }: { f: number }): React.JSX.Element {
  const tag = prog(f, 30, 12, easeOutExpo);
  return (
    <AbsoluteFill>
      <Fill color={INK} />
      <Glow size={900} />
      <At y={-30}>
        <LogoRow f={f} markFrom={0} wordFrom={8} />
      </At>
      <At y={110 + lerp(20, 0, tag)} style={{ opacity: tag }}>
        <div style={{ fontFamily: FONT, fontSize: 44, fontWeight: 400, color: DIM, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
          The inbox that sorts itself.
        </div>
      </At>
      <Flash f={f} dur={10} peak={0.9} />
      <FadeOut f={f} from={61} dur={7} />
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// S3 One email (192–244)

function Spinner({ f, color }: { f: number; color: string }): React.JSX.Element {
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <svg width={24} height={24} viewBox="-12 -12 24 24" style={{ transform: `rotate(${(f / 20) * 360}deg)` }}>
      <circle r={r} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeDasharray={`${c * 0.25} ${c}`} strokeDashoffset={-c * 0.1} />
    </svg>
  );
}

export function OneEmail({ f }: { f: number }): React.JSX.Element {
  const enter = prog(f, 0, 10, easeOutExpo);
  const lift = prog(f, 36, 16, easeOutExpo);
  const scale = 1 + 0.04 * (f / 52) + 0.04 * lift;
  const chipIn = prog(f, 8, 12, easeOutExpo);
  const swap = prog(f, 36, 8);
  const pulse = (1 - Math.cos((2 * Math.PI * f) / 16)) / 2;
  const readColor = mixHex(DIM, VIOLET, pulse);
  const readW = textWidth("Serein is reading…", 22, 600);
  const sortW = textWidth("Sorted → Now", 22, 600);
  const textW = lerp(readW, sortW, easeOutCubic(swap));
  const subject = scramble(EMAILS[0].subject, f, 4, 24, 3);
  return (
    <AbsoluteFill>
      <Fill color={INK} />
      <GradientField f={f + 123} a={INK} b={INK2} opacity={0.3} />
      <At y={lerp(24, 0, enter)} transform={`scale(${scale})`} style={{ opacity: enter }}>
        <div style={{ position: "relative" }}>
          <EmailCard
            email={EMAILS[0]}
            width={1100}
            height={220}
            radius={28}
            senderSize={34}
            subjectSize={30}
            subjectColor={TEXT}
            subject={subject}
            avatar={64}
            shadowY={lerp(12, 40, lift)}
            style={{ boxShadow: `0 ${lerp(12, 40, lift)}px ${lerp(24, 60, lift)}px rgba(0,0,0,${lerp(0.45, 0.6, lift)})` }}
          >
            <div style={{ position: "absolute", left: 120, top: 146, width: 760, height: 14, borderRadius: 7, background: "rgba(148,163,184,0.2)" }} />
            <div style={{ position: "absolute", left: 120, top: 176, width: 520, height: 14, borderRadius: 7, background: "rgba(148,163,184,0.2)" }} />
          </EmailCard>
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 220 + 40,
              opacity: chipIn,
              transform: `translateY(${lerp(14, 0, chipIn)}px)`,
            }}
          >
            <Pill border={swap > 0 ? `rgba(253,164,175,${0.18 + 0.3 * swap})` : LINE}>
              <div style={{ position: "relative", width: 24, height: 24 }}>
                <div style={{ position: "absolute", inset: 0, opacity: 1 - swap }}>
                  <Spinner f={f} color={VIOLET} />
                </div>
                <div style={{ position: "absolute", left: 7, top: 7, width: 10, height: 10, borderRadius: 5, background: NOW, opacity: swap, boxShadow: `0 0 12px ${NOW}` }} />
              </div>
              <div style={{ position: "relative", width: textW, height: 26, fontSize: 22, fontWeight: 600, lineHeight: "26px" }}>
                <span style={{ position: "absolute", left: 0, color: readColor, opacity: 1 - swap }}>Serein is reading…</span>
                <span style={{ position: "absolute", left: 0, color: NOW, opacity: swap }}>Sorted → Now</span>
              </div>
            </Pill>
          </div>
        </div>
      </At>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// S4a Sort (245–349)

const COLUMNS: readonly Category[] = ["Now", "Later", "Never"];
const COL_X: Record<Category, number> = { Now: -520, Later: 0, Never: 520 };

interface Flyer {
  email: number;
  cat: Category;
  slot: number;
  start: number;
  fromX: number;
  fromY: number;
  fromRot: number;
}

const FLYERS: Flyer[] = (() => {
  const byCat: Record<Category, number[]> = { Now: [], Later: [], Never: [] };
  EMAILS.forEach((e, i) => byCat[e.category].push(i));
  const order: { email: number; cat: Category; slot: number }[] = [];
  for (let j = 0; j < 8; j++) {
    for (const cat of COLUMNS) {
      if (j < byCat[cat].length) order.push({ email: byCat[cat][j], cat, slot: j });
    }
  }
  return order.map((o, k) => ({
    ...o,
    start: 6 + k * ms(40),
    fromX: (hash(k * 5 + 1) * 2 - 1) * 900,
    fromY: (hash(k * 5 + 2) * 2 - 1) * 600,
    fromRot: (hash(k * 5 + 3) * 2 - 1) * 25,
  }));
})();

function CountTicker({ value }: { value: number }): React.JSX.Element {
  return <span style={{ fontVariantNumeric: "tabular-nums", color: DIM, fontWeight: 600 }}>{value}</span>;
}

export function Sort({ f }: { f: number }): React.JSX.Element {
  const rotY = lerp(-10, -4, f / 105);
  const pulse = (b: number): number => {
    const t = (f - (beat(b) - S4A)) / 8;
    return t < 0 || t > 1 ? 0 : Math.sin(Math.PI * t);
  };
  const headerScale = 1 + 0.06 * Math.max(pulse(4), pulse(6));
  return (
    <AbsoluteFill>
      <Fill color={INK} />
      <GradientField f={f + 250} a={INK} b={INK2} opacity={0.35} />
      <AbsoluteFill style={{ perspective: 2400 }}>
        <div
          style={{
            position: "absolute",
            left: WIDTH / 2,
            top: HEIGHT / 2,
            transformStyle: "preserve-3d",
            transform: `translateY(-50px) scale(0.88) rotateX(18deg) rotateY(${rotY}deg)`,
          }}
        >
          {COLUMNS.map((cat) => {
            const landed = FLYERS.filter((fl) => fl.cat === cat && spr(f, fl.start) > 0.9).length;
            return (
              <div
                key={cat}
                style={{
                  position: "absolute",
                  left: COL_X[cat],
                  top: -330,
                  transform: `translate(-50%, -50%) scale(${headerScale})`,
                  opacity: prog(f, 2, 10, easeOutExpo),
                }}
              >
                <Pill style={{ padding: "12px 24px", gap: 14 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 6, background: CATEGORY_COLOR[cat], boxShadow: `0 0 12px ${CATEGORY_COLOR[cat]}` }} />
                  <span style={{ fontSize: 24, fontWeight: 600, color: TEXT }}>{cat}</span>
                  <span style={{ fontSize: 24 }}><CountTicker value={landed} /></span>
                </Pill>
              </div>
            );
          })}
          {FLYERS.map((fl, k) => {
            const p = spr(f, fl.start);
            const x = lerp(fl.fromX, COL_X[fl.cat], p);
            const y = lerp(fl.fromY, -240 + fl.slot * 104, p);
            return (
              <div
                key={k}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  opacity: prog(f, fl.start, 4),
                  transform: `translate(${x - 210}px, ${y - 44}px) rotate(${lerp(fl.fromRot, 0, p)}deg) scale(${lerp(0.7, 1, p)})`,
                }}
              >
                <EmailCard email={EMAILS[fl.email]} />
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      <Scrim />
      <Kicker f={f} text="01 — Sort" />
      <Headline f={f} text="Sorted before you look." />
      <Flash f={f} dur={8} peak={0.6} />
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// S4b Summarize (350–455)

const BULLETS = ["Launch moves to Nov 12", "Budget approved, +8%", "You own the pricing page"];

export function Summarize({ f }: { f: number }): React.JSX.Element {
  const h = lerp(700, 300, spr(f, 50));
  const scanP = prog(f, 30, 20, (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2));
  const barY = lerp(118, 690, scanP);
  const barO = f < 30 ? 0 : 1 - prog(f, 48, 4);
  const chipDone = prog(f, 56, 8, easeOutExpo);
  const chipText = f < 56 ? "6 min read" : scramble("20 sec read", f, 56, 8, 5);
  const lineY = (i: number): number => 136 + i * 44;
  return (
    <AbsoluteFill>
      <Fill color={INK} />
      <GradientField f={f + 360} a={INK} b={INK2} opacity={0.35} />
      <At x={160} y={0}>
        <div
          style={{
            position: "relative",
            width: 900,
            height: h,
            borderRadius: 28,
            background: CARD,
            border: `1px solid ${LINE}`,
            boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
            overflow: "hidden",
            fontFamily: FONT,
            opacity: prog(f, 0, 8, easeOutExpo),
          }}
        >
          <div style={{ position: "absolute", left: 40, top: 36, width: 48, height: 48, borderRadius: 24, background: CATEGORY_COLOR.Later, opacity: 0.7 }} />
          <div style={{ position: "absolute", left: 108, top: 30, whiteSpace: "nowrap" }}>
            <div style={{ fontSize: 22, fontWeight: 600, color: DIM, lineHeight: 1.3 }}>Priya Nair</div>
            <div style={{ fontSize: 30, fontWeight: 600, color: TEXT, lineHeight: 1.3 }}>Q3 planning: notes from Tuesday</div>
          </div>
          <div style={{ position: "absolute", right: 36, top: 40 }}>
            <div style={{ position: "relative", borderRadius: 999, padding: 1, background: `linear-gradient(90deg, ${LINE}, ${LINE})` }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: 999, backgroundImage: DUSK, opacity: chipDone }} />
              <div style={{ position: "relative", borderRadius: 999, background: CARD, padding: "8px 18px", fontSize: 20, fontWeight: 600, color: f < 56 ? DIM : TEXT, whiteSpace: "nowrap", minWidth: 122, textAlign: "center" }}>
                {chipText}
              </div>
            </div>
          </div>
          {Array.from({ length: 12 }, (_, i) => {
            const inP = prog(f, 4 + i * 1.2, 10, easeOutExpo);
            const collapse = prog(f, 30 + ((lineY(i) - 118) / 572) * 20 - 1, 5, easeOutCubic);
            const w = [780, 700, 820, 610, 760, 690, 800, 540, 740, 660, 780, 420][i];
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: 40,
                  top: lineY(i),
                  width: w,
                  height: 16,
                  borderRadius: 8,
                  background: "rgba(148,163,184,0.2)",
                  opacity: inP * (1 - collapse * 0.6),
                  transform: `translateY(${lerp(-16, 0, inP)}px) scaleY(${1 - collapse})`,
                }}
              />
            );
          })}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: barY - 2,
              height: 4,
              backgroundImage: DUSK,
              opacity: barO,
              boxShadow: "0 0 8px rgba(167,139,250,0.9), 0 0 24px rgba(167,139,250,0.5)",
            }}
          />
          {BULLETS.map((b, i) => {
            const p = prog(f, 52 + i * ms(150), ms(300), easeOutExpo);
            return (
              <div
                key={b}
                style={{
                  position: "absolute",
                  left: 40,
                  top: 128 + i * 50,
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  fontSize: 28,
                  fontWeight: 400,
                  color: TEXT,
                  whiteSpace: "nowrap",
                  opacity: Math.min(1, p * 1.5),
                  clipPath: `inset(-6px ${(1 - p) * 100}% -6px -6px)`,
                }}
              >
                <div style={{ width: 10, height: 10, borderRadius: 5, backgroundImage: DUSK }} />
                {b}
              </div>
            );
          })}
        </div>
      </At>
      <Scrim />
      <Kicker f={f} text="02 — Summarize" />
      <Headline f={f} text="The gist, in three lines." />
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// S4c Reply (456–561)

const REPLY = "Signed. Thanks for chasing this. Sending the countersigned copy now.";
const TONES = ["Formal", "Brief", "Warm"];
const PLANE_PATH = "M2 30 L58 4 L40 56 L28 36 Z M28 36 L58 4";

/** The launch curve of the plane in frame coordinates, t in 0..1. */
function planeAt(t: number, from: { x: number; y: number }): { x: number; y: number; angle: number } {
  const p0 = from;
  const p1 = { x: from.x + 160, y: from.y - 40 };
  const p2 = { x: from.x + 260, y: from.y - 420 };
  const p3 = { x: 2150, y: -220 };
  const u = 1 - t;
  const x = u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x;
  const y = u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y;
  const dx = 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x);
  const dy = 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y);
  return { x, y, angle: (Math.atan2(dy, dx) * 180) / Math.PI };
}

const flightT = (f: number): number => prog(f, 64, 22, (t) => t * t * (3 - 2 * t));

function Plane({ f, from, opacity }: { f: number; from: { x: number; y: number }; opacity: number }): React.JSX.Element | null {
  if (f < 64) return null;
  const t = flightT(f);
  const p = planeAt(t, from);
  return (
    <div style={{ position: "absolute", left: p.x - 30, top: p.y - 30, width: 60, height: 60, opacity, transform: `rotate(${p.angle + 25}deg)` }}>
      <svg width={60} height={60} viewBox="0 0 60 60">
        <path d={PLANE_PATH} fill={TEXT} stroke={TEXT} strokeWidth={2} strokeLinejoin="round" />
        <path d="M28 36 L58 4" stroke={VIOLET} strokeWidth={2} />
      </svg>
    </div>
  );
}

export function Reply({ f }: { f: number }): React.JSX.Element {
  const cardX = WIDTH / 2 + 140 - 500;
  const cardY = HEIGHT / 2 - 230;
  const typed = Math.floor(REPLY.length * prog(f, 8, ms(1400)));
  const typing = f < 8 + ms(1400);
  const caretOn = typing || Math.floor((f - 8 - ms(1400)) / 8) % 2 === 0;
  const out = prog(f, 70, 16, (t) => t * t * (3 - 2 * t));
  const press = prog(f, 64, 3, easeOutCubic) * (1 - spr(f, 67));
  const toast = prog(f, 72, 12, easeOutExpo);
  const toneW = TONES.map((t) => textWidth(t, 22, 600) + 44);
  const toneX = toneW.map((_, i) => toneW.slice(0, i).reduce((a, b) => a + b + 12, 0));
  const sel = spr(f, 14);
  const selX = lerp(toneX[0], toneX[2], sel);
  const selW = lerp(toneW[0], toneW[2], sel);
  const sendCentre = { x: cardX + 1000 - 40 - 75, y: cardY + 460 - 40 - 32 };
  const enter = prog(f, 0, 10, easeOutExpo);
  return (
    <AbsoluteFill>
      <Fill color={INK} />
      <GradientField f={f + 470} a={INK} b={INK2} opacity={0.35} />
      <div
        style={{
          position: "absolute",
          left: cardX,
          top: cardY,
          width: 1000,
          height: 460,
          borderRadius: 28,
          background: CARD,
          border: `1px solid ${LINE}`,
          boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
          boxSizing: "border-box",
          fontFamily: FONT,
          opacity: enter * (1 - out),
          transform: `translateY(${lerp(20, 0, enter) + 40 * out}px)`,
        }}
      >
        <div style={{ position: "absolute", left: 44, top: 34, fontSize: 22, fontWeight: 600, color: DIM }}>To: Maya Chen</div>
        <div style={{ position: "absolute", left: 44, right: 44, top: 82, height: 1, background: LINE }} />
        <div style={{ position: "absolute", left: 44, top: 110, width: 900, fontSize: 36, fontWeight: 400, color: TEXT, lineHeight: 1.4, letterSpacing: "-0.01em" }}>
          {REPLY.slice(0, typed)}
          <span
            style={{
              display: "inline-block",
              width: 3,
              height: 42,
              marginLeft: 3,
              verticalAlign: "-8px",
              background: VIOLET,
              opacity: caretOn ? 1 : 0,
              boxShadow: "0 0 10px rgba(167,139,250,0.8)",
            }}
          />
        </div>
        <div style={{ position: "absolute", left: 44, top: 270, height: 48 }}>
          <div style={{ position: "absolute", left: selX, top: 0, width: selW, height: 48, borderRadius: 999, background: "rgba(167,139,250,0.25)", border: "1px solid rgba(167,139,250,0.45)", boxSizing: "border-box" }} />
          {TONES.map((t, i) => (
            <div
              key={t}
              style={{
                position: "absolute",
                left: toneX[i],
                top: 0,
                width: toneW[i],
                height: 48,
                lineHeight: "48px",
                textAlign: "center",
                fontSize: 22,
                fontWeight: 600,
                color: i === 2 ? mixHex(DIM, TEXT, sel) : i === 0 ? mixHex(TEXT, DIM, sel) : DIM,
                borderRadius: 999,
                border: `1px solid ${LINE}`,
                boxSizing: "border-box",
              }}
            >
              {t}
            </div>
          ))}
        </div>
        <div
          style={{
            position: "absolute",
            right: 40,
            bottom: 40,
            width: 150,
            height: 64,
            borderRadius: 999,
            backgroundImage: DUSK,
            color: INK,
            fontSize: 24,
            fontWeight: 600,
            lineHeight: "64px",
            textAlign: "center",
            transform: `scale(${1 - 0.06 * press})`,
            boxShadow: "0 12px 36px rgba(167,139,250,0.35)",
          }}
        >
          Send
        </div>
      </div>
      {/* Echo trail: 6 earlier copies. */}
      {Array.from({ length: 6 }, (_, k) => (
        <Plane key={`e${k}`} f={f - (k + 1) * 1.5} from={sendCentre} opacity={0.32 * (1 - (k + 1) / 7)} />
      ))}
      {/* Motion blur: 8 samples across a 180° shutter. */}
      {Array.from({ length: 8 }, (_, s) => (
        <Plane key={`s${s}`} f={f - 0.5 + (s / 7) * 0.5} from={sendCentre} opacity={0.3} />
      ))}
      <At y={-540 + 150 + lerp(-24, 0, toast)} style={{ opacity: toast }}>
        <Pill style={{ padding: "14px 26px" }}>
          <div style={{ width: 12, height: 12, borderRadius: 6, backgroundImage: DUSK }} />
          <span style={{ fontSize: 24, fontWeight: 600, color: TEXT }}>Sent · 0.4 s</span>
        </Pill>
      </At>
      <Scrim />
      <Kicker f={f} text="03 — Reply" />
      <Headline f={f} text="Drafts in your voice." />
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// S4d Inbox zero (562–614)

export function Zero({ f }: { f: number }): React.JSX.Element {
  const value = 2847 * (1 - easeInOutExpo(prog(f, 0, 38)));
  const slam = prog(f, 38, 7, easeOutExpo);
  const zero = f >= 38;
  const teal = prog(f, 30, 22, easeOutCubic);
  const sub = prog(f, 40, 12, easeOutExpo);
  return (
    <AbsoluteFill>
      <Fill color={INK} />
      <GradientField f={f + 560} a={INK} b={mixHex(INK2, CALM, teal)} opacity={0.85} />
      <At y={-40} transform={zero ? `scale(${lerp(1.4, 1, slam)})` : ""} style={{ filter: zero ? blurCss(30 * (1 - slam)) : undefined }}>
        <div style={{ fontFamily: FONT, fontSize: 320, fontWeight: 800, letterSpacing: "-0.045em", lineHeight: 1.1, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: TEXT }}>
          {zero ? <Dusk style={{ padding: "0 0.05em" }}>0</Dusk> : fmt(value)}
        </div>
      </At>
      <Particles f={f} from={38} dur={14} />
      <At y={170 + lerp(20, 0, sub)} style={{ opacity: sub }}>
        <div style={{ fontFamily: FONT, fontSize: 48, fontWeight: 600, color: TEXT, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
          Inbox zero. Every morning.
        </div>
      </At>
      <Kicker f={f} text="04 — Zero" />
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// S5 Promise (615–667)

export function WordCard({ f, word, dusk, wallFrom }: { f: number; word: string; dusk: boolean; wallFrom: number }): React.JSX.Element {
  const e = prog(f, 0, 7, easeOutExpo);
  const style: React.CSSProperties = {
    fontFamily: FONT,
    fontSize: 200,
    fontWeight: 800,
    letterSpacing: "-0.045em",
    lineHeight: 1.02,
    color: TEXT,
    textAlign: "center",
    width: 1728,
    paddingBottom: 12,
  };
  return (
    <AbsoluteFill>
      <Fill color={INK} />
      <AbsoluteFill style={{ opacity: 0.22, filter: blurCss(60) }}>
        <Wall scroll={300 + (wallFrom + f) * 1.4} push={120} unread={false} />
      </AbsoluteFill>
      <Vignette strength={0.8} />
      <At transform={`scale(${lerp(1.45, 1, e)})`} style={{ opacity: Math.min(1, (f + 1) / 2), filter: blurCss(42 * (1 - e)) }}>
        <div style={style}>{dusk ? <Dusk>{word}</Dusk> : word}</div>
      </At>
      <Flash f={f} dur={3} peak={0.2} />
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// S6 End card (668–779)

export function EndCard({ f }: { f: number }): React.JSX.Element {
  const logo = spr(f, 0);
  const tag = prog(f, 10, 14, easeOutExpo);
  const cta = prog(f, 20, 14, easeOutExpo);
  const leak = prog(f, 0, 12);
  return (
    <AbsoluteFill>
      <Fill color={INK} />
      <GradientField f={f + 700} a={INK} b={CALM} opacity={0.85} />
      <Glow size={1100} />
      <At>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ transform: `scale(${lerp(1.2, 1, logo)})`, opacity: prog(f, 0, 6) }}>
            <LogoRow f={f} markFrom={null} wordFrom={-100} />
          </div>
          <div style={{ marginTop: 40, opacity: tag, transform: `translateY(${lerp(20, 0, tag)}px)` }}>
            <Dusk style={{ fontFamily: FONT, fontSize: 56, fontWeight: 600, letterSpacing: "-0.01em", whiteSpace: "nowrap", display: "inline-block", paddingBottom: 6 }}>
              The inbox that sorts itself.
            </Dusk>
          </div>
          <div style={{ marginTop: 36, opacity: cta, transform: `translateY(${lerp(20, 0, cta)}px)` }}>
            <div
              style={{
                fontFamily: FONT,
                fontSize: 30,
                fontWeight: 400,
                color: TEXT,
                padding: "16px 36px",
                borderRadius: 999,
                border: "1px solid rgba(248,250,252,0.3)",
                whiteSpace: "nowrap",
                background: "rgba(10,15,31,0.35)",
              }}
            >
              Early access · Mac &amp; iPhone
            </div>
          </div>
        </div>
      </At>
      {leak < 1 && (
        <AbsoluteFill
          style={{
            mixBlendMode: "screen",
            opacity: Math.sin(Math.PI * leak) * 0.5,
            background: `radial-gradient(ellipse 60% 90% at ${lerp(-10, 110, leak)}% 40%, rgba(253,164,175,0.9) 0%, rgba(253,164,175,0.35) 40%, transparent 75%)`,
          }}
        />
      )}
      <Flash f={f} dur={10} peak={0.8} />
      <FadeOut f={f} from={97} dur={14} />
    </AbsoluteFill>
  );
}
