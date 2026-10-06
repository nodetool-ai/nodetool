/**
 * The landing page hero: one project, "Under the Bed", from a typed brief to
 * the finished film, on the product's own surfaces.
 *
 * Each step is the mockup surface with its state read from the clock. The
 * hand-offs between steps are flying copies of real elements: the reel
 * renders every surface once, hidden, measures the elements tagged with
 * `data-hf`, and flies between those boxes. A layout change in a surface
 * moves its flights with it.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  AbsoluteFill,
  Freeze,
  Img,
  Loop,
  OffthreadVideo,
  Sequence,
  continueRender,
  delayRender,
  useCurrentFrame
} from "remotion";

import { ensureInterLoaded, useInterFont } from "../promo/fonts";
import {
  DURATION_FRAMES,
  END,
  EXPAND,
  FPS,
  PLAY,
  T,
  beatRows,
  board,
  camera,
  clipFrames,
  composerState,
  entitiesDone,
  expoOut,
  filmTime,
  inOut,
  span,
  tileState
} from "./clock";
import {
  BEATS,
  BRIEF,
  ENTITIES,
  FILM,
  KIND_COLOR,
  TOTAL_SECONDS,
  entity,
  type Entity
} from "./data";
import { MOCKUPS } from "./Mockups";
import {
  BeatSheetStep,
  ComposerStep,
  EntitiesStep,
  MonitorBar,
  StoryboardStep,
  TimelineStep
} from "./steps";
import { C, R, heroAsset } from "./theme";
import {
  AgentStatusContext,
  HfContext,
  Icon,
  KIND_ICON,
  MagicFill,
  Stage,
  type AgentStatus
} from "./ui";

export { DURATION_FRAMES };

const W = 1920;
const H = 1080;

type Rect = { x: number; y: number; w: number; h: number };
type Rects = Record<string, Rect>;

const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
const lerpRect = (a: Rect, b: Rect, p: number, arc = 0): Rect => ({
  x: lerp(a.x, b.x, p),
  y: lerp(a.y, b.y, p) - Math.sin(p * Math.PI) * arc,
  w: lerp(a.w, b.w, p),
  h: lerp(a.h, b.h, p)
});
const FULL: Rect = { x: 0, y: 0, w: W, h: H };
const box = (r: Rect): React.CSSProperties => ({
  position: "absolute",
  left: r.x,
  top: r.y,
  width: r.w,
  height: r.h
});
const insetOf = (r: Rect, radius: number): string =>
  `inset(${r.y}px ${W - r.x - r.w}px ${H - r.y - r.h}px ${r.x}px round ${radius}px)`;

const scaleOf = (id: string): number =>
  MOCKUPS.find((m) => m.id === id)?.scale ?? 1;
const SCALE = {
  prompt: scaleOf("1-prompt"),
  beats: scaleOf("2-beats"),
  entities: scaleOf("3-entities"),
  board: scaleOf("4a-stills"),
  timeline: scaleOf("5-timeline")
};

// ─── Hand-off schedules ─────────────────────────────────────────────────────

/** The beat that first mentions each entity; style has no mention. */
const FIRST_MENTION: Record<string, number> = {};
BEATS.forEach((b, i) =>
  b.line.replace(/\{([a-z]+)\}/g, (_, id: string) => {
    FIRST_MENTION[id] ??= i;
    return "";
  })
);
const FIRST_SHOT: Record<string, number> = {};
BEATS.forEach((b, i) =>
  b.entities.forEach((id) => {
    FIRST_SHOT[id] ??= i;
  })
);

type Flight = { key: string; start: number; end: number };

/** Mentions lift out of the beat sheet and open into entity tiles. */
const FLY_ORDER = ["mia", "bedroom", "flashlight", "monster", "teddy", "style"];
const T2_FLIGHTS: Flight[] = FLY_ORDER.map((id, i) => ({
  key: id,
  start: T.t2[0] + 0.2 + i * 0.07,
  end: T.t2[0] + 0.2 + i * 0.07 + 0.85
}));
/** Tiles shrink into the dot chips of the first shot that uses them. */
const T3_FLIGHTS: Flight[] = FLY_ORDER.map((id, i) => ({
  key: id,
  start: T.t3[0] + 0.15 + i * 0.07,
  end: T.t3[0] + 0.15 + i * 0.07 + 0.75
}));
/** Shots drop onto V1 in order. */
const T4_FLIGHTS: Flight[] = BEATS.map((_, i) => ({
  key: String(i),
  start: T.t4[0] + 0.15 + i * 0.1,
  end: T.t4[0] + 0.15 + i * 0.1 + 0.8
}));
const flight = (list: Flight[], key: string): Flight =>
  list.find((f) => f.key === key) as Flight;

type Morph = { from: string; to: string; show: number; a: number; b: number };
const MORPHS: Morph[] = [
  {
    from: "composer-panel",
    to: "beats-panel",
    show: T.t1[0],
    a: T.t1[0] + 0.05,
    b: T.t1[1]
  },
  {
    from: "beats-panel",
    to: "entities-panel",
    show: T.t2[0] + 0.25,
    a: T.t2[0] + 0.3,
    b: T.t2[0] + 1.1
  },
  {
    from: "entities-panel",
    to: "board-panel",
    show: T.t3[0] + 0.05,
    a: T.t3[0] + 0.1,
    b: T.t3[0] + 0.8
  },
  {
    from: "board-panel",
    to: "timeline-panel",
    show: T.t4[0] + 0.05,
    a: T.t4[0] + 0.1,
    b: T.t4[0] + 0.9
  }
];

/**
 * While a flying copy stands in for an element, the element itself hides:
 * a source from the moment it lifts, a target until the copy lands.
 */
const hfStyle =
  (t: number) =>
  (id: string): React.CSSProperties | undefined => {
    const hide = { opacity: 0 };
    let m = id.match(/^mention-(\d+)-([a-z]+)$/);
    if (m && FIRST_MENTION[m[2]] === Number(m[1])) {
      return t >= flight(T2_FLIGHTS, m[2]).start ? hide : undefined;
    }
    m = id.match(/^tile-(.+)$/);
    if (m) {
      const e = ENTITIES.find((x) => x.image === m?.[1]);
      if (!e) {
        return undefined;
      }
      const landed = t >= flight(T2_FLIGHTS, e.id).end;
      const lifted = t >= flight(T3_FLIGHTS, e.id).start;
      return landed && !lifted ? undefined : hide;
    }
    m = id.match(/^dot-(\d+)-([a-z]+)$/);
    if (m) {
      if (FIRST_SHOT[m[2]] === Number(m[1])) {
        return t >= flight(T3_FLIGHTS, m[2]).end ? undefined : hide;
      }
      return { opacity: span(t, T.t3[1] - 0.3, T.t3[1]) };
    }
    m = id.match(/^card-media-(\d+)$/);
    if (m) {
      return t >= flight(T4_FLIGHTS, m[1]).start ? hide : undefined;
    }
    m = id.match(/^v1-(\d+)$/);
    if (m) {
      const f = flight(T4_FLIGHTS, m[1]);
      return { opacity: span(t, f.end - 0.12, f.end) };
    }
    return undefined;
  };

// ─── Layers ─────────────────────────────────────────────────────────────────

/** One step's surface at its frame-filling scale, optionally clipped. */
const StepLayer: React.FC<{
  scale: number;
  agent?: AgentStatus | null;
  opacity?: number;
  clip?: string;
  transform?: string;
  children: React.ReactNode;
}> = ({ scale, agent = null, opacity = 1, clip, transform = "", children }) =>
  opacity <= 0 ? null : (
    <AbsoluteFill style={{ opacity, clipPath: clip }}>
      <AgentStatusContext.Provider value={agent}>
        <AbsoluteFill style={{ transform: `${transform} scale(${scale})` }}>
          {children}
        </AbsoluteFill>
      </AgentStatusContext.Provider>
    </AbsoluteFill>
  );

/**
 * Every surface in its final state, laid out and never seen. The reel
 * measures the hand-off boxes from it.
 */
const LayoutLayer = React.forwardRef<HTMLDivElement>((_, ref) => {
  const status = { text: "Rendering references · 6 of 6" };
  return (
    <AbsoluteFill ref={ref} style={{ visibility: "hidden" }}>
      <HfContext.Provider value={() => undefined}>
        <StepLayer scale={SCALE.prompt}>
          <ComposerStep />
        </StepLayer>
        <StepLayer scale={SCALE.beats} agent={status}>
          <BeatSheetStep />
        </StepLayer>
        <StepLayer scale={SCALE.entities} agent={status}>
          <EntitiesStep />
        </StepLayer>
        <StepLayer scale={SCALE.board} agent={status}>
          <StoryboardStep states={BEATS.map(() => "queued")} />
        </StepLayer>
        <StepLayer scale={SCALE.timeline} agent={status}>
          <TimelineStep playhead={0} monitor={null} />
        </StepLayer>
      </HfContext.Provider>
    </AbsoluteFill>
  );
});
LayoutLayer.displayName = "LayoutLayer";

/** Measures every `data-hf` box once, in stage pixels, after the fonts land. */
const useMeasured = (
  root: React.RefObject<HTMLDivElement | null>,
  layout: React.RefObject<HTMLDivElement | null>
): Rects | null => {
  const [rects, setRects] = useState<Rects | null>(null);
  const [handle] = useState(() => delayRender("heroflow: measure"));
  useEffect(() => {
    let alive = true;
    ensureInterLoaded()
      .catch(() => undefined)
      .then(() => document.fonts.ready)
      .then(
        () =>
          new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      )
      .then(() => {
        if (!alive || !root.current || !layout.current) {
          return;
        }
        const origin = root.current.getBoundingClientRect();
        // The studio preview scales the canvas; measure in stage pixels.
        const k = origin.width / W;
        const out: Rects = {};
        layout.current.querySelectorAll("[data-hf]").forEach((el) => {
          const id = el.getAttribute("data-hf");
          if (!id) {
            return;
          }
          const r = el.getBoundingClientRect();
          out[id] = {
            x: (r.left - origin.left) / k,
            y: (r.top - origin.top) / k,
            w: r.width / k,
            h: r.height / k
          };
        });
        setRects(out);
        continueRender(handle);
      });
    return () => {
      alive = false;
    };
  }, [handle, root, layout]);
  return rects;
};

// ─── Flying copies ──────────────────────────────────────────────────────────

/** A mention chip that opens into an empty entity tile. */
const ChipToTile: React.FC<{ e: Entity; rect: Rect; p: number }> = ({
  e,
  rect,
  p
}) => {
  const kind = KIND_COLOR[e.kind];
  return (
    <div
      style={{
        ...box(rect),
        borderRadius: lerp(7, R.md, p),
        overflow: "hidden",
        border: `1px solid ${kind}${p < 0.6 ? "66" : "33"}`,
        background: `${kind}1c`,
        boxShadow: `0 ${10 + 30 * Math.sin(p * Math.PI)}px ${30 + 60 * Math.sin(p * Math.PI)}px rgba(0,0,0,0.5), 0 0 ${30 * Math.sin(p * Math.PI)}px ${kind}55`
      }}
    >
      <div
        style={{ position: "absolute", inset: 0, opacity: span(p, 0.35, 0.9) }}
      >
        <MagicFill color={kind} />
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          color: kind,
          fontSize: 30,
          fontWeight: 600,
          whiteSpace: "nowrap",
          opacity: 1 - span(p, 0.15, 0.45)
        }}
      >
        <Icon name={KIND_ICON[e.kind]} size={20} color={kind} />
        {e.name}
      </div>
    </div>
  );
};

/** An entity's reference image shrinking into a dot chip on a shot card. */
const TileToDot: React.FC<{ e: Entity; rect: Rect; p: number }> = ({
  e,
  rect,
  p
}) => {
  const kind = KIND_COLOR[e.kind];
  return (
    <div
      style={{
        ...box(rect),
        borderRadius: Math.min(rect.h / 2, lerp(R.md, 999, span(p, 0.5, 1))),
        overflow: "hidden",
        background: C.overlay,
        border: `1px solid ${span(p, 0.6, 1) > 0.5 ? C.line : `${kind}88`}`,
        boxShadow: `0 20px 50px rgba(0,0,0,${0.5 * (1 - p)}), 0 0 ${24 * Math.sin(p * Math.PI)}px ${kind}66`
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          gap: 6,
          paddingLeft: 9,
          color: C.dim,
          fontSize: 14,
          fontWeight: 500,
          whiteSpace: "nowrap",
          opacity: span(p, 0.6, 0.95)
        }}
      >
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: 4,
            background: kind,
            flexShrink: 0
          }}
        />
        {e.name}
      </div>
      <Img
        src={heroAsset(e.image)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: 1 - span(p, 0.45, 0.8)
        }}
      />
    </div>
  );
};

/** A storyboard shot dropping into its slot on V1. */
const ShotToClip: React.FC<{ index: number; rect: Rect; p: number }> = ({
  index,
  rect,
  p
}) => (
  <div
    style={{
      ...box(rect),
      borderRadius: lerp(R.md * SCALE.board, R.sm * SCALE.timeline, p),
      overflow: "hidden",
      border: `1px solid ${C.video}88`,
      boxShadow: `0 ${20 * (1 - p)}px ${60 * (1 - p)}px rgba(0,0,0,0.55)`,
      opacity: 1 - span(p, 0.92, 1)
    }}
  >
    <Img
      src={heroAsset(BEATS[index].clipFrame)}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  </div>
);

// ─── The reel ───────────────────────────────────────────────────────────────

const agentForBeats = (rows: number): AgentStatus =>
  rows >= BEATS.length
    ? { text: `${BEATS.length} beats written`, done: true }
    : { text: `Writing beats · ${Math.floor(rows) + 1} of ${BEATS.length}` };

const agentForEntities = (done: number): AgentStatus =>
  done >= ENTITIES.length
    ? { text: `${ENTITIES.length} references ready`, done: true }
    : { text: `Rendering references · ${done} of ${ENTITIES.length}` };

const agentForBoard = (b: ReturnType<typeof board>): AgentStatus => {
  const n = BEATS.length;
  const stills = b.states.filter(
    (s) => s !== "queued" && s !== "still-rendering"
  ).length;
  const clips = b.states.filter((s) => s === "clip").length;
  if (clips >= n) {
    return { text: `${n} clips ready`, done: true };
  }
  if (stills < n || b.states.every((s) => s === "still")) {
    return { text: `Rendering stills · ${stills} of ${n}` };
  }
  return { text: `Animating clips · ${clips} of ${n}` };
};

export const HeroFlow: React.FC = () => {
  useInterFont();
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const root = useRef<HTMLDivElement>(null);
  const layout = useRef<HTMLDivElement>(null);
  const rects = useMeasured(root, layout);
  const r = (id: string): Rect => rects?.[id] ?? FULL;

  // Step 1 · Prompt
  const composer = composerState(t, BRIEF.length);
  const composerIn = expoOut(span(t, T.composerIn[0], T.composerIn[1]));
  const composerOpacity = composerIn * (1 - span(t, T.t1[0], T.t1[0] + 0.3));

  // Step 2 · Beat sheet
  const rows = beatRows(t);
  const beatsOpacity =
    span(t, T.t1[0] + 0.45, T.t1[1]) *
    (1 - span(t, T.t2[0] + 0.25, T.t2[0] + 0.55));
  const dim = span(t, T.t2[0], T.t2[0] + 0.3);

  // Step 3 · Entities
  const entitiesOpacity =
    span(t, T.t2[0] + 0.65, T.t2[0] + 1.1) *
    (1 - span(t, T.t3[0] + 0.05, T.t3[0] + 0.35));

  // Step 4 · Storyboard
  const b = board(t);
  const boardOpacity =
    span(t, T.t3[0] + 0.45, T.t3[0] + 0.9) *
    (1 - span(t, T.t4[0] + 0.05, T.t4[0] + 0.4));

  // Step 5 · Timeline and finale
  const expand = inOut(span(t, EXPAND[0], EXPAND[1]));
  const timelineOpacity = span(t, T.t4[0] + 0.5, T.t4[0] + 1.0) * (1 - expand);
  const placed = BEATS.length;
  const playhead = filmTime(t);
  const filmOpacity =
    span(t, T.t4[0] + 0.9, T.t4[1]) *
    (1 - span(t, END - T.tail - T.fadeOut, END - T.tail));

  const morph = MORPHS.find((m) => t >= m.show && t < m.b);
  const morphP = morph ? inOut(span(t, morph.a, morph.b)) : 0;
  const morphRect = morph ? lerpRect(r(morph.from), r(morph.to), morphP) : FULL;
  const morphRadius = morph
    ? lerp(
        morph.from === "composer-panel" ? 26 * SCALE.prompt : R.lg * 1.1,
        R.lg * 1.1,
        morphP
      )
    : 0;
  const clipFor = (panel: string): string | undefined =>
    morph?.to === panel ? insetOf(morphRect, morphRadius) : undefined;

  const playF = Math.round(PLAY.start * FPS);
  const monitorRect = lerpRect(r("tl-monitor"), FULL, expand);

  return (
    <Stage>
      <AbsoluteFill ref={root}>
        {rects ? null : <LayoutLayer ref={layout} />}
        <HfContext.Provider value={hfStyle(t)}>
          <AbsoluteFill style={{ transform: `scale(${camera(t)})` }}>
            {morph ? (
              <div
                style={{
                  ...box(morphRect),
                  borderRadius: morphRadius,
                  background: C.paper,
                  border: `1px solid ${C.line}`,
                  boxShadow: "0 40px 120px rgba(0,0,0,0.55)"
                }}
              />
            ) : null}

            <StepLayer
              scale={SCALE.prompt}
              opacity={composerOpacity}
              transform={`translateY(${(1 - composerIn) * 24}px)`}
            >
              <ComposerStep {...composer} />
            </StepLayer>

            <StepLayer
              scale={SCALE.beats}
              opacity={beatsOpacity}
              clip={clipFor("beats-panel")}
              agent={agentForBeats(rows)}
            >
              <BeatSheetStep rows={rows} dim={dim} />
            </StepLayer>

            <StepLayer
              scale={SCALE.entities}
              opacity={entitiesOpacity}
              clip={clipFor("entities-panel")}
              agent={agentForEntities(entitiesDone(t))}
            >
              <EntitiesStep tile={(src) => tileState(t, src)} />
            </StepLayer>

            <StepLayer
              scale={SCALE.board}
              opacity={boardOpacity}
              clip={clipFor("board-panel")}
              agent={agentForBoard(b)}
            >
              <StoryboardStep
                states={b.states}
                progress={b.progress}
                reveal={b.reveal}
                video={(i) =>
                  b.states[i] === "clip" ? (
                    <Sequence from={Math.round(b.clipAt[i] * FPS)}>
                      <Loop durationInFrames={clipFrames(i)}>
                        <OffthreadVideo
                          src={heroAsset(BEATS[i].clip)}
                          muted
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover"
                          }}
                        />
                      </Loop>
                    </Sequence>
                  ) : null
                }
              />
            </StepLayer>

            <StepLayer
              scale={SCALE.timeline}
              opacity={timelineOpacity}
              clip={clipFor("timeline-panel")}
              transform={`scale(${1 - 0.03 * expand})`}
              agent={
                t < T.t4[1]
                  ? { text: "Assembling cut" }
                  : {
                      text: `Cut assembled · ${TOTAL_SECONDS.toFixed(1)} s`,
                      done: true
                    }
              }
            >
              <TimelineStep
                playhead={playhead}
                placed={placed}
                ruler={inOut(span(t, T.t4[0] + 0.7, T.t4[1]))}
                wave={inOut(span(t, T.t4[0] + 0.9, T.t4[1] + 0.3))}
                monitor={
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      background: "#000"
                    }}
                  />
                }
              />
            </StepLayer>

            {rects && filmOpacity > 0 ? (
              <div
                style={{
                  ...box(monitorRect),
                  borderRadius: lerp(R.sm * SCALE.timeline, 0, expand),
                  overflow: "hidden",
                  background: "#000",
                  opacity: filmOpacity
                }}
              >
                {t < PLAY.start ? (
                  <Freeze frame={0}>
                    <OffthreadVideo
                      src={heroAsset(FILM)}
                      muted
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover"
                      }}
                    />
                  </Freeze>
                ) : null}
                <Sequence from={playF} durationInFrames={PLAY.fastFrames}>
                  <OffthreadVideo
                    src={heroAsset(FILM)}
                    muted
                    playbackRate={PLAY.fastRate}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover"
                    }}
                  />
                </Sequence>
                <Sequence from={playF + PLAY.fastFrames}>
                  <OffthreadVideo
                    src={heroAsset(FILM)}
                    muted
                    trimBefore={Math.round(PLAY.slowFrom * FPS)}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover"
                    }}
                  />
                </Sequence>
                <MonitorBar
                  playhead={playhead}
                  opacity={1 - span(expand, 0, 0.3)}
                />
              </div>
            ) : null}

            {rects ? <Flights t={t} r={r} /> : null}
          </AbsoluteFill>
        </HfContext.Provider>
      </AbsoluteFill>
    </Stage>
  );
};

/** All flying copies live at the time `t`. */
const Flights: React.FC<{ t: number; r: (id: string) => Rect }> = ({
  t,
  r
}) => {
  const live = (f: Flight): boolean => t >= f.start && t < f.end;
  const p = (f: Flight): number => inOut(span(t, f.start, f.end));
  // Style has no mention: its chip rises out of the sheet's title.
  const styleFrom = (): Rect => {
    const title = r("beats-title");
    const chip = r("mention-0-mia");
    return {
      x: title.x,
      y: title.y + title.h - chip.h,
      w: chip.w * 1.6,
      h: chip.h
    };
  };
  return (
    <>
      {T2_FLIGHTS.filter(live).map((f) => {
        const e = entity(f.key);
        const from =
          f.key === "style"
            ? styleFrom()
            : r(`mention-${FIRST_MENTION[f.key]}-${f.key}`);
        const rect = lerpRect(from, r(`tile-${e.image}`), p(f), 90);
        return <ChipToTile key={`t2-${f.key}`} e={e} rect={rect} p={p(f)} />;
      })}
      {T3_FLIGHTS.filter(live).map((f) => {
        const e = entity(f.key);
        const rect = lerpRect(
          r(`tile-${e.image}`),
          r(`dot-${FIRST_SHOT[f.key]}-${f.key}`),
          p(f),
          40
        );
        return <TileToDot key={`t3-${f.key}`} e={e} rect={rect} p={p(f)} />;
      })}
      {T4_FLIGHTS.filter(live).map((f) => {
        const i = Number(f.key);
        const rect = lerpRect(r(`card-media-${i}`), r(`v1-${i}`), p(f), 30);
        return <ShotToClip key={`t4-${i}`} index={i} rect={rect} p={p(f)} />;
      })}
    </>
  );
};
