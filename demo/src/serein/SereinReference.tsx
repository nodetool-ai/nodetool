/**
 * The Serein launch film, built in Remotion as the reference for the Serein
 * benchmark (demo/benchmarks/serein/). It follows BRIEF.md frame by frame so
 * a judge run on this film shows what a full score looks like.
 *
 * Render: npm run render:serein-reference (from demo/).
 */
import React, { useEffect, useState } from "react";
import {
  AbsoluteFill,
  Sequence,
  continueRender,
  delayRender,
  useCurrentFrame,
} from "remotion";
import { ensureInterLoaded } from "../promo/fonts";
import { Grain } from "./parts";
import {
  EndCard,
  Flood,
  Name,
  OneEmail,
  Reply,
  RgbSplitDef,
  Sort,
  Summarize,
  WordCard,
  Zero,
} from "./scenes";
import {
  DURATION,
  HEIGHT,
  INK,
  S1,
  S2,
  S3,
  S4A,
  S4B,
  S4C,
  S4D,
  S5A,
  S5B,
  S6,
  hash,
  prog,
} from "./theme";

const WHIP = 8; // 250 ms
const WIPE = 11; // 350 ms
const IRIS = 9; // 300 ms

type Wrap = (g: number, node: React.ReactNode) => React.ReactNode;

/** A scene from `from` to `to` (exclusive). `wrap` gets the global frame for transitions. */
function Scene({
  from,
  to,
  render,
  wrap,
}: {
  from: number;
  to: number;
  render: (f: number) => React.ReactNode;
  wrap?: Wrap;
}): React.JSX.Element {
  return (
    <Sequence from={from} durationInFrames={to - from}>
      <Local from={from} render={render} wrap={wrap} />
    </Sequence>
  );
}

function Local({ from, render, wrap }: { from: number; render: (f: number) => React.ReactNode; wrap?: Wrap }): React.JSX.Element {
  const f = useCurrentFrame();
  const node = render(f);
  return <>{wrap ? wrap(from + f, node) : node}</>;
}

const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Whip: the pair slides left 1920 px with a horizontal smear. */
function whip(side: "out" | "in"): Wrap {
  return (g, node) => {
    const p = prog(g, S4B, WHIP, easeInOutCubic);
    if (p <= 0 && side === "out") return node;
    if (p >= 1 && side === "in") return node;
    const x = side === "out" ? -1920 * p : 1920 * (1 - p);
    const smear = Math.sin(Math.PI * p) * 60;
    const id = `whip-${side}-${g}`;
    return (
      <AbsoluteFill style={{ transform: `translateX(${x}px)` }}>
        <svg width={0} height={0} style={{ position: "absolute" }}>
          <filter id={id} x="-10%" y="0" width="120%" height="100%">
            <feGaussianBlur stdDeviation={`${smear} 0`} />
          </filter>
        </svg>
        <AbsoluteFill style={{ filter: `url(#${id})` }}>{node}</AbsoluteFill>
      </AbsoluteFill>
    );
  };
}

/** Gradient wipe with a noise map: pixels appear as the threshold falls through the noise. */
const gradientWipe: Wrap = (g, node) => {
  const p = prog(g, S4C, WIPE, (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2));
  if (p >= 1) return node;
  const slope = 12;
  const threshold = 0.95 - p * 1.0;
  return (
    <AbsoluteFill>
      <svg width={0} height={0} style={{ position: "absolute" }}>
        <filter id={`gw-${g}`} x="0" y="0" width="100%" height="100%" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.0035" numOctaves={3} seed={4} result="noise" />
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.6 0 0 0 -0.3" result="na" />
          <feComponentTransfer in="na" result="mask">
            <feFuncA type="linear" slope={slope} intercept={-slope * threshold} />
          </feComponentTransfer>
          <feComposite in="SourceGraphic" in2="mask" operator="in" />
        </filter>
      </svg>
      <AbsoluteFill style={{ filter: `url(#gw-${g})` }}>{node}</AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Iris from the centre. */
const iris: Wrap = (g, node) => {
  const p = prog(g, S4D, IRIS, easeInOutCubic);
  if (p >= 1) return node;
  return <AbsoluteFill style={{ clipPath: `circle(${p * 1110}px at 50% 50%)` }}>{node}</AbsoluteFill>;
};

/** Full-frame slice glitch with an RGB split, `amount` 0..1. */
function FrameGlitch({ g, amount, children }: { g: number; amount: number; children: React.ReactNode }): React.JSX.Element {
  if (amount <= 0) return <>{children}</>;
  const bands = 10;
  const id = `glitch-${g}`;
  return (
    <AbsoluteFill>
      <RgbSplitDef id={id} d={amount * 18} />
      <AbsoluteFill style={{ filter: `url(#${id})` }}>
        {Array.from({ length: bands }, (_, i) => {
          const on = hash(i * 11 + g * 5) > 0.4;
          const dx = on ? (hash(i * 7 + g * 13) - 0.5) * 2 * amount * 160 : 0;
          const top = (i / bands) * HEIGHT;
          const bottom = HEIGHT - ((i + 1) / bands) * HEIGHT;
          return (
            <AbsoluteFill key={i} style={{ clipPath: `inset(${top}px 0 ${bottom}px 0)`, transform: `translateX(${dx}px)` }}>
              {children}
            </AbsoluteFill>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/** The 150 ms glitch that joins the two S5 word cards around frame 642. */
const GLITCH_AMOUNT: Record<number, number> = { 640: 0.45, 641: 1, 642: 1, 643: 0.5, 644: 0.2 };
const glitchWrap: Wrap = (g, node) => <FrameGlitch g={g} amount={GLITCH_AMOUNT[g] ?? 0}>{node}</FrameGlitch>;

function GlobalGrain(): React.JSX.Element {
  return <Grain f={useCurrentFrame()} />;
}

export function SereinReference(): React.JSX.Element | null {
  const [handle] = useState(() => delayRender("serein: load Inter"));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    ensureInterLoaded()
      .catch(() => undefined)
      .then(() => {
        setReady(true);
        continueRender(handle);
      });
  }, [handle]);
  if (!ready) return null;
  return (
    <AbsoluteFill style={{ background: INK }}>
      <Scene from={S1} to={S2} render={(f) => <Flood f={f} />} />
      <Scene from={S2} to={S3} render={(f) => <Name f={f} />} />
      <Scene from={S3} to={S4A} render={(f) => <OneEmail f={f} />} />
      <Scene from={S4A} to={S4B + WHIP} render={(f) => <Sort f={f} />} wrap={whip("out")} />
      <Scene from={S4B} to={S4C + WIPE} render={(f) => <Summarize f={f} />} wrap={whip("in")} />
      <Scene from={S4C} to={S4D + IRIS} render={(f) => <Reply f={f} />} wrap={gradientWipe} />
      <Scene from={S4D} to={S5A} render={(f) => <Zero f={f} />} wrap={iris} />
      <Scene from={S5A} to={S5B} render={(f) => <WordCard f={f} word="Private by design." dusk={false} wallFrom={0} />} wrap={glitchWrap} />
      <Scene from={S5B} to={S6} render={(f) => <WordCard f={f} word="Runs on-device." dusk wallFrom={27} />} wrap={glitchWrap} />
      <Scene from={S6} to={DURATION} render={(f) => <EndCard f={f} />} />
      <GlobalGrain />
    </AbsoluteFill>
  );
}
