import React from "react";
import { AbsoluteFill, Img, random, staticFile, useCurrentFrame } from "remotion";
import { Glow, backOut, clamp01, easeOut } from "./fx";
import { COLOR, FONT, HEIGHT, WIDTH } from "./theme";

/**
 * A side-scrolling render of the Kindle level made from the game's own
 * prepared art. Frames are local to the parent sequence.
 */

export const GROUND_Y = 860;
const TILE = 96;
const HERO_SIZE = 170;
export const HERO_SCREEN_X = 640;

export type Prop = { kind: "brazier" | "crawler" | "mushroom" | "lift" | "beacon" | "thorns"; x: number; y?: number };

/** World layout. Positions are world pixels; the ground is at GROUND_Y. */
export const WORLD_PROPS: Prop[] = [
  { kind: "brazier", x: 1150 },
  { kind: "mushroom", x: 1750 },
  { kind: "lift", x: 2250, y: GROUND_Y - 300 },
  { kind: "crawler", x: 2700 },
  { kind: "thorns", x: 3200 },
  { kind: "brazier", x: 3800 },
  { kind: "lift", x: 4300, y: GROUND_Y - 330 },
  { kind: "crawler", x: 4850 },
  { kind: "mushroom", x: 5400 },
  { kind: "thorns", x: 5900 },
  { kind: "crawler", x: 6500 },
  { kind: "brazier", x: 7100 },
  { kind: "lift", x: 7650, y: GROUND_Y - 310 },
  { kind: "crawler", x: 8200 },
  { kind: "thorns", x: 8800 },
  { kind: "brazier", x: 9400 },
  { kind: "crawler", x: 10000 },
  { kind: "beacon", x: 10700 },
];

const PROP_ART: Record<Prop["kind"], { src: string; w: number; h: number }> = {
  brazier: { src: "vibe/g-brazier.webp", w: 150, h: 150 },
  crawler: { src: "vibe/g-crawler.webp", w: 230, h: 96 },
  mushroom: { src: "vibe/g-mushroom.webp", w: 170, h: 156 },
  lift: { src: "vibe/g-lift.webp", w: 300, h: 94 },
  beacon: { src: "vibe/g-beacon.webp", w: 220, h: 330 },
  thorns: { src: "vibe/g-thorns.webp", w: 260, h: 73 },
};

export interface GameSceneProps {
  camX: number;
  /** Hero jump height in px, 0 on the ground. */
  heroLift?: number;
  heroRising?: boolean;
  heroRunning?: boolean;
  heroVisible?: boolean;
  /** Local frame since the assembly began, or undefined when fully built. */
  build?: number;
  /** World x positions of embers, and the frame each is collected (or Infinity). */
  embers?: Array<{ x: number; y: number; takenAt: number }>;
  /** Braziers left of this world x burn. */
  litBefore?: number;
  /** Beacon flame strength 0..1. */
  beacon?: number;
  props?: Prop[];
}

function Layer({ src, w, h, bottom, factor, camX, opacity = 1, top }: { src: string; w: number; h: number; bottom?: number; top?: number; factor: number; camX: number; opacity?: number }): React.JSX.Element {
  const offset = -((camX * factor) % w);
  const pos: React.CSSProperties = top !== undefined ? { top } : { top: (bottom ?? HEIGHT) - h };
  const tiles = Math.ceil(WIDTH / w) + 1;
  return (
    <div style={{ position: "absolute", left: 0, width: WIDTH, height: h, overflow: "hidden", opacity, ...pos }}>
      {Array.from({ length: tiles }, (_, i) => (
        <Img key={i} src={staticFile(src)} style={{ position: "absolute", left: offset + i * w, top: 0, width: w, height: h, maxWidth: "none" }} />
      ))}
    </div>
  );
}

/**
 * One cell of a sprite sheet, cropped from an <Img>. A CSS background would
 * not hold the render until it loads, so frames could paint without it.
 */
export function SheetFrame({
  src,
  sheetW,
  sheetH,
  x,
  y,
  w,
  h,
  style,
}: {
  src: string;
  sheetW: number;
  sheetH: number;
  x: number;
  y: number;
  w: number;
  h: number;
  style?: React.CSSProperties;
}): React.JSX.Element {
  return (
    <div style={{ position: "absolute", width: w, height: h, overflow: "hidden", ...style }}>
      <Img src={staticFile(src)} style={{ position: "absolute", left: -x, top: -y, width: sheetW, height: sheetH, maxWidth: "none" }} />
    </div>
  );
}

export function Sprite({ src, frame, frames, size, style }: { src: string; frame: number; frames: number; size: number; style?: React.CSSProperties }): React.JSX.Element {
  return <SheetFrame src={src} sheetW={size * frames} sheetH={size} x={(frame % frames) * size} y={0} w={size} h={size} style={style} />;
}

export function GameScene({
  camX,
  heroLift = 0,
  heroRising = false,
  heroRunning = true,
  heroVisible = true,
  build,
  embers = [],
  litBefore = -Infinity,
  beacon = 0,
  props = WORLD_PROPS,
}: GameSceneProps): React.JSX.Element {
  const frame = useCurrentFrame();
  const b = build ?? 1e6;
  const appear = (from: number, len = 10): number => easeOut((b - from) / len);

  const skyT = appear(0, 14);
  const farT = appear(10);
  const midT = appear(18);
  const vinesT = appear(56);
  const heroT = appear(100, 8);

  const heroFrame = heroLift > 4 ? (heroRising ? 6 : 7) : heroRunning ? 2 + (Math.floor(frame / 4) % 4) : Math.floor(frame / 22) % 2;
  const columns = Math.ceil(WIDTH / TILE) + 2;
  const firstCol = Math.floor(camX / TILE);

  return (
    <AbsoluteFill style={{ background: COLOR.ink, overflow: "hidden" }}>
      <AbsoluteFill style={{ opacity: skyT, transform: `scale(${1.12 - 0.04 * skyT})` }}>
        <Img src={staticFile("vibe/g-sky.jpg")} style={{ width: WIDTH, height: HEIGHT, objectFit: "cover", transform: `translateX(${-((camX * 0.03) % 60)}px)` }} />
      </AbsoluteFill>
      <div style={{ position: "absolute", inset: 0, transform: `translateY(${(1 - farT) * 300}px)`, opacity: farT }}>
        <Layer src="vibe/g-far.webp" w={3630 * 1.25} h={600} bottom={GROUND_Y + 40} factor={0.18} camX={camX} />
      </div>
      <div style={{ position: "absolute", inset: 0, transform: `translateY(${(1 - midT) * 400}px)`, opacity: midT }}>
        <Layer src="vibe/g-mid.webp" w={3438 * 1.2} h={691} bottom={GROUND_Y + 60} factor={0.42} camX={camX} />
      </div>

      {/* Ground columns build in left to right during assembly. */}
      {Array.from({ length: columns }, (_, i) => {
        const col = firstCol + i;
        const x = col * TILE - camX;
        const t = appear(26 + i * 1.1, 8);
        if (t <= 0) return null;
        return (
          <div
            key={col}
            style={{
              position: "absolute",
              left: x,
              top: GROUND_Y + (1 - t) * -500,
              width: TILE + 1,
              height: HEIGHT - GROUND_Y,
              opacity: t,
              overflow: "hidden",
              borderTop: `6px solid #3f7d5a`,
            }}
          >
            {[0, 1].map((r) => (
              <Img
                key={r}
                src={staticFile("vibe/gen-stone.jpg")}
                style={{ position: "absolute", left: -(col % 2) * TILE, top: r * TILE * 2, width: TILE * 2, height: TILE * 2, maxWidth: "none" }}
              />
            ))}
            <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 10px 18px rgba(0,0,0,0.45)" }} />
          </div>
        );
      })}

      {/* Props */}
      {props.map((p, i) => {
        const art = PROP_ART[p.kind];
        const sx = p.x - camX;
        if (sx < -400 || sx > WIDTH + 400) return null;
        const t = backOut((b - 60 - i * 3) / 10, 1.8);
        if (b < 60 + i * 3) return null;
        const baseY = (p.y ?? GROUND_Y) - art.h;
        const bob = p.kind === "lift" ? Math.sin((frame + i * 20) / 18) * 10 : 0;
        const crawl = p.kind === "crawler" ? Math.sin((frame + i * 13) / 10) * 30 : 0;
        const lit = p.kind === "brazier" && p.x < litBefore;
        return (
          <div key={i} style={{ position: "absolute", left: sx + crawl, top: baseY + bob - (1 - t) * 400, width: art.w, height: art.h }}>
            {lit || (p.kind === "beacon" && beacon > 0) ? (
              <>
                <Glow size={440} strength={p.kind === "beacon" ? 0.7 * beacon : 0.55} style={{ left: art.w / 2 - 220, top: -200 }} />
                <Sprite
                  src="vibe/g-flame.webp"
                  frame={Math.floor(frame / 4)}
                  frames={6}
                  size={p.kind === "beacon" ? 200 * (0.5 + beacon * 0.5) : 110}
                  style={{
                    left: art.w / 2 - (p.kind === "beacon" ? 100 * (0.5 + beacon * 0.5) : 55),
                    top: p.kind === "beacon" ? -170 * (0.5 + beacon * 0.5) : -80,
                  }}
                />
              </>
            ) : null}
            <Img src={staticFile(art.src)} style={{ position: "absolute", inset: 0, width: art.w, height: art.h, transform: p.kind === "crawler" && crawl < 0 ? "scaleX(-1)" : undefined }} />
          </div>
        );
      })}

      {/* Embers */}
      {embers.map((e, i) => {
        const sx = e.x - camX;
        if (sx < -100 || sx > WIDTH + 100) return null;
        const taken = frame >= e.takenAt;
        const tt = clamp01((frame - e.takenAt) / 10);
        if (taken && tt >= 1) return null;
        return (
          <div key={i} style={{ position: "absolute", left: sx - 48, top: e.y - 48 + Math.sin((frame + i * 9) / 7) * 8, transform: `scale(${taken ? 1 + tt * 2 : 1})`, opacity: taken ? 1 - tt : 1 }}>
            <Glow size={176} strength={0.55} style={{ left: -40, top: -40 }} />
            <Sprite src="vibe/g-ember.webp" frame={Math.floor((frame + i) / 5)} frames={4} size={96} />
          </div>
        );
      })}

      {/* Hero */}
      {heroVisible && heroT > 0 ? (
        <div
          style={{
            position: "absolute",
            left: HERO_SCREEN_X - HERO_SIZE / 2,
            top: GROUND_Y - HERO_SIZE + 18 - heroLift,
            transform: `scale(${backOut(heroT, 2.5)})`,
          }}
        >
          <Glow size={520} strength={0.45} style={{ left: -175, top: -175 }} />
          <Sprite src="vibe/g-hero.webp" frame={heroFrame} frames={8} size={HERO_SIZE} />
          {heroRunning && heroLift < 4
            ? Array.from({ length: 4 }, (_, i) => (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: -20 - i * 34 - ((frame * 7) % 34),
                    top: HERO_SIZE - 26 - random(`d${i}${Math.floor(frame / 3)}`) * 16,
                    width: 18 - i * 3,
                    height: 18 - i * 3,
                    borderRadius: 10,
                    background: "rgba(255,190,120,0.5)",
                  }}
                />
              ))
            : null}
        </div>
      ) : null}

      {/* Foreground vines */}
      <div style={{ position: "absolute", inset: 0, transform: `translateY(${(1 - vinesT) * -400}px)`, opacity: vinesT }}>
        <Layer src="vibe/g-vines.webp" w={1644 * 1.3} h={416} top={-20} factor={1.25} camX={camX} />
      </div>

      {/* Grade */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 35% 60%, rgba(255,120,40,0.12), transparent 60%)", mixBlendMode: "screen" }} />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(5,7,12,0.2), transparent 30%, transparent 75%, rgba(5,7,12,0.5))" }} />
    </AbsoluteFill>
  );
}

/** "EMBERS 12 / 73" in the game's own HUD style. */
export function GameHud({ embers, style }: { embers: number; style?: React.CSSProperties }): React.JSX.Element {
  return (
    <div style={{ position: "absolute", left: 56, top: 170, fontFamily: FONT.hud, lineHeight: 1, ...style }}>
      <div style={{ fontSize: 54, color: COLOR.flame, letterSpacing: 2 }}>EMBERS {embers} / 73</div>
    </div>
  );
}
