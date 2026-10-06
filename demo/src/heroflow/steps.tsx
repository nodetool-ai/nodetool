/**
 * The five surfaces of the hero flow, each drawn as a plain function of its
 * state. A mockup renders one fixed state; the motion pass will derive the
 * same props from the frame clock.
 */
import React from "react";
import { AbsoluteFill, Img } from "remotion";

import {
  BEATS,
  BRIEF,
  CLIP_MODEL,
  ENTITIES,
  KIND_COLOR,
  MODEL,
  STILL_MODEL,
  SCORE,
  TITLE,
  TOTAL_SECONDS,
  entity,
  shotAt,
  shotLength,
  shotStart,
  timecode,
  type Entity
} from "./data";
import { ACCENT_GRADIENT, C, MONO, R, heroAsset } from "./theme";
import {
  BeatText,
  Develop,
  DotChip,
  Icon,
  KindChip,
  MagicFill,
  Mention,
  MetaChip,
  Panel,
  PanelHeader,
  ProgressBar,
  StatusPill,
  useHf,
  type ShotState
} from "./ui";

const center: React.CSSProperties = {
  alignItems: "center",
  justifyContent: "center"
};

// ─── 1 · Prompt ─────────────────────────────────────────────────────────────

/** The chat composer, alone on the stage, with the brief typed into it. */
export const ComposerStep: React.FC<{
  typed?: number;
  sent?: boolean;
  /** Caret visibility, for the blink. */
  caret?: boolean;
  /** The send button's press, 0..1. */
  press?: number;
}> = ({ typed = BRIEF.length, sent = false, caret = true, press = 0 }) => (
  <AbsoluteFill style={center}>
    <div
      style={{ width: 1360, display: "flex", flexDirection: "column", gap: 34 }}
    >
      <div
        style={{
          fontSize: 30,
          fontWeight: 500,
          color: C.dim,
          letterSpacing: -0.4,
          paddingLeft: 8
        }}
      >
        What are we making today?
      </div>
      <Panel
        hf="composer-panel"
        style={{
          borderRadius: 26,
          background: "rgba(16,17,19,0.96)",
          border: `1px solid ${C.lineStrong}`
        }}
      >
        <div
          style={{
            padding: "36px 44px 24px",
            fontSize: 46,
            fontWeight: 500,
            lineHeight: 1.32,
            letterSpacing: -0.8,
            minHeight: 190
          }}
        >
          {BRIEF.slice(0, typed)}
          {sent ? null : (
            <span
              style={{
                display: "inline-block",
                width: 3,
                height: 50,
                marginLeft: 4,
                verticalAlign: "-8px",
                background: C.fuchsia,
                opacity: caret ? 1 : 0
              }}
            />
          )}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "0 26px 24px 30px"
          }}
        >
          <Icon name="clip" size={26} color={C.dim} />
          <div style={{ width: 8 }} />
          <MetaChip icon="sparkle" label="Agent" color={C.fuchsia} size={18} />
          <MetaChip label={MODEL} size={18} />
          <div style={{ flex: 1 }} />
          <div
            style={{
              width: 62,
              height: 62,
              borderRadius: 31,
              display: "grid",
              placeItems: "center",
              backgroundImage: ACCENT_GRADIENT,
              boxShadow: `0 10px ${40 + press * 50}px rgba(232,121,249,${0.35 + press * 0.4})`,
              transform: `scale(${1 - Math.sin(press * Math.PI) * 0.12})`
            }}
          >
            <Icon name="send" size={28} color="#0B1220" fill />
          </div>
        </div>
      </Panel>
    </div>
  </AbsoluteFill>
);

// ─── 2 · Beat sheet ─────────────────────────────────────────────────────────

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * `rows` is how far the agent has written, in beats: row i is half written
 * at i + 0.5. `dim` fades the prose (not the mentions) for the hand-off.
 */
export const BeatSheetStep: React.FC<{ rows?: number; dim?: number }> = ({
  rows = BEATS.length,
  dim = 0
}) => (
  <AbsoluteFill style={center}>
    <Panel hf="beats-panel" style={{ width: 1500 }}>
      <div
        data-hf="beats-title"
        style={{
          padding: "34px 44px 14px",
          fontSize: 50,
          fontWeight: 800,
          letterSpacing: -1.6,
          lineHeight: 1
        }}
      >
        Beat sheet
      </div>
      <div style={{ padding: "8px 28px 26px" }}>
        {BEATS.map((b, i) => {
          const p = clamp01(rows - i);
          const head = clamp01(p / 0.25) * (1 - dim * 0.7);
          return (
            <div
              key={b.label}
              style={{
                display: "grid",
                gridTemplateColumns: "84px 150px 1fr",
                alignItems: "baseline",
                gap: 16,
                padding: "15px 16px",
                borderTop: i === 0 ? "none" : `1px solid ${C.line}`
              }}
            >
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 18,
                  color: C.dim,
                  opacity: head
                }}
              >
                {timecode(shotStart(i))}
              </div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  letterSpacing: 1.6,
                  textTransform: "uppercase",
                  color: C.textual,
                  opacity: head
                }}
              >
                {b.label}
              </div>
              <div
                style={{
                  fontSize: 25,
                  lineHeight: 1.45,
                  color: C.text,
                  whiteSpace: "nowrap",
                  clipPath:
                    p < 1 ? `inset(-12px ${(1 - p) * 100}% -12px 0)` : undefined
                }}
              >
                <BeatText
                  line={b.line}
                  textStyle={{ opacity: 1 - dim * 0.7 }}
                  render={(id, at) => {
                    const e = entity(id);
                    return (
                      <Mention
                        kind={e.kind}
                        hf={`mention-${i}-${id}`}
                        pop={clamp01((p - at) / 0.18)}
                      >
                        {e.name}
                      </Mention>
                    );
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  </AbsoluteFill>
);

// ─── 3 · Entities ───────────────────────────────────────────────────────────

export type EntityCardState = "empty" | "rendering" | "done";

/** One tile's render state: `progress` while rendering, `reveal` as it develops. */
export type TileState = {
  state: EntityCardState;
  progress?: number;
  reveal?: number;
};

/**
 * A reference image, or the generation fill while it renders. With `label`
 * it carries the entity's name and kind over a bottom scrim, so the card
 * needs no text block.
 */
const EntityTile: React.FC<{
  entity: Entity;
  src: string;
  width: number;
  height: number;
  tile: TileState;
  label?: "large" | "small";
}> = ({ entity: e, src, width, height, tile, label }) => {
  const { state, progress = 0.62, reveal = 1 } = tile;
  const color = KIND_COLOR[e.kind];
  const large = label === "large";
  const hf = useHf()(`tile-${src}`);
  return (
    <div
      {...hf}
      style={{
        position: "relative",
        width,
        height,
        flexShrink: 0,
        borderRadius: R.md,
        overflow: "hidden",
        background: C.bg,
        border: `1px solid ${C.line}`,
        ...hf.style
      }}
    >
      {state !== "done" || reveal < 1 ? (
        <MagicFill
          phase={state === "rendering" ? progress : undefined}
          color={color}
        />
      ) : null}
      {state === "done" ? <Develop src={src} reveal={reveal} /> : null}
      {label ? (
        <>
          <AbsoluteFill
            style={{
              background:
                "linear-gradient(to top, rgba(8,9,10,0.85), transparent 38%)"
            }}
          />
          <div
            style={{
              position: "absolute",
              left: large ? 26 : 18,
              right: large ? 26 : 18,
              bottom: large ? 22 : 16,
              display: "flex",
              alignItems: "center",
              gap: 12
            }}
          >
            <div
              style={{
                fontSize: large ? 38 : 25,
                fontWeight: 600,
                letterSpacing: large ? -0.8 : -0.3,
                whiteSpace: "nowrap"
              }}
            >
              {e.name}
            </div>
            <KindChip kind={e.kind} size={large ? 16 : 14} />
          </div>
        </>
      ) : null}
      {state === "rendering" ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: 0 }}>
          <ProgressBar value={progress} color={color} height={5} />
        </div>
      ) : null}
    </div>
  );
};

/**
 * A character: the main reference, named, and a two-image reference sheet
 * beside it. The sheet makes the consistency claim without a word of copy.
 */
export const CharacterCard: React.FC<{
  entity: Entity;
  width: number;
  tile: (src: string) => TileState;
}> = ({ entity: e, width, tile }) => {
  const gap = 14;
  // main + gap + (main - gap) / 2 fills the card's inner width.
  const main = Math.floor((width - 2 * gap - gap / 2) / 1.5);
  const ref = (main - gap) / 2;
  return (
    <div
      style={{
        width,
        display: "flex",
        gap,
        padding: gap,
        borderRadius: R.lg,
        background: C.overlay,
        border: `1px solid ${C.line}`
      }}
    >
      <EntityTile
        entity={e}
        src={e.image}
        width={main}
        height={main}
        tile={tile(e.image)}
        label="large"
      />
      <div style={{ display: "flex", flexDirection: "column", gap }}>
        {(e.refs ?? []).map((src) => (
          <EntityTile
            key={src}
            entity={e}
            src={src}
            width={ref}
            height={ref}
            tile={tile(src)}
          />
        ))}
      </div>
    </div>
  );
};

/**
 * Characters across the top, everything else below. `states` sets a whole
 * entity by id (a missing id is done); `tile`, when given, sets each image
 * by its source and wins.
 */
export const EntitiesStep: React.FC<{
  states?: Partial<Record<string, EntityCardState>>;
  tile?: (src: string) => TileState;
}> = ({ states = {}, tile }) => {
  const tileOf =
    (e: Entity) =>
    (src: string): TileState =>
      tile ? tile(src) : { state: states[e.id] ?? "done" };
  const W = 1840;
  const pad = 28;
  const gap = 20;
  const characters = ENTITIES.filter((e) => e.kind === "character");
  const others = ENTITIES.filter((e) => e.kind !== "character");
  const charW =
    (W - 2 * pad - gap * (characters.length - 1)) / characters.length;
  const otherW = (W - 2 * pad - gap * (others.length - 1)) / others.length;
  return (
    <AbsoluteFill style={center}>
      <Panel hf="entities-panel" style={{ width: W }}>
        <PanelHeader icon="person" title="Entities" accent={C.primary} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap,
            padding: pad
          }}
        >
          <div style={{ display: "flex", gap }}>
            {characters.map((e) => (
              <CharacterCard
                key={e.id}
                entity={e}
                width={charW}
                tile={tileOf(e)}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap }}>
            {others.map((e) => (
              <EntityTile
                key={e.id}
                entity={e}
                src={e.image}
                width={otherW}
                height={Math.round(otherW * 0.62)}
                tile={tileOf(e)(e.image)}
                label="small"
              />
            ))}
          </div>
        </div>
      </Panel>
    </AbsoluteFill>
  );
};

// ─── 4 · Storyboard ─────────────────────────────────────────────────────────

/** One storyboard cell. The media carries status; the footer the entities. */
export const ShotCard: React.FC<{
  index: number;
  width: number;
  state: ShotState;
  progress?: number;
  /** How far the still has developed, 0..1. */
  reveal?: number;
  /** The playing clip, drawn over the media once the shot is a clip. */
  video?: React.ReactNode;
}> = ({ index, width, state, progress = 0.5, reveal = 1, video }) => {
  const beat = BEATS[index];
  const hf = useHf();
  const media = hf(`card-media-${index}`);
  const h = Math.round((width * 9) / 16);
  const hasStill =
    state === "still" || state === "clip-rendering" || state === "clip";
  const isClip = state === "clip";
  const busy = state === "still-rendering" || state === "clip-rendering";
  return (
    <div
      style={{
        width,
        borderRadius: R.md,
        overflow: "hidden",
        background: C.overlay,
        border: `1px solid ${isClip ? `${C.video}66` : C.line}`,
        boxShadow: "0 20px 50px rgba(0,0,0,0.4)"
      }}
    >
      <div
        data-hf={media["data-hf"]}
        style={{
          position: "relative",
          width,
          height: h,
          background: C.bg,
          overflow: "hidden",
          ...media.style
        }}
      >
        {!hasStill || reveal < 1 ? (
          <MagicFill
            phase={state === "still-rendering" ? progress : undefined}
          />
        ) : null}
        {hasStill ? (
          isClip && video ? (
            video
          ) : (
            <Develop
              src={isClip ? beat.clipFrame : beat.still}
              reveal={reveal}
              zoom={isClip ? 1.06 : 1}
            />
          )
        ) : null}
        {state === "queued" ? (
          <AbsoluteFill
            style={{
              ...center,
              color: C.faint,
              fontSize: 17,
              gap: 8,
              flexDirection: "column"
            }}
          >
            <Icon name="image" size={30} color={C.faint} />
            {beat.framing} · {beat.movement}
          </AbsoluteFill>
        ) : null}
        <AbsoluteFill
          style={{
            background:
              "linear-gradient(to top, rgba(8,9,10,0.85), transparent 45%)"
          }}
        />
        <div style={{ position: "absolute", top: 12, left: 12 }}>
          <StatusPill state={state} />
        </div>
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            fontFamily: MONO,
            fontSize: 15,
            color: C.text,
            padding: "4px 10px",
            borderRadius: R.pill,
            background: "rgba(8,9,10,0.72)"
          }}
        >
          {timecode(shotStart(index))}
        </div>
        <div style={{ position: "absolute", left: 16, bottom: 20, right: 16 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: 1.4,
              textTransform: "uppercase",
              color: C.textual
            }}
          >
            Shot {index + 1} · {beat.label}
          </div>
          <div
            style={{
              fontSize: 23,
              fontWeight: 600,
              letterSpacing: -0.3,
              marginTop: 3
            }}
          >
            {beat.slug}
          </div>
        </div>
        {busy ? (
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
            <ProgressBar
              value={progress}
              color={state === "clip-rendering" ? C.video : C.image}
              height={5}
            />
          </div>
        ) : null}
        {isClip ? (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 5,
              background: "rgba(255,255,255,0.1)"
            }}
          >
            <div
              style={{
                width: `${30 + index * 9}%`,
                height: "100%",
                background: C.video
              }}
            />
          </div>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          gap: 7,
          padding: "11px 12px",
          overflow: "hidden"
        }}
      >
        {beat.entities.map((id) => {
          const e = entity(id);
          return (
            <DotChip
              key={id}
              kind={e.kind}
              label={e.name}
              hf={`dot-${index}-${id}`}
            />
          );
        })}
      </div>
    </div>
  );
};

export const StoryboardStep: React.FC<{
  states: ShotState[];
  progress?: number | number[];
  reveal?: number[];
  video?: (index: number) => React.ReactNode;
}> = ({ states, progress = 0.62, reveal, video }) => {
  const cardW = 528;
  const stills = states.filter(
    (s) => s !== "queued" && s !== "still-rendering"
  ).length;
  const clips = states.filter((s) => s === "clip").length;
  return (
    <AbsoluteFill style={center}>
      <Panel hf="board-panel" style={{ width: 1680 }}>
        <PanelHeader
          icon="grid"
          title={`${TITLE} — Storyboard`}
          accent={C.fuchsia}
          meta={
            <div style={{ display: "flex", gap: 10 }}>
              <MetaChip
                icon="image"
                label={`${STILL_MODEL} · ${stills}/${BEATS.length}`}
                color={C.image}
              />
              <MetaChip
                icon="film"
                label={`${CLIP_MODEL} · ${clips}/${BEATS.length}`}
                color={C.video}
              />
              <MetaChip label={`16:9 · ${TOTAL_SECONDS} s`} />
            </div>
          }
        />
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 20,
            padding: 24,
            justifyContent: "center"
          }}
        >
          {BEATS.map((b, i) => (
            <ShotCard
              key={b.label}
              index={i}
              width={cardW}
              state={states[i]}
              progress={Array.isArray(progress) ? progress[i] : progress}
              reveal={reveal?.[i]}
              video={video?.(i)}
            />
          ))}
        </div>
      </Panel>
    </AbsoluteFill>
  );
};

// ─── 5 · Timeline ───────────────────────────────────────────────────────────

/** Deterministic waveform heights, so the track never shimmers between renders. */
const wave = (n: number): number[] =>
  Array.from({ length: n }, (_, i) => {
    const kick = i % 16 < 2 ? 0.9 : 0;
    const body = 0.35 + 0.25 * Math.sin(i * 0.37) * Math.sin(i * 0.11 + 1);
    return Math.min(
      1,
      Math.max(0.12, Math.max(kick, body + 0.15 * Math.sin(i * 2.3)))
    );
  });

/**
 * `ruler` and `wave` draw the ruler and the score in from the left (0..1).
 * `monitor` replaces the monitor's picture, so the motion pass can lift the
 * playing film out of the panel.
 */
export const TimelineStep: React.FC<{
  playhead?: number;
  placed?: number;
  ruler?: number;
  wave?: number;
  monitor?: React.ReactNode;
}> = ({
  playhead = 7.6,
  placed = BEATS.length,
  ruler = 1,
  wave: waveIn = 1,
  monitor
}) => {
  const hf = useHf();
  const W = 1760;
  const headerW = 96;
  const laneW = W - headerW - 40;
  const pps = laneW / TOTAL_SECONDS;
  const monitorW = 960;
  const monitorH = Math.round((monitorW * 9) / 16);
  const bars = wave(Math.round(laneW / 6));
  return (
    <AbsoluteFill style={center}>
      <Panel hf="timeline-panel" style={{ width: W }}>
        <PanelHeader
          icon="cut"
          title={`${TITLE} — Final cut`}
          accent={C.video}
          meta={
            <div style={{ display: "flex", gap: 10 }}>
              <MetaChip label="1920 × 1080" />
              <MetaChip label="30 fps" />
            </div>
          }
        />
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "22px 0 14px",
            background: C.bg
          }}
        >
          <div
            {...hf("tl-monitor")}
            style={{
              position: "relative",
              width: monitorW,
              height: monitorH,
              borderRadius: R.sm,
              overflow: "hidden",
              background: "#000",
              ...hf("tl-monitor").style
            }}
          >
            {monitor === undefined ? (
              <Img
                src={heroAsset(BEATS[shotAt(playhead)].clipFrame)}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              monitor
            )}
            <MonitorBar playhead={playhead} />
          </div>
        </div>
        <div style={{ padding: "6px 20px 22px", position: "relative" }}>
          {/* Ruler: the beat sheet's six segments, now as markers. */}
          <div style={{ display: "flex", height: 40, alignItems: "flex-end" }}>
            <div style={{ width: headerW }} />
            <div
              style={{
                position: "relative",
                width: laneW,
                height: 40,
                clipPath:
                  ruler < 1 ? `inset(0 ${(1 - ruler) * 100}% 0 0)` : undefined
              }}
            >
              {BEATS.map((b, i) => (
                <div
                  key={b.label}
                  style={{
                    position: "absolute",
                    left: shotStart(i) * pps,
                    bottom: 0,
                    height: 40,
                    borderLeft: `1px solid ${C.lineStrong}`,
                    paddingLeft: 8,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between"
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: 1.3,
                      textTransform: "uppercase",
                      color: C.textual
                    }}
                  >
                    {b.label}
                  </span>
                  <span
                    style={{ fontFamily: MONO, fontSize: 13, color: C.dim }}
                  >
                    {timecode(shotStart(i))}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <TrackRow
            label="V1"
            icon="film"
            color={C.video}
            headerW={headerW}
            height={96}
          >
            {BEATS.map((b, i) =>
              i < placed ? (
                <div
                  key={b.label}
                  data-hf={`v1-${i}`}
                  style={{
                    position: "absolute",
                    left: shotStart(i) * pps + 1,
                    width: shotLength(i) * pps - 3,
                    top: 6,
                    bottom: 6,
                    borderRadius: R.sm,
                    overflow: "hidden",
                    border: `1px solid ${C.video}88`,
                    background: C.paper,
                    ...hf(`v1-${i}`).style
                  }}
                >
                  <div style={{ display: "flex", height: "100%" }}>
                    {[b.still, b.clipFrame, b.still].map((src, k) => (
                      <Img
                        key={k}
                        src={heroAsset(src)}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          height: "100%",
                          objectFit: "cover",
                          opacity: 0.8,
                          borderRight: "1px solid rgba(0,0,0,0.5)"
                        }}
                      />
                    ))}
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      margin: 6,
                      padding: "3px 9px",
                      fontSize: 14,
                      fontWeight: 600,
                      borderRadius: R.pill,
                      background: "rgba(8,9,10,0.82)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7
                    }}
                  >
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        background: C.video
                      }}
                    />
                    {b.slug}
                  </div>
                </div>
              ) : null
            )}
          </TrackRow>
          <TrackRow
            label="A1"
            icon="music"
            color={C.audio}
            headerW={headerW}
            height={64}
          >
            <div
              style={{
                position: "absolute",
                inset: "6px 1px",
                borderRadius: R.sm,
                background: `${C.audio}14`,
                border: `1px solid ${C.audio}55`,
                display: "flex",
                alignItems: "center",
                gap: 2,
                padding: "0 4px",
                overflow: "hidden",
                clipPath:
                  waveIn < 1 ? `inset(0 ${(1 - waveIn) * 100}% 0 0)` : undefined
              }}
            >
              {bars.map((v, i) => (
                <div
                  key={i}
                  style={{
                    width: 4,
                    height: `${v * 80}%`,
                    borderRadius: 2,
                    background: C.audio,
                    opacity: 0.75,
                    flexShrink: 0
                  }}
                />
              ))}
              <div
                style={{
                  position: "absolute",
                  left: 8,
                  top: 8,
                  padding: "2px 9px",
                  borderRadius: R.pill,
                  background: "rgba(8,9,10,0.85)",
                  fontSize: 13,
                  fontWeight: 600,
                  color: C.text
                }}
              >
                {SCORE}
              </div>
            </div>
          </TrackRow>
          {/* Playhead spans ruler and tracks. */}
          <div
            style={{
              position: "absolute",
              top: 6,
              bottom: 22,
              left: 20 + headerW + playhead * pps,
              width: 2,
              background: C.text,
              boxShadow: "0 0 12px rgba(255,255,255,0.6)"
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -2,
                left: -7,
                width: 16,
                height: 12,
                borderRadius: 3,
                background: C.text
              }}
            />
          </div>
        </div>
      </Panel>
    </AbsoluteFill>
  );
};

/** The monitor's transport line: state icon and timecode over a scrim. */
export const MonitorBar: React.FC<{ playhead: number; opacity?: number }> = ({
  playhead,
  opacity = 1
}) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      padding: "40px 28px 18px",
      background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)",
      display: "flex",
      alignItems: "center",
      gap: 14,
      fontFamily: MONO,
      fontSize: 18,
      opacity
    }}
  >
    <Icon name="pause" size={22} color={C.text} fill />
    <span>{`0:${playhead.toFixed(1).padStart(4, "0")}`}</span>
    <span style={{ color: C.dim }}>/ {timecode(TOTAL_SECONDS)}.0</span>
  </div>
);

const TrackRow: React.FC<{
  label: string;
  icon: "film" | "music";
  color: string;
  headerW: number;
  height: number;
  children: React.ReactNode;
}> = ({ label, icon, color, headerW, height, children }) => (
  <div style={{ display: "flex", height, borderTop: `1px solid ${C.line}` }}>
    <div
      style={{
        width: headerW,
        display: "flex",
        alignItems: "center",
        gap: 8,
        paddingLeft: 10,
        color: C.dim,
        fontSize: 16,
        fontWeight: 600
      }}
    >
      <Icon name={icon} size={18} color={color} />
      {label}
    </div>
    <div style={{ position: "relative", flex: 1 }}>{children}</div>
  </div>
);
