import React from "react";
import { AbsoluteFill, Img, interpolate, random, staticFile, useCurrentFrame } from "remotion";
import musicBands from "../../public/vibe/music-bands.json";
import {
  ChromaText,
  Glow,
  HorizonStreaks,
  SlamLabel,
  SpeedLines,
  backOut,
  beatPulse,
  clamp01,
  easeIn,
  easeInOut,
  easeOut,
} from "./fx";
import { GameHud, GameScene, GROUND_Y, HERO_SCREEN_X, SheetFrame, Sprite, type Prop } from "./GameScene";
import { lapTime } from "./Hud";
import { Chip, GenImage, Terminal } from "./Terminal";
import { MUSIC_AT, PROPS, PROP_AT, SFX, SFX_AT, SPRITE_CELLS_AT, LAYER_AT } from "./timeline";
import { BAR, BEAT, COLOR, FONT, HEIGHT, SECTION, WIDTH, bars } from "./theme";

const bands = musicBands as number[][];

// ---------------------------------------------------------------- lights

export function LightsScene(): React.JSX.Element {
  const frame = useCurrentFrame();
  const prompt = "make me a 2d platformer. go.";
  const chars = Math.floor(clamp01((frame - 6) / 30) * prompt.length);
  const tension = clamp01((frame - BAR) / BAR);
  const lit = [0, 1, 2, 3].map((i) => frame >= BAR + i * BEAT);
  const housing = easeOut((frame - 62) / 12);
  return (
    <AbsoluteFill style={{ background: COLOR.ink, alignItems: "center", justifyContent: "center" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 50% 40%, rgba(255,40,40,${0.25 * tension}), transparent 60%)`,
        }}
      />
      <div style={{ position: "absolute", top: 150, display: "flex", gap: 44, opacity: housing, transform: `translateY(${(1 - housing) * -60}px)` }}>
        {lit.map((on, i) => (
          <div key={i} style={{ width: 150, padding: 18, background: "#111", borderRadius: 24, border: "2px solid #222", display: "flex", flexDirection: "column", gap: 16 }}>
            {[0, 1].map((j) => (
              <div
                key={j}
                style={{
                  width: 114,
                  height: 114,
                  borderRadius: 57,
                  background: on ? "radial-gradient(circle at 40% 35%, #ff8080, #ff1a1a 45%, #8a0000)" : "#2a0a0a",
                  boxShadow: on ? "0 0 60px 12px rgba(255,30,30,0.7)" : "inset 0 6px 16px rgba(0,0,0,0.8)",
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 360,
          maxWidth: 1500,
          fontFamily: FONT.mono,
          fontSize: 50,
          lineHeight: 1.35,
          color: COLOR.text,
          textAlign: "left",
          transform: `scale(${1 + tension * 0.08})`,
        }}
      >
        <span style={{ color: COLOR.ember }}>&gt; </span>
        {prompt.slice(0, chars)}
        <span style={{ background: COLOR.ember, opacity: Math.floor(frame / 8) % 2 ? 1 : 0 }}>&nbsp;</span>
      </div>
      <div style={{ position: "absolute", bottom: 90, fontFamily: FONT.hud, fontSize: 34, letterSpacing: 8, color: COLOR.dim, opacity: housing }}>
        ~/KINDLE · AGENT SESSION · NODETOOL MCP CONNECTED
      </div>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- drop

const DROP_WORDS: Array<[string, string]> = [
  ["SPRITES", COLOR.flame],
  ["BACKDROPS", COLOR.teal],
  ["MUSIC", COLOR.violet],
  ["GO.", COLOR.text],
];

export function DropScene(): React.JSX.Element {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, BAR], [1.7, 1.05]);
  return (
    <AbsoluteFill style={{ background: COLOR.ink }}>
      <AbsoluteFill style={{ transform: `scale(${zoom})`, filter: "blur(10px) saturate(1.3)", opacity: 0.55 }}>
        <Img src={staticFile("vibe/gen-sky.jpg")} style={{ width: WIDTH, height: HEIGHT, objectFit: "cover" }} />
      </AbsoluteFill>
      <SpeedLines intensity={1} color={COLOR.flame} seed="drop" />
      {DROP_WORDS.map(([word, color], i) => (
        <SlamLabel key={word} at={i * BEAT} text={word} color={color} hold={BEAT} />
      ))}
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- sprites

const SHEET_W = 840;
const SHEET_H = 560;
const CELL_W = 210;
const CELL_H = 280;
const GRID_X = 980;
const GRID_Y = 250;

export function SpritesScene(): React.JSX.Element {
  const frame = useCurrentFrame();
  const from = bars(SECTION.sprites);
  const merge = easeIn((frame - 100) / 20);
  const heroIn = frame >= 118;
  const jumpPhase = [180, 220].map((t) => frame - t).find((p) => p >= 0 && p < 30);
  const lift = jumpPhase === undefined ? 0 : 4 * 260 * (jumpPhase / 30) * (1 - jumpPhase / 30);
  const heroFrame = lift > 4 ? ((jumpPhase ?? 0) < 15 ? 6 : 7) : 2 + (Math.floor(frame / 4) % 4);
  const heroScale = backOut((frame - 118) / 10, 2);
  const groundShift = (frame * 38) % 120;

  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 70% 45%, #1b1420, ${COLOR.ink} 70%)` }}>
      <Terminal
        x={70}
        y={230}
        width={850}
        prompt="flame spirit sprite sheet"
        typeFrom={1}
        typeFrames={14}
        exit={104}
        lines={[
          { at: 16, text: "generate image", kind: "tool", progress: SPRITE_CELLS_AT[7] - from - 16 },
        ]}
      />
      {frame < 122
        ? SPRITE_CELLS_AT.map((at, i) => {
            const t = frame - (at - from);
            if (t < 0) return null;
            const col = i % 4;
            const row = Math.floor(i / 4);
            const x0 = GRID_X + col * (CELL_W + 12);
            const y0 = GRID_Y + row * (CELL_H + 12);
            const s = interpolate(backOut(t / 8, 2.2), [0, 1], [1.7, 1]) * (1 - merge * 0.8);
            const x = interpolate(merge, [0, 1], [x0, WIDTH / 2 - CELL_W / 2]);
            const y = interpolate(merge, [0, 1], [y0, HEIGHT / 2 - CELL_H / 2]);
            const flash = clamp01(1 - t / 8);
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: x,
                  top: y,
                  width: CELL_W,
                  height: CELL_H,
                  transform: `scale(${s})`,
                  opacity: 1 - merge,
                  border: `3px solid ${flash > 0 ? COLOR.flame : COLOR.line}`,
                  background: `rgba(255,138,42,${0.08 + flash * 0.4})`,
                  boxShadow: flash > 0 ? `0 0 50px ${COLOR.ember}` : undefined,
                  boxSizing: "border-box",
                  overflow: "hidden",
                }}
              >
                <SheetFrame src="vibe/gen-hero-sheet.webp" sheetW={SHEET_W} sheetH={SHEET_H} x={col * CELL_W} y={row * CELL_H} w={CELL_W} h={CELL_H} style={{ left: -3, top: -3 }} />
              </div>
            );
          })
        : null}
      {heroIn ? (
        <>
          <HorizonStreaks intensity={clamp01((frame - 118) / 20)} seed="sprite" />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 800,
              height: 8,
              backgroundImage: `repeating-linear-gradient(90deg, ${COLOR.ember} 0 60px, transparent 60px 120px)`,
              backgroundPositionX: -groundShift,
              opacity: 0.8,
            }}
          />
          <div style={{ position: "absolute", left: WIDTH / 2 - 260, top: 800 - 500 - lift, transform: `scale(${heroScale})` }}>
            <Glow size={1020} strength={0.4} style={{ left: -250, top: -250 }} />
            <div style={{ position: "relative", width: 520, height: 520 }}>
              <Sprite src="vibe/g-hero.webp" frame={heroFrame} frames={8} size={520} />
            </div>
          </div>
          <div style={{ position: "absolute", top: 200, width: "100%", textAlign: "center", opacity: clamp01((frame - 124) / 6) }}>
            <Chip text="HERO.PNG ✓  RUN · JUMP · FALL" color={COLOR.flame} style={{ fontSize: 28 }} />
          </div>
        </>
      ) : null}
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- props

const PROP_INFO: Record<(typeof PROPS)[number], { w: number; h: number; tint: string }> = {
  crawler: { w: 760, h: 760, tint: "#2a1640" },
  mushroom: { w: 700, h: 700, tint: "#0b3038" },
  beacon: { w: 480, h: 720, tint: "#3a2208" },
  brazier: { w: 700, h: 700, tint: "#2c2418" },
  lift: { w: 900, h: 600, tint: "#12283a" },
  thorns: { w: 900, h: 600, tint: "#3a0c14" },
};

export function PropsScene(): React.JSX.Element {
  const frame = useCurrentFrame();
  const from = bars(SECTION.props);
  const idx = PROP_AT.reduce((acc, at, i) => (frame >= at - from ? i : acc), 0);
  const name = PROPS[idx];
  const info = PROP_INFO[name];
  const t = frame - (PROP_AT[idx] - from);
  const enter = easeOut(t / 5);
  const blur = (1 - clamp01(t / 4)) * 14;
  const s = interpolate(backOut(t / 7, 2), [0, 1], [1.35, 1]);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 55%, ${info.tint}, ${COLOR.ink} 70%)`, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          width: "100%",
          top: 250,
          textAlign: "center",
          fontFamily: FONT.hud,
          fontSize: 460,
          lineHeight: 1,
          color: "transparent",
          WebkitTextStroke: `3px rgba(255,255,255,0.18)`,
          transform: `translateX(${(1 - enter) * -400 - t * 6}px)`,
          letterSpacing: 10,
        }}
      >
        {name.toUpperCase()}
      </div>
      <SpeedLines intensity={0.5} color={COLOR.flame} seed={`p${idx}`} />
      <Img
        src={staticFile(`vibe/gen-${name}.webp`)}
        style={{
          position: "absolute",
          left: WIDTH / 2 - info.w / 2,
          top: HEIGHT / 2 - info.h / 2 + 30,
          width: info.w,
          height: info.h,
          objectFit: "contain",
          transform: `translateX(${(1 - enter) * 700}px) scale(${s})`,
          filter: `blur(${blur}px) drop-shadow(0 30px 60px rgba(0,0,0,0.6))`,
        }}
      />
      <div style={{ position: "absolute", right: 80, bottom: 170 }}>
        <Chip text={`${name.toUpperCase()}.PNG ✓`} color={COLOR.flame} />
      </div>
      <div style={{ position: "absolute", left: 80, top: 190, fontFamily: FONT.hud, fontSize: 48, color: COLOR.flame, letterSpacing: 4 }}>
        SPRITE {idx + 2} / 7
      </div>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- backdrops

export function BackdropsScene(): React.JSX.Element {
  const frame = useCurrentFrame();
  const from = bars(SECTION.backgrounds);
  const [skyAt, farAt, midAt, vinesAt] = LAYER_AT.map((f) => f - from);
  const push = 1 + easeInOut((frame - 120) / 40) * 0.1;
  const layer = (at: number, dir: 1 | -1): { y: number; o: number } => {
    const t = backOut((frame - at) / 10, 1.4);
    return { y: (1 - t) * 500 * dir, o: clamp01((frame - at) / 4) };
  };
  const far = layer(farAt, 1);
  const mid = layer(midAt, 1);
  const vines = layer(vinesAt, -1);
  const chips: Array<[number, string]> = [
    [skyAt + 22, "SKY.JPG ✓"],
    [farAt, "FAR.PNG ✓"],
    [midAt, "MID.PNG ✓"],
    [vinesAt, "VINES.PNG ✓"],
  ];
  return (
    <AbsoluteFill style={{ background: COLOR.ink, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${push})` }}>
        <GenImage src="vibe/gen-sky.jpg" width={WIDTH} height={HEIGHT} at={skyAt} steps={5} stepFrames={4} />
        {frame >= farAt ? (
          <Img src={staticFile("vibe/gen-far.webp")} style={{ position: "absolute", left: -40, top: HEIGHT - 600 + far.y, width: WIDTH + 80, height: 816 * ((WIDTH + 80) / 1920), opacity: far.o }} />
        ) : null}
        {frame >= midAt ? (
          <Img src={staticFile("vibe/gen-mid.webp")} style={{ position: "absolute", left: -80, top: HEIGHT - 560 + mid.y, width: WIDTH + 160, height: 816 * ((WIDTH + 160) / 1920), opacity: mid.o }} />
        ) : null}
        {frame >= vinesAt ? (
          <Img src={staticFile("vibe/gen-vines.webp")} style={{ position: "absolute", left: -60, top: -120 + vines.y, width: WIDTH + 120, height: 816 * ((WIDTH + 120) / 1920), opacity: vines.o }} />
        ) : null}
      </AbsoluteFill>
      <Terminal
        x={360}
        y={200}
        width={1200}
        prompt="backdrop: vast underground cavern temple, ember haze, teal darkness, split into parallax layers"
        typeFrom={1}
        typeFrames={14}
        exit={skyAt - 4}
        lines={[
          { at: 16, text: "nodetool.media.generateImage ×4", kind: "tool", progress: 18 },
          { at: 19, text: "nano banana pro · 2k · 16:9  +  gpt-image-2.5 flare · alpha", kind: "dim" },
        ]}
      />
      <div style={{ position: "absolute", left: 56, top: 200, display: "flex", flexDirection: "column", gap: 12 }}>
        {chips.map(([at, text]) =>
          frame >= at ? (
            <div key={text} style={{ transform: `translateX(${(1 - easeOut((frame - at) / 6)) * -200}px)` }}>
              <Chip text={text} color={COLOR.teal} />
            </div>
          ) : null,
        )}
      </div>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- parallax

export function ParallaxScene(): React.JSX.Element {
  const frame = useCurrentFrame();
  const camX = 6 * frame + 0.107 * frame * frame;
  return (
    <AbsoluteFill>
      <GameScene camX={camX} props={[]} />
      <HorizonStreaks intensity={0.3 + 0.7 * clamp01(frame / 120)} seed="px" />
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- music

export function MusicScene(): React.JSX.Element {
  const frame = useCurrentFrame();
  const from = bars(SECTION.music);
  const start = MUSIC_AT - from;
  const t = frame - start;
  const row = t >= 0 ? bands[Math.min(bands.length - 1, t)] : undefined;
  const riser = clamp01((frame - 2 * BAR) / BAR);
  const ringIn = backOut(t / 12, 1.8);
  const spin = frame * (0.4 + riser * riser * 6);
  const level = row ? row.reduce((a, b) => a + b, 0) / row.length : 0;
  return (
    <AbsoluteFill style={{ background: COLOR.ink, overflow: "hidden" }}>
      <AbsoluteFill style={{ opacity: 0.35, filter: "blur(18px)", transform: `scale(${1.1 + riser * 0.3})` }}>
        <Img src={staticFile("vibe/g-sky.jpg")} style={{ width: WIDTH, height: HEIGHT, objectFit: "cover" }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 52%, rgba(167,139,250,${0.15 + level * 0.5}), transparent 55%)` }} />
      <Terminal
        x={360}
        y={200}
        width={1200}
        prompt="looping soundtrack, drowned temple"
        typeFrom={1}
        typeFrames={18}
        exit={start + 8}
        lines={[
          { at: 20, text: "generate music", kind: "tool", progress: start - 22 },
        ]}
      />
      {row ? (
        <AbsoluteFill style={{ transform: `scale(${ringIn * (1 + riser * 0.45)})` }}>
          <svg width={WIDTH} height={HEIGHT}>
            <g transform={`translate(${WIDTH / 2} ${HEIGHT / 2 + 20}) rotate(${spin})`}>
              {Array.from({ length: row.length * 2 }, (_, i) => {
                const v = row[i < row.length ? i : row.length * 2 - 1 - i];
                const a = (i / (row.length * 2)) * Math.PI * 2;
                const r0 = 230;
                const r1 = r0 + 20 + v * 260;
                const color = i % 2 ? COLOR.violet : COLOR.flame;
                return (
                  <line
                    key={i}
                    x1={Math.cos(a) * r0}
                    y1={Math.sin(a) * r0}
                    x2={Math.cos(a) * r1}
                    y2={Math.sin(a) * r1}
                    stroke={color}
                    strokeWidth={9}
                    strokeLinecap="round"
                    opacity={0.55 + v * 0.45}
                  />
                );
              })}
            </g>
          </svg>
          <div
            style={{
              position: "absolute",
              left: WIDTH / 2 - 190,
              top: HEIGHT / 2 + 20 - 190,
              width: 380,
              height: 380,
              borderRadius: 190,
              background: "radial-gradient(circle at 45% 40%, #2a1f3f, #0b0712 70%)",
              border: `3px solid rgba(167,139,250,0.5)`,
              boxShadow: `0 0 ${60 + level * 140}px rgba(167,139,250,0.55)`,
              overflow: "hidden",
            }}
          >
            <Sprite
              src="vibe/g-hero.webp"
              frame={Math.floor(frame / 22) % 2}
              frames={8}
              size={260}
              style={{ left: 60, top: 40 + Math.sin(frame / 10) * 10 }}
            />
          </div>
        </AbsoluteFill>
      ) : null}
      {row ? (
        <>
          <div style={{ position: "absolute", top: 200, width: "100%", textAlign: "center", opacity: clamp01(t / 6) }}>
            <Chip text="♪  KINDLE-THEME.MP3 · 30 S LOOP · NOW PLAYING" color={COLOR.violet} style={{ fontSize: 28 }} />
          </div>
          <div style={{ position: "absolute", left: 420, right: 420, bottom: 150, height: 70, display: "flex", alignItems: "flex-end", gap: 4 }}>
            {row.map((v, i) => (
              <div key={i} style={{ flex: 1, height: `${10 + v * 90}%`, background: i % 2 ? COLOR.violet : COLOR.flame, opacity: 0.8 }} />
            ))}
          </div>
        </>
      ) : null}
      <SpeedLines intensity={riser} color={COLOR.violet} seed="music" />
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- sfx

export function SfxScene(): React.JSX.Element {
  const frame = useCurrentFrame();
  const from = bars(SECTION.sfx);
  const tileW = 400;
  const tileH = 240;
  const gap = 34;
  const x0 = (WIDTH - (tileW * 4 + gap * 3)) / 2;
  return (
    <AbsoluteFill style={{ background: COLOR.ink, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: -WIDTH,
          top: HEIGHT * 0.45,
          width: WIDTH * 3,
          height: HEIGHT * 1.6,
          transform: "perspective(900px) rotateX(72deg)",
          transformOrigin: "50% 0",
          backgroundImage: `linear-gradient(${COLOR.teal}55 2px, transparent 2px), linear-gradient(90deg, ${COLOR.teal}55 2px, transparent 2px)`,
          backgroundSize: "120px 120px",
          backgroundPositionY: frame * 22,
          opacity: 0.6,
        }}
      />
      <div style={{ position: "absolute", top: 190, width: "100%", textAlign: "center" }}>
        <Chip text="SFX ×8 · ONE PROMPT" color={COLOR.teal} style={{ fontSize: 28 }} />
      </div>
      {SFX.map((name, i) => {
        const at = SFX_AT[i] - from;
        const t = frame - at;
        const col = i % 4;
        const row = Math.floor(i / 4);
        const on = t >= 0;
        const hot = clamp01(1 - t / 14);
        const s = on ? interpolate(backOut(t / 7, 2), [0, 1], [1.3, 1]) : 0.9;
        return (
          <div
            key={name}
            style={{
              position: "absolute",
              left: x0 + col * (tileW + gap),
              top: 320 + row * (tileH + gap),
              width: tileW,
              height: tileH,
              transform: `skewX(-8deg) scale(${s})`,
              background: on ? `rgba(255,138,42,${0.1 + hot * 0.75})` : "rgba(255,255,255,0.03)",
              border: `3px solid ${on ? (hot > 0.1 ? COLOR.flame : COLOR.teal) : COLOR.line}`,
              boxShadow: hot > 0.1 ? `0 0 70px ${COLOR.ember}` : undefined,
              opacity: on ? 1 : 0.35,
              padding: 22,
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", gap: 5, alignItems: "center", height: 90 }}>
              {Array.from({ length: 30 }, (_, k) => {
                const env = Math.exp(-k / (6 + (i % 3) * 5));
                const h = on ? (0.15 + random(`${name}${k}`) * 0.85) * env * (0.4 + hot * 0.6 + 0.2 * Math.sin(frame / 3 + k)) : 0.05;
                return <div key={k} style={{ flex: 1, height: `${Math.max(6, h * 100)}%`, background: hot > 0.1 ? COLOR.ink : COLOR.teal, borderRadius: 3 }} />;
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontFamily: FONT.hud, fontSize: 72, color: hot > 0.1 ? COLOR.ink : COLOR.text, letterSpacing: 3 }}>{name.toUpperCase()}</div>
              <div style={{ fontFamily: FONT.mono, fontSize: 22, color: hot > 0.1 ? COLOR.ink : COLOR.green }}>{on ? "✓ .wav" : ""}</div>
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- level: build + run

const RUN_FROM = 120;
const TOP_SPEED = 24;
const RAMP = 50;

function camAt(l: number): number {
  if (l <= RUN_FROM) return 0;
  if (l <= RUN_FROM + RAMP) return (TOP_SPEED * (l - RUN_FROM) ** 2) / (2 * RAMP);
  return (TOP_SPEED * RAMP) / 2 + TOP_SPEED * (l - RUN_FROM - RAMP);
}

/** Jumps take off on the snare (beats 2 and 4) once the hero is at speed. */
const JUMP_LEN = 30;
const JUMP_H = 250;
const JUMPS = Array.from({ length: 20 }, (_, i) => 20 + i * 40).filter((l) => l >= 180 && l < 400);

function jumpAt(l: number): { lift: number; rising: boolean } {
  for (const t of JUMPS) {
    const p = l - t;
    if (p >= 0 && p < JUMP_LEN) {
      const x = p / JUMP_LEN;
      return { lift: 4 * JUMP_H * x * (1 - x), rising: x < 0.5 };
    }
  }
  return { lift: 0, rising: false };
}

const EMBERS = JUMPS.map((t) => ({
  x: camAt(t + JUMP_LEN / 2) + HERO_SCREEN_X,
  y: GROUND_Y - 85 - JUMP_H,
  takenAt: t + JUMP_LEN / 2,
}));

/** Obstacles sit under each jump apex, so every jump clears something. */
const LEVEL_PROPS: Prop[] = [
  { kind: "brazier", x: 1250 },
  { kind: "lift", x: 1900, y: GROUND_Y - 330 },
  { kind: "mushroom", x: 2500 },
  ...JUMPS.map((t, i): Prop => {
    const kinds: Array<Prop["kind"]> = ["crawler", "thorns", "crawler", "brazier", "thorns"];
    const kind = kinds[i % kinds.length];
    const x = camAt(t + JUMP_LEN / 2) + HERO_SCREEN_X - (kind === "crawler" ? 115 : kind === "thorns" ? 130 : 75);
    return { kind, x };
  }),
  { kind: "lift", x: 4800, y: GROUND_Y - 360 },
  { kind: "beacon", x: camAt(400) + HERO_SCREEN_X + 380 },
];

export function LevelScene(): React.JSX.Element {
  const frame = useCurrentFrame();
  const camX = camAt(frame);
  const { lift, rising } = jumpAt(frame);
  const embersTaken = EMBERS.filter((e) => frame >= e.takenAt).length;
  const beaconX = LEVEL_PROPS[LEVEL_PROPS.length - 1].x;
  const beacon = clamp01((camX + HERO_SCREEN_X + 600 - beaconX) / 400);
  return (
    <AbsoluteFill>
      <GameScene
        camX={camX}
        build={frame}
        heroLift={lift}
        heroRising={rising}
        heroRunning={frame >= RUN_FROM}
        embers={EMBERS}
        litBefore={camX + HERO_SCREEN_X}
        props={LEVEL_PROPS}
        beacon={beacon}
      />
      <HorizonStreaks intensity={clamp01((frame - RUN_FROM) / 60) * 0.7} seed="lvl" />
      {frame >= 150 ? <GameHud embers={embersTaken} style={{ opacity: clamp01((frame - 150) / 8) }} /> : null}
      <Terminal
        x={60}
        y={200}
        width={860}
        fontSize={24}
        prompt="make it playable."
        typeFrom={1}
        typeFrames={10}
        exit={108}
        lines={[
          { at: 12, text: "build game", kind: "tool", progress: 70 },
          { at: 86, text: "playable", kind: "ok" },
        ]}
      />
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- real capture

export function CaptureScene(): React.JSX.Element {
  const frame = useCurrentFrame();
  const zoom = 1.02 + easeOut(frame / BAR) * 0.1;
  const split = 16 * (1 - clamp01(frame / 10)) + 4 * beatPulse(frame, 5);
  return (
    <AbsoluteFill style={{ background: COLOR.ink }}>
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        <Img src={staticFile("vibe/capture.jpg")} style={{ width: WIDTH, height: HEIGHT, objectFit: "cover" }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ mixBlendMode: "screen", opacity: split / 30, transform: `translateX(${split}px)` }}>
        <Img src={staticFile("vibe/capture.jpg")} style={{ width: WIDTH, height: HEIGHT, objectFit: "cover", filter: "hue-rotate(-60deg)" }} />
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 150, textAlign: "center" }}>
        <ChromaText split={split * 0.4} style={{ fontFamily: FONT.hud, fontSize: 120, color: COLOR.text, letterSpacing: 6 }}>
          THE REAL BUILD
        </ChromaText>
        <Chip text="KINDLE · NODETOOL GAME ENGINE · PLAYS IN THE BROWSER" color={COLOR.flame} style={{ marginTop: 10 }} />
      </div>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- finish

const STATS = ["7 SPRITES", "4 BACKDROPS", "1 SOUNDTRACK", "8 SFX", "1 PLAYABLE GAME"];

export function FinishScene(): React.JSX.Element {
  const frame = useCurrentFrame();
  const sweep = easeInOut(frame / 26);
  const cells = 16;
  const size = WIDTH / cells;
  const lap = lapTime(bars(SECTION.finish));
  const timeIn = backOut((frame - 30) / 10, 2);
  return (
    <AbsoluteFill style={{ background: COLOR.ink, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, transform: `translateX(${(1 - sweep) * WIDTH * 1.1}px)`, opacity: 0.18 + (1 - clamp01((frame - 26) / 20)) * 0.82 }}>
        {Array.from({ length: cells }, (_, c) => (
          <div key={c} style={{ position: "absolute", left: c * size, top: Math.sin(frame / 6 + c * 0.5) * 24 - 40, width: size + 1 }}>
            {Array.from({ length: Math.ceil(HEIGHT / size) + 2 }, (_, r) => (
              <div key={r} style={{ width: size + 1, height: size + 1, background: (r + c) % 2 ? "#f4f4f4" : "#050505" }} />
            ))}
          </div>
        ))}
      </div>
      <SlamLabel at={0} text="FINISH" color={COLOR.flame} hold={30} />
      {frame >= 30 ? (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
          <div style={{ transform: `scale(${timeIn})`, textAlign: "center", marginTop: -120 }}>
            <div style={{ fontFamily: FONT.hud, fontSize: 48, letterSpacing: 10, color: COLOR.flame }}>LAP TIME</div>
            <ChromaText split={2 + 3 * beatPulse(frame, 6)} style={{ fontFamily: FONT.hud, fontSize: 250, lineHeight: 0.95, color: COLOR.text, fontVariantNumeric: "tabular-nums" }}>
              {lap}
            </ChromaText>
          </div>
          <div style={{ position: "absolute", top: 740, display: "flex", gap: 26 }}>
            {STATS.map((s, i) => {
              const at = 50 + i * 10;
              if (frame < at) return null;
              const t = backOut((frame - at) / 8, 2);
              return (
                <div
                  key={s}
                  style={{
                    fontFamily: FONT.hud,
                    fontSize: 54,
                    letterSpacing: 3,
                    color: i === STATS.length - 1 ? COLOR.ink : COLOR.text,
                    background: i === STATS.length - 1 ? COLOR.flame : "rgba(5,7,12,0.8)",
                    border: `2px solid ${COLOR.flame}`,
                    padding: "10px 22px",
                    transform: `translateY(${(1 - t) * 80}px) skewX(-8deg)`,
                    opacity: clamp01((frame - at) / 4),
                  }}
                >
                  {s}
                </div>
              );
            })}
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- end card

export function EndCard(): React.JSX.Element {
  const frame = useCurrentFrame();
  const l1 = backOut(frame / 10, 1.8);
  const l2 = backOut((frame - 20) / 10, 1.8);
  const cmd = easeOut((frame - 56) / 12);
  const mark = easeOut((frame - 90) / 14);
  const out = clamp01((frame - (3 * BAR - 24)) / 24);
  return (
    <AbsoluteFill style={{ background: COLOR.ink, overflow: "hidden" }}>
      <AbsoluteFill style={{ opacity: 0.28, filter: "blur(6px)", transform: `scale(${1.15 - frame * 0.0006})` }}>
        <Img src={staticFile("vibe/g-sky.jpg")} style={{ width: WIDTH, height: HEIGHT, objectFit: "cover" }} />
      </AbsoluteFill>
      {Array.from({ length: 40 }, (_, i) => {
        const x = random(`ex${i}`) * WIDTH;
        const speed = 1.5 + random(`ev${i}`) * 3;
        const y = HEIGHT + 40 - ((frame * speed + random(`ey${i}`) * HEIGHT) % (HEIGHT + 80));
        const sz = 4 + random(`es${i}`) * 8;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x + Math.sin((frame + i * 20) / 20) * 20,
              top: y,
              width: sz,
              height: sz,
              borderRadius: sz,
              background: COLOR.flame,
              boxShadow: `0 0 ${sz * 3}px ${COLOR.ember}`,
              opacity: 0.7,
            }}
          />
        );
      })}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 96, letterSpacing: -2, color: COLOR.text, transform: `scale(${l1})`, opacity: clamp01(frame / 4) }}>
          Your agent writes the game.
        </div>
        <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 96, letterSpacing: -2, color: COLOR.flame, transform: `scale(${Math.max(0, l2)})`, opacity: clamp01((frame - 20) / 4), marginTop: 6 }}>
          NodeTool makes the assets.
        </div>
        <div
          style={{
            marginTop: 70,
            fontFamily: FONT.mono,
            fontSize: 34,
            color: COLOR.text,
            background: "rgba(8,12,18,0.9)",
            border: `1px solid ${COLOR.line}`,
            borderRadius: 16,
            padding: "22px 34px",
            opacity: cmd,
            transform: `translateY(${(1 - cmd) * 40}px)`,
          }}
        >
          <span style={{ color: COLOR.dim }}>$ </span>npx -y --package=@nodetool-ai/cli nodetool mcp install
        </div>
        <div style={{ marginTop: 60, display: "flex", alignItems: "baseline", gap: 26, opacity: mark, transform: `translateY(${(1 - mark) * 30}px)` }}>
          <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 64, letterSpacing: 1, color: COLOR.text }}>nodetool</div>
          <div style={{ fontFamily: FONT.mono, fontSize: 28, color: COLOR.dim }}>nodetool.ai/developers</div>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "#000", opacity: out }} />
    </AbsoluteFill>
  );
}
