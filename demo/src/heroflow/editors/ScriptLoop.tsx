/**
 * Script and voice: the reader rewrites the monster's line, its take turns
 * stale, and one click voices the new reading.
 */
import React from "react";
import { AbsoluteFill, Img } from "remotion";

import { expoOut, span } from "../clock";
import { KIND_COLOR, LINES, TITLE, entity } from "../data";
import { C, MONO, R, heroAsset } from "../theme";
import {
  Icon,
  KindChip,
  MagicFill,
  MetaChip,
  Panel,
  PanelHeader,
  ProgressBar,
  type AgentStatus
} from "../ui";
import { EditorStage, Pointer, useBoxes, useStageRef, useT } from "./common";

const VOICES: Record<string, string> = {
  mia: "Bright · young",
  monster: "Soft · shy"
};

const EDITED = 1;
const PREFIX = "Please don't ";
const OLD = "turn on the light.";
const NEW = "shine it at me.";
const SELECT: readonly [number, number] = [1.0, 1.35];
const DELETE = 1.5;
const TYPE: readonly [number, number] = [1.6, 2.4];
const VOICE_AT = 2.95;
const VOICED = 4.25;
const PLAY: readonly [number, number] = [4.55, 5.85];

type TakeState = "voiced" | "stale" | "voicing";

/** Deterministic take waveform, one per line. */
const bars = (seed: number, n = 44): number[] =>
  Array.from({ length: n }, (_, i) => {
    const env = Math.sin((i / (n - 1)) * Math.PI) ** 0.6;
    const v = 0.5 + 0.5 * Math.sin(i * (1.7 + seed * 0.4) + seed * 2.1);
    return Math.max(0.12, env * (0.35 + 0.65 * v));
  });

const Waveform: React.FC<{
  seed: number;
  color: string;
  played?: number;
  reveal?: number;
}> = ({ seed, color, played = 0, reveal = 1 }) => {
  const b = bars(seed);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        height: 40,
        opacity: reveal,
        filter: reveal < 1 ? `blur(${(1 - reveal) * 6}px)` : undefined
      }}
    >
      {b.map((v, i) => (
        <div
          key={i}
          style={{
            width: 3,
            height: `${v * 100}%`,
            borderRadius: 2,
            background: i / b.length < played ? C.text : color,
            opacity: i / b.length < played ? 1 : 0.7
          }}
        />
      ))}
    </div>
  );
};

const TakeStatus: React.FC<{ state: TakeState; take: number }> = ({
  state,
  take
}) => {
  const color =
    state === "voiced" ? C.success : state === "stale" ? C.warning : C.fuchsia;
  const label =
    state === "voiced"
      ? `Take ${take}`
      : state === "stale"
        ? "Stale"
        : "Voicing";
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "4px 11px",
        borderRadius: R.pill,
        fontSize: 15,
        fontWeight: 600,
        color,
        background: `${color}18`,
        border: `1px solid ${color}55`,
        whiteSpace: "nowrap"
      }}
    >
      <Icon
        name={
          state === "voiced"
            ? "check"
            : state === "stale"
              ? "refresh"
              : "sparkle"
        }
        size={15}
        color={color}
        stroke={2.4}
        fill={state === "voicing"}
      />
      {label}
    </div>
  );
};

const Avatar: React.FC<{ id: string; size: number }> = ({ id, size }) => {
  const e = entity(id);
  return (
    <Img
      src={heroAsset(e.image)}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        objectFit: "cover",
        border: `2px solid ${KIND_COLOR[e.kind]}`,
        flexShrink: 0
      }}
    />
  );
};

export const ScriptLoop: React.FC = () => {
  const t = useT();
  const stageRef = useStageRef();
  const boxes = useBoxes(stageRef);

  // The edit on line 2.
  const typed = Math.round(span(t, TYPE[0], TYPE[1]) * NEW.length);
  const tail = t < DELETE ? OLD : NEW.slice(0, typed);
  const selection = t < DELETE ? span(t, SELECT[0], SELECT[1]) : 0;
  const editing = t >= SELECT[0] && t < TYPE[1] + 0.35;
  const caretOn = editing && Math.floor(t * 3) % 2 === 0;
  const state: TakeState =
    t < DELETE
      ? "voiced"
      : t < VOICE_AT + 0.05
        ? "stale"
        : t < VOICED
          ? "voicing"
          : "voiced";
  const pressed = span(t, VOICE_AT - 0.05, VOICE_AT + 0.25);
  const agent: AgentStatus | null =
    state === "voicing"
      ? { text: "Voicing line 2" }
      : t >= VOICED
        ? { text: "Line 2 · take 2 ready", done: true }
        : null;

  return (
    <EditorStage
      scale={1.12}
      agent={agent}
      stageRef={stageRef}
      overlay={
        <Pointer
          t={t}
          boxes={boxes}
          visible={[0.3, 3.8]}
          path={[
            { t: 0.3, at: [1500, 1000] },
            {
              t: SELECT[0],
              at: { id: "line-1-text", fx: 0.42, fy: 0.72 },
              click: true
            },
            { t: 2.5, at: { id: "line-1-text", fx: 0.5, fy: 0.95 } },
            { t: VOICE_AT, at: "voice-1", click: true },
            { t: 3.8, at: [1750, 960] }
          ]}
        />
      }
    >
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Panel style={{ width: 1600 }}>
          <PanelHeader
            icon="doc"
            title={`${TITLE} — Script`}
            accent={C.textual}
            meta={
              <div style={{ display: "flex", gap: 10 }}>
                <MetaChip label={`${LINES.length} lines`} />
                <MetaChip icon="mic" label="2 voices" />
              </div>
            }
          />
          <div style={{ display: "flex" }}>
            {/* Cast */}
            <div
              style={{
                width: 360,
                flexShrink: 0,
                padding: "26px 22px",
                borderRight: `1px solid ${C.line}`,
                background: C.bg,
                display: "flex",
                flexDirection: "column",
                gap: 16
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  letterSpacing: 1.4,
                  textTransform: "uppercase",
                  color: C.dim
                }}
              >
                Cast
              </div>
              {["mia", "monster"].map((id) => {
                const e = entity(id);
                return (
                  <div
                    key={id}
                    style={{
                      display: "flex",
                      gap: 16,
                      alignItems: "center",
                      padding: 16,
                      borderRadius: R.md,
                      background: C.overlay,
                      border: `1px solid ${C.line}`
                    }}
                  >
                    <Avatar id={id} size={64} />
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 7
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "center"
                        }}
                      >
                        <span style={{ fontSize: 22, fontWeight: 600 }}>
                          {e.name}
                        </span>
                        <KindChip kind={e.kind} />
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 7,
                          alignItems: "center",
                          fontSize: 16,
                          color: C.dim
                        }}
                      >
                        <Icon name="mic" size={16} color={C.audio} />
                        {VOICES[id]}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Lines */}
            <div style={{ flex: 1, padding: "10px 0" }}>
              {LINES.map((line, i) => {
                const e = entity(line.speaker);
                const color = KIND_COLOR[e.kind];
                const edited = i === EDITED;
                const take: TakeState = edited ? state : "voiced";
                const playing =
                  edited && t >= PLAY[0] ? span(t, PLAY[0], PLAY[1]) : 0;
                const active =
                  edited &&
                  (editing ||
                    state === "voicing" ||
                    (playing > 0 && playing < 1));
                return (
                  <div
                    key={line.text}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "170px 1fr 330px",
                      alignItems: "center",
                      gap: 22,
                      padding: "22px 28px",
                      borderTop: i === 0 ? "none" : `1px solid ${C.line}`,
                      background: active ? "rgba(255,255,255,0.03)" : undefined,
                      boxShadow: active ? `inset 3px 0 0 ${color}` : undefined
                    }}
                  >
                    <div
                      style={{ display: "flex", gap: 12, alignItems: "center" }}
                    >
                      <Avatar id={line.speaker} size={38} />
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          letterSpacing: 1.2,
                          textTransform: "uppercase",
                          color
                        }}
                      >
                        {e.name.replace(/^The /, "")}
                      </span>
                    </div>
                    <div data-hf={`line-${i}-text`}>
                      <div
                        style={{
                          fontSize: 17,
                          color: C.dim,
                          fontStyle: "italic",
                          marginBottom: 4
                        }}
                      >
                        ({line.direction})
                      </div>
                      <div
                        style={{
                          fontSize: 28,
                          lineHeight: 1.3,
                          letterSpacing: -0.3
                        }}
                      >
                        {edited ? (
                          <>
                            {PREFIX}
                            <span
                              style={{
                                position: "relative",
                                background:
                                  selection > 0
                                    ? `linear-gradient(90deg, ${C.primary}88 ${selection * 100}%, transparent ${selection * 100}%)`
                                    : undefined,
                                borderRadius: 3
                              }}
                            >
                              {tail}
                            </span>
                            {caretOn ? (
                              <span
                                style={{
                                  display: "inline-block",
                                  width: 2,
                                  height: 30,
                                  marginLeft: 2,
                                  verticalAlign: "-5px",
                                  background: C.text
                                }}
                              />
                            ) : null}
                          </>
                        ) : (
                          line.text
                        )}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 10
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10
                        }}
                      >
                        <TakeStatus
                          state={take}
                          take={edited && t >= VOICED ? 2 : 1}
                        />
                        <span
                          style={{
                            fontFamily: MONO,
                            fontSize: 15,
                            color: C.dim
                          }}
                        >
                          {line.seconds.toFixed(1)} s
                        </span>
                        <div style={{ flex: 1 }} />
                        <div
                          data-hf={`voice-${i}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 7,
                            padding: "6px 12px",
                            borderRadius: R.pill,
                            fontSize: 15,
                            fontWeight: 600,
                            color: take === "stale" ? C.text : C.dim,
                            background:
                              take === "stale"
                                ? pressed > 0 && pressed < 1
                                  ? `${C.warning}66`
                                  : `${C.warning}2a`
                                : "rgba(255,255,255,0.04)",
                            border: `1px solid ${take === "stale" ? `${C.warning}77` : C.line}`
                          }}
                        >
                          <Icon
                            name="mic"
                            size={16}
                            color={take === "stale" ? C.warning : C.dim}
                          />
                          Voice
                        </div>
                      </div>
                      <div
                        style={{
                          position: "relative",
                          height: 48,
                          borderRadius: R.sm,
                          overflow: "hidden",
                          background: `${color}12`,
                          border: `1px solid ${take === "stale" ? `${C.warning}55` : `${color}33`}`,
                          display: "flex",
                          alignItems: "center",
                          padding: "0 12px"
                        }}
                      >
                        {take === "voicing" ? (
                          <>
                            <MagicFill
                              phase={span(t, VOICE_AT, VOICED)}
                              color={C.fuchsia}
                            />
                            <div
                              style={{
                                position: "absolute",
                                left: 0,
                                right: 0,
                                bottom: 0
                              }}
                            >
                              <ProgressBar
                                value={span(t, VOICE_AT, VOICED)}
                                color={C.fuchsia}
                                height={4}
                              />
                            </div>
                          </>
                        ) : (
                          <div style={{ flex: 1, opacity: take === "stale" ? 0.35 : 1 }}>
                            <Waveform
                              seed={edited && t >= VOICED ? 9 : i}
                              color={color}
                              played={playing}
                              reveal={
                                edited && t >= VOICED
                                  ? expoOut(span(t, VOICED, VOICED + 0.35))
                                  : 1
                              }
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>
      </AbsoluteFill>
    </EditorStage>
  );
};
