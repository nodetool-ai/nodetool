import React from "react";
import { AbsoluteFill, random, useCurrentFrame } from "remotion";
import { beatPulse, clamp01 } from "./fx";
import { ASSET_EVENTS, assetsAt } from "./timeline";
import { BAR, COLOR, FONT, FPS, GEARS, SECTION, bars } from "./theme";

const TRACK = [
  { at: SECTION.sprites, label: "SPRITES" },
  { at: SECTION.backgrounds, label: "BACKDROPS" },
  { at: SECTION.music, label: "MUSIC" },
  { at: SECTION.sfx, label: "SFX" },
  { at: SECTION.build, label: "BUILD" },
  { at: SECTION.finish, label: "FINISH" },
];

export function lapTime(frame: number): string {
  const start = bars(SECTION.drop);
  const stop = bars(SECTION.finish);
  const f = Math.max(0, Math.min(frame, stop) - start);
  const ms = Math.floor((f / FPS) * 1000);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const rest = ms % 1000;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(rest).padStart(3, "0")}`;
}

function gearAt(frame: number): { gear: string; since: number } {
  let gear = "N";
  let since = 0;
  for (const [bar, g] of GEARS) {
    if (frame >= bars(bar)) {
      gear = g;
      since = frame - bars(bar);
    }
  }
  return { gear, since };
}

function rpmAt(frame: number): number {
  const inMusic = frame >= bars(SECTION.music) && frame < bars(SECTION.sfx);
  if (frame >= bars(SECTION.finish)) return 0.15 * (1 - clamp01((frame - bars(SECTION.finish)) / BAR));
  if (inMusic) return 0.32 + 0.04 * Math.sin(frame * 0.3);
  const ramp = (frame % BAR) / BAR;
  const jitter = (random(`rpm${frame}`) - 0.5) * 0.04;
  return clamp01(0.45 + ramp * 0.55 + jitter);
}

const hudText: React.CSSProperties = {
  fontFamily: FONT.hud,
  color: COLOR.text,
  letterSpacing: 2,
  lineHeight: 1,
};

export function Hud(): React.JSX.Element | null {
  const frame = useCurrentFrame();
  if (frame < bars(SECTION.drop) || frame >= bars(SECTION.endCard)) return null;
  const enter = clamp01((frame - bars(SECTION.drop)) / 12);
  const { gear, since } = gearAt(frame);
  const rpm = rpmAt(frame);
  const assets = assetsAt(frame);
  const lastAsset = [...ASSET_EVENTS].reverse().find((f) => f <= frame) ?? -99;
  const assetPop = clamp01(1 - (frame - lastAsset) / 10);
  const speed = Math.round(rpm * 310 + (frame >= bars(SECTION.run) ? 40 : 0));
  const segments = 32;
  const lit = Math.round(rpm * segments);
  const shift = rpm > 0.93 && Math.floor(frame / 3) % 2 === 0;
  const gearPop = clamp01(1 - since / 10);
  const overCapture = frame >= bars(SECTION.run + 3) && frame < bars(SECTION.finish);
  const progress = clamp01((frame - bars(SECTION.drop)) / (bars(SECTION.finish) - bars(SECTION.drop)));

  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity: enter }}>
      {/* Top left: lap. Hidden over the real capture, which has its own HUD. */}
      <div style={{ position: "absolute", left: 56, top: 44, opacity: overCapture ? 0 : 1 }}>
        <div style={{ ...hudText, fontSize: 26, color: COLOR.ember }}>KINDLE · LAP 1/1</div>
        <div style={{ ...hudText, fontSize: 64, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
          {lapTime(frame)}
        </div>
      </div>

      {/* Top right: asset counter */}
      <div style={{ position: "absolute", right: 56, top: 44, textAlign: "right", opacity: overCapture ? 0 : 1 }}>
        <div style={{ ...hudText, fontSize: 26, color: COLOR.teal }}>ASSETS GENERATED</div>
        <div
          style={{
            ...hudText,
            fontSize: 64,
            marginTop: 6,
            transform: `scale(${1 + assetPop * 0.35})`,
            transformOrigin: "right center",
            color: assetPop > 0.5 ? COLOR.flame : COLOR.text,
          }}
        >
          {String(assets).padStart(2, "0")}
        </div>
      </div>

      {/* Bottom left: tach */}
      <div style={{ position: "absolute", left: 56, bottom: 50 }}>
        <div style={{ display: "flex", gap: 4, alignItems: "flex-end" }}>
          {Array.from({ length: segments }, (_, i) => {
            const on = i < lit;
            const red = i >= segments - 6;
            const amber = i >= segments - 12 && !red;
            const c = red ? COLOR.red : amber ? COLOR.flame : COLOR.teal;
            return (
              <div
                key={i}
                style={{
                  width: 10,
                  height: 14 + i * 1.1,
                  background: on ? c : "rgba(255,255,255,0.08)",
                  boxShadow: on && red ? `0 0 14px ${COLOR.red}` : undefined,
                  transform: "skewX(-14deg)",
                }}
              />
            );
          })}
        </div>
        <div style={{ ...hudText, fontSize: 24, marginTop: 10, color: shift ? COLOR.red : COLOR.dim }}>
          {shift ? "SHIFT ▲" : `RPM ×1000  ${(rpm * 12).toFixed(1)}`}
        </div>
      </div>

      {/* Bottom right: gear and speed */}
      <div style={{ position: "absolute", right: 56, bottom: 40, display: "flex", alignItems: "flex-end", gap: 26 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ ...hudText, fontSize: 88, fontVariantNumeric: "tabular-nums" }}>{speed}</div>
          <div style={{ ...hudText, fontSize: 22, color: COLOR.dim }}>KM/H</div>
        </div>
        <div
          style={{
            width: 118,
            height: 130,
            border: `3px solid ${gearPop > 0 ? COLOR.flame : COLOR.line}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `rgba(5,7,12,${0.6 + gearPop * 0.3})`,
            transform: `scale(${1 + gearPop * 0.25}) skewX(-8deg)`,
          }}
        >
          <div style={{ ...hudText, fontSize: 118, color: gearPop > 0 ? COLOR.flame : COLOR.text }}>{gear}</div>
        </div>
      </div>

      {/* Bottom center: track map */}
      <div style={{ position: "absolute", left: 620, right: 620, bottom: 62 }}>
        <div style={{ position: "relative", height: 4, background: "rgba(255,255,255,0.12)" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${progress * 100}%`, background: COLOR.ember }} />
          {TRACK.map((t) => {
            const x = (bars(t.at) - bars(SECTION.drop)) / (bars(SECTION.finish) - bars(SECTION.drop));
            const passed = frame >= bars(t.at);
            return (
              <div key={t.label} style={{ position: "absolute", left: `${x * 100}%`, top: -8 }}>
                <div
                  style={{
                    width: 3,
                    height: 20,
                    background: passed ? COLOR.flame : "rgba(255,255,255,0.3)",
                    transform: "translateX(-1px)",
                  }}
                />
                <div
                  style={{
                    ...hudText,
                    fontSize: 18,
                    color: passed ? COLOR.text : COLOR.dim,
                    transform: "translateX(-50%)",
                    marginTop: 6,
                    whiteSpace: "nowrap",
                  }}
                >
                  {t.label}
                </div>
              </div>
            );
          })}
          <div
            style={{
              position: "absolute",
              left: `${progress * 100}%`,
              top: -7,
              width: 18,
              height: 18,
              borderRadius: 9,
              background: COLOR.flame,
              transform: "translateX(-9px)",
              boxShadow: `0 0 ${14 + beatPulse(frame, 8) * 20}px ${COLOR.ember}`,
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
}
