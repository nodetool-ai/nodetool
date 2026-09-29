import React from "react";
import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { backOut, clamp01, easeOut } from "./fx";
import { COLOR, FONT } from "./theme";

export interface TermLine {
  at: number;
  text: string;
  /** "tool" draws a status dot, "ok" a check, "dim" a detail row. */
  kind?: "tool" | "ok" | "dim";
  /** Frames the tool's progress bar takes to fill. */
  progress?: number;
}

interface TerminalProps {
  x: number;
  y: number;
  width: number;
  prompt: string;
  typeFrom: number;
  typeFrames: number;
  lines?: TermLine[];
  enter?: number;
  exit?: number;
  fontSize?: number;
  title?: string;
}

/** A coding-agent session window. Frames are local to the parent sequence. */
export function Terminal({
  x,
  y,
  width,
  prompt,
  typeFrom,
  typeFrames,
  lines = [],
  enter = 0,
  exit,
  fontSize = 26,
  title = "~/kindle — agent",
}: TerminalProps): React.JSX.Element | null {
  const frame = useCurrentFrame();
  const inT = easeOut((frame - enter) / 10);
  const outT = exit === undefined ? 0 : clamp01((frame - exit) / 8);
  if (frame < enter || outT >= 1) return null;
  const chars = Math.floor(clamp01((frame - typeFrom) / typeFrames) * prompt.length);
  const typing = frame < typeFrom + typeFrames;
  const cursorOn = typing || Math.floor(frame / 8) % 2 === 0;
  const tx = interpolate(inT, [0, 1], [-160, 0]) + outT * -300;
  const skew = (1 - inT) * -10 + outT * 10;

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        transform: `translateX(${tx}px) skewX(${skew}deg)`,
        opacity: inT * (1 - outT),
        background: "rgba(8,12,18,0.92)",
        border: `1px solid ${COLOR.line}`,
        borderRadius: 18,
        boxShadow: "0 40px 120px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03)",
        overflow: "hidden",
        fontFamily: FONT.mono,
        fontSize,
        lineHeight: 1.45,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 22px", borderBottom: `1px solid ${COLOR.line}` }}>
        {[COLOR.red, COLOR.flame, COLOR.green].map((c) => (
          <div key={c} style={{ width: 14, height: 14, borderRadius: 7, background: c, opacity: 0.8 }} />
        ))}
        <div style={{ marginLeft: 14, color: COLOR.dim, fontSize: fontSize * 0.7 }}>{title}</div>
      </div>
      <div style={{ padding: "22px 26px 26px" }}>
        <div style={{ color: COLOR.text }}>
          <span style={{ color: COLOR.ember }}>&gt; </span>
          {prompt.slice(0, chars)}
          {cursorOn && frame < (lines[0]?.at ?? Infinity) ? (
            <span style={{ background: COLOR.ember, color: COLOR.ember }}>_</span>
          ) : null}
        </div>
        {lines.map((line, i) => {
          if (frame < line.at) return null;
          const t = frame - line.at;
          const pop = backOut(t / 6, 1.6);
          const done = line.progress === undefined || t >= line.progress;
          const icon = line.kind === "ok" ? "✓" : line.kind === "tool" ? "●" : "└";
          const iconColor =
            line.kind === "ok" ? COLOR.green : line.kind === "tool" ? (done ? COLOR.green : COLOR.flame) : COLOR.dim;
          return (
            <div
              key={i}
              style={{
                marginTop: line.kind === "dim" ? 2 : 12,
                paddingLeft: line.kind === "dim" ? 28 : 0,
                color: line.kind === "dim" ? COLOR.dim : COLOR.text,
                transform: `translateX(${(1 - pop) * 40}px)`,
                opacity: clamp01(t / 3),
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              <span style={{ color: iconColor, marginRight: 12 }}>{icon}</span>
              {line.text}
              {line.progress !== undefined ? (
                <div style={{ marginTop: 10, marginLeft: 30, height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${clamp01(t / line.progress) * 100}%`,
                      background: `linear-gradient(90deg, ${COLOR.ember}, ${COLOR.flame})`,
                      boxShadow: `0 0 16px ${COLOR.ember}`,
                    }}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * An image that "denoises" in: pixelated steps that sharpen on a fixed
 * cadence, with a scanline sweeping down. Frames are local.
 */
export function GenImage({
  src,
  width,
  height,
  at,
  steps = 5,
  stepFrames = 4,
  style,
}: {
  src: string;
  width: number;
  height: number;
  at: number;
  steps?: number;
  stepFrames?: number;
  style?: React.CSSProperties;
}): React.JSX.Element | null {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < 0) return null;
  const step = Math.min(steps, Math.floor(t / stepFrames));
  const k = step >= steps ? 1 : 2 ** (steps - step + 1);
  const scan = clamp01(t / (steps * stepFrames));
  return (
    <div style={{ position: "absolute", width, height, overflow: "hidden", ...style }}>
      <div
        style={{
          width: width / k,
          height: height / k,
          transform: `scale(${k})`,
          transformOrigin: "0 0",
          imageRendering: k > 1 ? "pixelated" : "auto",
        }}
      >
        <Img src={staticFile(src)} style={{ width: width / k, height: height / k, imageRendering: k > 1 ? "pixelated" : "auto", display: "block" }} />
      </div>
      {scan < 1 ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${scan * 100}%`,
            height: 6,
            background: COLOR.flame,
            boxShadow: `0 0 30px 8px ${COLOR.ember}`,
          }}
        />
      ) : null}
    </div>
  );
}

/** Small tag chip, e.g. "SKY.JPG ✓". */
export function Chip({ text, color = COLOR.teal, style }: { text: string; color?: string; style?: React.CSSProperties }): React.JSX.Element {
  return (
    <div
      style={{
        display: "inline-block",
        fontFamily: FONT.mono,
        fontSize: 22,
        color,
        padding: "8px 14px",
        border: `2px solid ${color}`,
        background: "rgba(5,7,12,0.75)",
        letterSpacing: 1,
        ...style,
      }}
    >
      {text}
    </div>
  );
}
