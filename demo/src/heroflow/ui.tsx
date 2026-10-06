/**
 * Look-alike primitives for the hero flow. Each one copies the shape and
 * color of its product counterpart (ui_primitives Chip, ShotStatusPill,
 * ProgressBar, MagicGenerationFill) without the stores behind them, so a
 * motion pass can animate every property from the frame clock.
 */
import React from "react";
import { AbsoluteFill, Img } from "remotion";

import { KIND_COLOR, type EntityKind } from "./data";
import { C, FONT, MONO, R, heroAsset } from "./theme";

// ─── Icons ──────────────────────────────────────────────────────────────────

const ICONS = {
  sparkle: "M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z",
  send: "M4 12l16-8-6 16-2.5-6.5z",
  clip: "M16.5 6.5l-7.8 7.8a2 2 0 102.8 2.8l8-8a4 4 0 10-5.6-5.6l-8.3 8.3a6 6 0 108.5 8.5L21 13",
  play: "M8 5v14l11-7z",
  pause: "M7 5h4v14H7zM13 5h4v14h-4z",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15.5 9.5a1 1 0 100-.1",
  film: "M4 4h16v16H4zM8 4v16M16 4v16M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4",
  person: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0",
  place:
    "M12 21s-7-6.5-7-12a7 7 0 1114 0c0 5.5-7 12-7 12zM12 11.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5",
  palette:
    "M12 3a9 9 0 100 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 004-4c0-4.5-4-8-9-8zM7.5 11a1 1 0 100-.1M10 7.5a1 1 0 100-.1M14.5 7.5a1 1 0 100-.1",
  cube: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5",
  check: "M5 12.5l4.5 4.5L19 7.5",
  doc: "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  cut: "M6 6a3 3 0 100 .1M6 18a3 3 0 100 .1M8.5 7.5L20 18M8.5 16.5L20 6",
  chevron: "M9 6l6 6-6 6",
  music:
    "M9 18V6l11-2v12M9 18a3 3 0 11-6 0 3 3 0 016 0zM20 16a3 3 0 11-6 0 3 3 0 016 0z",
  plus: "M12 5v14M5 12h14"
} as const;

export type IconName = keyof typeof ICONS;

export const Icon: React.FC<{
  name: IconName;
  size?: number;
  color?: string;
  fill?: boolean;
  stroke?: number;
}> = ({
  name,
  size = 20,
  color = "currentColor",
  fill = false,
  stroke = 1.8
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    style={{ flexShrink: 0, display: "block" }}
  >
    <path
      d={ICONS[name]}
      fill={fill ? color : "none"}
      stroke={fill ? "none" : color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const KIND_ICON: Record<EntityKind, IconName> = {
  character: "person",
  location: "place",
  prop: "cube",
  style: "palette"
};

// ─── Surfaces ───────────────────────────────────────────────────────────────

/** The stage behind every step: near-black, a faint neutral lift and a trace of warmth. */
export const Stage: React.FC<{ children?: React.ReactNode }> = ({
  children
}) => (
  <AbsoluteFill
    style={{
      background: C.stage,
      fontFamily: FONT,
      color: C.text,
      overflow: "hidden"
    }}
  >
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(60% 60% at 50% 42%, rgba(255,255,255,0.025), transparent 70%), radial-gradient(40% 50% at 82% 88%, rgba(232,121,249,0.05), transparent 70%)"
      }}
    />
    <AbsoluteFill
      style={{
        backgroundImage:
          "linear-gradient(rgba(148,163,184,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.045) 1px, transparent 1px)",
        backgroundSize: "64px 64px",
        maskImage: "radial-gradient(75% 75% at 50% 50%, black, transparent)"
      }}
    />
    {children}
  </AbsoluteFill>
);

/** A product panel: paper surface, hairline border, deep shadow. */
export const Panel: React.FC<{
  style?: React.CSSProperties;
  children?: React.ReactNode;
  hf?: string;
}> = ({ style, children, hf }) => (
  <div
    data-hf={hf}
    style={{
      background: C.paper,
      border: `1px solid ${C.line}`,
      borderRadius: R.lg,
      boxShadow: "0 40px 120px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.4)",
      overflow: "hidden",
      ...style
    }}
  >
    {children}
  </div>
);

/** What the agent is doing on the surface on screen, shown in its header. */
export type AgentStatus = { text: string; done?: boolean };

export const AgentStatusContext = React.createContext<AgentStatus | null>(null);

/** The agent's chip: a pulsing sparkle while it works, a check when done. */
export const AgentChip: React.FC<AgentStatus> = ({ text, done = false }) => {
  const color = done ? C.success : C.fuchsia;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 13px 5px 9px",
        borderRadius: R.pill,
        background: `${color}14`,
        border: `1px solid ${color}40`,
        fontSize: 15,
        fontWeight: 500,
        color: C.text,
        whiteSpace: "nowrap"
      }}
    >
      <Icon
        name={done ? "check" : "sparkle"}
        size={15}
        color={color}
        fill={!done}
        stroke={2.4}
      />
      <span style={{ color }}>Agent</span>
      <span style={{ color: C.dim }}>{text}</span>
    </div>
  );
};

/** A panel's title bar: icon, title, agent status, meta on the right. */
export const PanelHeader: React.FC<{
  icon: IconName;
  title: string;
  meta?: React.ReactNode;
  accent?: string;
}> = ({ icon, title, meta, accent = C.dim }) => {
  const agent = React.useContext(AgentStatusContext);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 22px",
        borderBottom: `1px solid ${C.line}`,
        background: C.bg
      }}
    >
      <Icon name={icon} size={20} color={accent} />
      <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: -0.2 }}>
        {title}
      </div>
      {agent ? (
        <div style={{ marginLeft: 8 }}>
          <AgentChip {...agent} />
        </div>
      ) : null}
      <div style={{ flex: 1 }} />
      {meta}
    </div>
  );
};

// ─── Chips ──────────────────────────────────────────────────────────────────

/** Tinted outline chip, as `getEntityKindChipSx` styles it. */
export const KindChip: React.FC<{ kind: EntityKind; size?: number }> = ({
  kind,
  size = 14
}) => {
  const color = KIND_COLOR[kind];
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: `${size * 0.2}px ${size * 0.7}px`,
        borderRadius: R.pill,
        fontSize: size,
        fontWeight: 500,
        color,
        background: `${color}1f`,
        border: `1px solid ${color}38`,
        lineHeight: 1.3,
        flexShrink: 0
      }}
    >
      {kind}
    </div>
  );
};

/** An inline entity mention inside prose, as the script editor renders one. */
export const Mention: React.FC<{
  kind: EntityKind;
  children: React.ReactNode;
  hf?: string;
  pop?: number;
}> = ({ kind, children, hf, pop = 1 }) => {
  const color = KIND_COLOR[kind];
  const hfProps = useHf()(hf ?? "");
  // The pop: in at 0.85 scale with a glow that fades as it settles.
  const glow = pop > 0 && pop < 1 ? (1 - pop) * 0.9 : 0;
  return (
    <span
      data-hf={hf}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "0 10px 0 7px",
        margin: "0 2px 0 0",
        borderRadius: R.sm,
        color,
        background: `${color}1c`,
        border: `1px solid ${color}40`,
        fontWeight: 600,
        lineHeight: 1.35,
        verticalAlign: "baseline",
        opacity: pop > 0 ? 1 : 0,
        transform: pop < 1 ? `scale(${0.85 + 0.15 * pop})` : undefined,
        boxShadow: glow ? `0 0 ${24 * glow}px ${color}` : undefined,
        ...(hf ? hfProps.style : undefined)
      }}
    >
      <Icon name={KIND_ICON[kind]} size={17} color={color} />
      {children}
    </span>
  );
};

/** Quiet chip with a kind dot, as the shot card shows applied entities. */
export const DotChip: React.FC<{
  kind: EntityKind;
  label: string;
  size?: number;
  hf?: string;
}> = ({ kind, label, size = 13, hf }) => {
  const hfProps = useHf()(hf ?? "");
  return (
    <div
      data-hf={hf}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: size * 0.45,
        padding: `${size * 0.15}px ${size * 0.65}px`,
        borderRadius: R.pill,
        border: `1px solid ${C.line}`,
        color: C.dim,
        fontSize: size,
        fontWeight: 500,
        whiteSpace: "nowrap",
        ...(hf ? hfProps.style : undefined)
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          background: KIND_COLOR[kind]
        }}
      />
      {label}
    </div>
  );
};

/** A neutral meta chip: model names, aspect, duration. */
export const MetaChip: React.FC<{
  icon?: IconName;
  label: string;
  color?: string;
  size?: number;
}> = ({ icon, label, color = C.dim, size = 15 }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 7,
      padding: `${size * 0.3}px ${size * 0.75}px`,
      borderRadius: R.pill,
      background: "rgba(255,255,255,0.04)",
      border: `1px solid ${C.line}`,
      color,
      fontSize: size,
      fontWeight: 500,
      whiteSpace: "nowrap"
    }}
  >
    {icon ? <Icon name={icon} size={size + 2} color={color} /> : null}
    {label}
  </div>
);

export type ShotState =
  | "queued"
  | "still-rendering"
  | "still"
  | "clip-rendering"
  | "clip";

/** The shot status pill: image color for stills, video color for clips. */
export const StatusPill: React.FC<{ state: ShotState }> = ({ state }) => {
  const isClip = state === "clip" || state === "clip-rendering";
  const busy = state === "still-rendering" || state === "clip-rendering";
  const color = state === "queued" ? C.dim : isClip ? C.video : C.image;
  const label =
    state === "queued"
      ? "Queued"
      : busy
        ? isClip
          ? "Animating"
          : "Rendering"
        : isClip
          ? "Clip"
          : "Still";
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "4px 11px",
        borderRadius: R.pill,
        background: "rgba(8,9,10,0.72)",
        border: `1px solid ${color}55`,
        color: state === "queued" ? C.dim : C.text,
        fontSize: 14,
        fontWeight: 500,
        backdropFilter: "blur(8px)"
      }}
    >
      <Icon name={isClip ? "film" : "image"} size={15} color={color} />
      {label}
    </div>
  );
};

export const ProgressBar: React.FC<{
  value: number;
  color: string;
  height?: number;
}> = ({ value, color, height = 4 }) => (
  <div
    style={{
      height,
      borderRadius: height,
      background: "rgba(255,255,255,0.08)",
      overflow: "hidden"
    }}
  >
    <div
      style={{
        width: `${value * 100}%`,
        height: "100%",
        background: color,
        borderRadius: height
      }}
    />
  </div>
);

/**
 * The generation fill: a slow diagonal sweep over a dark tile, the same
 * `runningGradient` the product shows while media renders. `phase` is 0..1,
 * and an undefined phase draws the idle tile with no sweep.
 */
export const MagicFill: React.FC<{ phase?: number; color?: string }> = ({
  phase,
  color = C.image
}) => (
  <AbsoluteFill style={{ background: C.raised, overflow: "hidden" }}>
    {phase === undefined ? null : (
      <AbsoluteFill
        style={{
          background: `linear-gradient(115deg, transparent ${phase * 100 - 30}%, ${color}38 ${phase * 100}%, transparent ${phase * 100 + 30}%)`
        }}
      />
    )}
    <AbsoluteFill
      style={{
        backgroundImage:
          "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)",
        backgroundSize: "14px 14px"
      }}
    />
  </AbsoluteFill>
);

// ─── Narrative chrome ───────────────────────────────────────────────────────

export const STEPS = [
  "Prompt",
  "Beat sheet",
  "Entities",
  "Storyboard",
  "Timeline"
] as const;

/**
 * The step rail at the top of the stage. It is the viewer's map: one line,
 * the active step lit, the done steps checked.
 */
export const StepRail: React.FC<{ active: number }> = ({ active }) => (
  <div
    style={{
      position: "absolute",
      top: 44,
      left: 0,
      right: 0,
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      gap: 14,
      fontSize: 19,
      fontWeight: 500
    }}
  >
    {STEPS.map((step, i) => {
      const done = i < active;
      const on = i === active;
      return (
        <React.Fragment key={step}>
          {i > 0 ? (
            <div
              style={{
                width: 40,
                height: 1,
                background: done || on ? C.lineStrong : C.line
              }}
            />
          ) : null}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              padding: "7px 16px",
              borderRadius: R.pill,
              color: on ? C.text : done ? C.dim : "rgba(247,248,248,0.28)",
              background: on ? "rgba(255,255,255,0.07)" : "transparent",
              border: `1px solid ${on ? C.lineStrong : "transparent"}`
            }}
          >
            {done ? (
              <Icon name="check" size={16} color={C.success} stroke={2.4} />
            ) : (
              <span style={{ fontFamily: MONO, fontSize: 15, opacity: 0.7 }}>
                {i + 1}
              </span>
            )}
            {step}
          </div>
        </React.Fragment>
      );
    })}
  </div>
);

/** The agent's one-line status under the rail: what it is doing now. */
export const AgentLine: React.FC<{ text: string; done?: boolean }> = ({
  text,
  done = false
}) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 46,
      display: "flex",
      justifyContent: "center"
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "11px 22px 11px 16px",
        borderRadius: R.pill,
        background: "rgba(16,17,19,0.9)",
        border: `1px solid ${C.line}`,
        fontSize: 20,
        color: C.dim,
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)"
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          display: "grid",
          placeItems: "center",
          background: done ? `${C.success}22` : `${C.fuchsia}22`
        }}
      >
        <Icon
          name={done ? "check" : "sparkle"}
          size={16}
          color={done ? C.success : C.fuchsia}
          fill={!done}
          stroke={2.4}
        />
      </div>
      <span style={{ color: C.text, fontWeight: 500 }}>Agent</span>
      {text}
    </div>
  </div>
);

/**
 * Renders a beat line, swapping `{id}` placeholders for mention chips. `at`
 * is how far along the line the mention sits (0..1), so a reveal can pop
 * each chip as the wipe reaches it.
 */
export const BeatText: React.FC<{
  line: string;
  render: (id: string, at: number) => React.ReactNode;
  textStyle?: React.CSSProperties;
}> = ({ line, render, textStyle }) => {
  const parts = line.split(/(\{[a-z]+\})/);
  let offset = 0;
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\{([a-z]+)\}$/);
        const at = offset / line.length;
        offset += part.length;
        return (
          <React.Fragment key={i}>
            {m ? render(m[1], at) : <span style={textStyle}>{part}</span>}
          </React.Fragment>
        );
      })}
    </>
  );
};

// ─── Motion hooks ───────────────────────────────────────────────────────────

/**
 * Elements a transition hands over carry `data-hf` ids. The motion layer
 * measures them once and can override their style while a flying copy
 * stands in for them; mockups leave this empty.
 */
export const HfContext = React.createContext<
  (id: string) => React.CSSProperties | undefined
>(() => undefined);

export const useHf = (): ((id: string) => {
  "data-hf": string;
  style: React.CSSProperties | undefined;
}) => {
  const style = React.useContext(HfContext);
  return (id) => ({ "data-hf": id, style: style(id) });
};

/**
 * A rendered image as it develops out of the generation fill: blurred and
 * over-bright at 0, sharp at 1.
 */
export const Develop: React.FC<{
  src: string;
  reveal?: number;
  zoom?: number;
}> = ({ src, reveal = 1, zoom = 1 }) => (
  <Img
    src={heroAsset(src)}
    style={{
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      objectFit: "cover",
      opacity: Math.min(1, reveal * 1.6),
      filter:
        reveal >= 1
          ? undefined
          : `blur(${(1 - reveal) * 18}px) brightness(${1 + (1 - reveal) * 0.7})`,
      transform: `scale(${zoom * (1 + (1 - reveal) * 0.06)})`
    }}
  />
);
