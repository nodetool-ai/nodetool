/**
 * The landing-page hero reel: one project, start to finish, in the order the
 * project section below the fold tells it.
 *
 *   0   Brief      a sentence, full frame
 *   1   Describe   the agent takes it and writes the board        (chat)
 *   2   Board      a still lands on every shot                    (storyboard)
 *   3   Render     each still animates into a clip                (storyboard)
 *   4   Cut        the clips assemble on the timeline             (timeline)
 *       Deliver    the finished teaser, full frame
 *
 * Every stage replays a real cast through the real product surface
 * (`web/src/demo/hero/`), so the footage is product output rather than a
 * mock-up, and the six shots are the same six all the way through — the
 * clips that play over the closing headline are the ones the board rendered.
 *
 * Silent, loops, opens and closes on black. Cast clocks run faster than real
 * time here: replay is a deterministic seek, so compressing costs nothing.
 */
import React from "react";
import {
  AbsoluteFill,
  Easing,
  OffthreadVideo,
  Sequence,
  Series,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  ChatDemoPlayer,
  DocDemoPlayer,
  TimelineDemoPlayer,
  HERO_BRIEF,
  HERO_SHOTS,
  heroBriefCast,
  heroStoryboardCast,
  heroTimelineCast,
} from "@web-demo";

import { usePendingMediaDelay } from "../promo/usePendingMediaDelay";
import { useInterFont } from "../promo/fonts";
import {
  PROMO_ACCENT_GRADIENT,
  PROMO_BG,
  PROMO_FONT,
  PROMO_TEXT,
} from "../promo/theme";
import {
  DISSOLVE,
  HeroCaption,
  LoopFade,
  paced,
  Settle,
  StageRail,
  surfaceBand,
  useScale,
  type HeroStage,
} from "./heroChrome";

export const HERO_FPS = 30;
export const HERO_DURATION_FRAMES = paced(660);

/**
 * Stage boundaries, in authored frames — `paced` stretches them, and every
 * beat inside a stage goes through it too, so the whole reel slows together.
 * Each stage overlaps the next by DISSOLVE.
 */
const BRIEF_TO = paced(60);
const CHAT_FROM = paced(52);
const BOARD_FROM = paced(170);
/** Where the board's stills pass hands over to its clips pass. */
const RENDER_FROM = paced(300);
const CUT_FROM = paced(430);
const DELIVER_FROM = paced(540);

/** What the rail across the top shows. `Board` spans the two board passes. */
const STAGES: HeroStage[] = [
  { label: "Describe", from: CHAT_FROM, to: BOARD_FROM },
  { label: "Board", from: BOARD_FROM, to: RENDER_FROM },
  { label: "Render", from: RENDER_FROM, to: CUT_FROM },
  { label: "Cut", from: CUT_FROM, to: DELIVER_FROM },
];

const resolveHeroAsset = (file: string): string =>
  staticFile(`casts/promo/${file}`);

/** The opening sentence, split once for the word-by-word type-on. */
const BRIEF_WORDS = HERO_BRIEF.split(" ");

/**
 * The CSS width a surface is laid out at before it is scaled to the frame.
 * The 9:16 cut is only 1080 px wide, so laying a 1500 px window out there
 * would shrink the UI to two thirds; it gets a narrower one instead.
 */
const useLogicalWidth = (landscape: number, portrait: number): number => {
  const { width, height } = useVideoConfig();
  return height > width ? portrait : landscape;
};

/**
 * A product surface in the reel's middle band.
 *
 * The UI is laid out at `logicalWidth` CSS pixels and scaled to the frame's
 * width, so a window designed for 1500 px fills 1920 instead of rendering at
 * four fifths of its apparent size. `push` scales the whole band a few
 * percent over the stage, so no shot is dead still.
 */
const SurfaceBand: React.FC<{
  logicalWidth: number;
  push?: number;
  children: React.ReactNode;
}> = ({ logicalWidth, push = 1, children }) => {
  const { width, height } = useVideoConfig();
  const scale = useScale();
  const { top, height: bandHeight } = surfaceBand(width, height, scale);
  const zoom = width / logicalWidth;

  return (
    <AbsoluteFill style={{ background: PROMO_BG }}>
      <div
        style={{
          position: "absolute",
          top,
          left: 0,
          width,
          height: bandHeight,
          overflow: "hidden",
          borderTop: "1px solid rgba(148,163,184,0.14)",
          borderBottom: "1px solid rgba(148,163,184,0.14)",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            transform: `scale(${push})`,
            transformOrigin: "center center",
          }}
        >
          <div
            style={{
              width: logicalWidth,
              height: bandHeight / zoom,
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/**
 * The height, in the surface's own CSS pixels, of the band a `logicalWidth`
 * surface gets. A surface that sizes a region itself (the timeline's track
 * area) needs this rather than the frame height, which is in video pixels.
 */
const useBandLogicalHeight = (logicalWidth: number): number => {
  const { width, height } = useVideoConfig();
  const scale = useScale();
  return surfaceBand(width, height, scale).height / (width / logicalWidth);
};

/** A slow push from 1 to `to` across `frames`. */
const usePush = (to: number, frames: number): number =>
  interpolate(useCurrentFrame(), [0, frames], [1, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

/** Stage 0 — the brief, full frame, word by word. */
const BriefStage: React.FC = () => {
  const frame = useCurrentFrame();
  const scale = useScale();

  // Out on a lift, so the sentence hands off to the chat rather than cutting.
  const lift = interpolate(frame, [CHAT_FROM - paced(8), BRIEF_TO], [0, -38], {
    easing: Easing.in(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const out = interpolate(
    frame,
    [CHAT_FROM - paced(4), CHAT_FROM + paced(4)],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  return (
    <AbsoluteFill style={{ background: PROMO_BG }}>
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(70% 55% at 50% 45%, rgba(232,121,249,0.12), transparent 70%)",
        }}
      />
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          padding: `0 ${140 * scale}px`,
          fontFamily: PROMO_FONT,
          opacity: out,
          transform: `translateY(${lift * scale}px)`,
        }}
      >
        <div
          style={{
            fontSize: 58 * scale,
            fontWeight: 600,
            lineHeight: 1.24,
            letterSpacing: -1 * scale,
            color: PROMO_TEXT,
            textAlign: "center",
            maxWidth: 1500 * scale,
          }}
        >
          {BRIEF_WORDS.map((word, i) => {
            const at = paced(5 + i * 1.15);
            return (
              <span
                key={`${word}-${i}`}
                style={{
                  display: "inline-block",
                  marginRight: "0.32em",
                  opacity: interpolate(frame, [at, at + paced(9)], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  }),
                  transform: `translateY(${interpolate(
                    frame,
                    [at, at + paced(11)],
                    [16, 0],
                    {
                      easing: Easing.out(Easing.cubic),
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    }
                  ) * scale}px)`,
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Stage 1 — the agent takes the brief and writes the board. */
const ChatStage: React.FC = () => {
  const frame = useCurrentFrame();
  const length = BOARD_FROM + DISSOLVE - CHAT_FROM;
  const logicalWidth = useLogicalWidth(1180, 1000);
  const push = usePush(1.03, length);

  // The brief is already on screen from stage 0, so open on the user bubble
  // and run through the plan and the board being written.
  const castMs = interpolate(frame, [0, paced(14), length], [300, 1500, 11400], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SurfaceBand logicalWidth={logicalWidth} push={push}>
      <ChatDemoPlayer cast={heroBriefCast} timeMs={castMs} />
    </SurfaceBand>
  );
};

/**
 * Stages 2 and 3 — one continuous shot of the board. The stills land, then
 * every card renders its clip; the caption changes at the pass boundary
 * rather than the picture cutting, because it is the same board either way.
 */
const BoardStage: React.FC = () => {
  const frame = useCurrentFrame();
  const length = CUT_FROM + DISSOLVE - BOARD_FROM;
  const logicalWidth = useLogicalWidth(1500, 1180);
  const onPendingMedia = usePendingMediaDelay("hero-board");

  // Two ramps at different rates: the stills pass is the readable one, the
  // clip pass only has to show six cards flipping.
  const castMs = interpolate(
    frame,
    [0, RENDER_FROM - BOARD_FROM, length],
    [700, 7600, 18400],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <SurfaceBand logicalWidth={logicalWidth}>
      <DocDemoPlayer
        cast={heroStoryboardCast}
        timeMs={castMs}
        resolveAssetUrl={resolveHeroAsset}
        // Without this the six rendered clips sit on their first frame and
        // the render pass reads as a second pass of stills.
        mediaTimeMs={(frame / HERO_FPS) * 1000}
        onPendingMedia={onPendingMedia}
      />
    </SurfaceBand>
  );
};

/** Stage 4 — the clips assemble into a cut and it plays. */
const CutStage: React.FC = () => {
  const frame = useCurrentFrame();
  const length = DELIVER_FROM + DISSOLVE - CUT_FROM;
  const logicalWidth = useLogicalWidth(1500, 1180);
  const bandHeight = useBandLogicalHeight(logicalWidth);
  const onPendingMedia = usePendingMediaDelay("hero-cut");

  const castMs = interpolate(frame, [0, length], [200, 11400], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SurfaceBand logicalWidth={logicalWidth}>
      <TimelineDemoPlayer
        cast={heroTimelineCast}
        timeMs={castMs}
        resolveAssetUrl={resolveHeroAsset}
        tracksHeightPx={Math.round(bandHeight * 0.3)}
        onPendingMedia={onPendingMedia}
        chrome={false}
      />
    </SurfaceBand>
  );
};

/**
 * The close — the six rendered clips, back to back, with the headline over
 * them. This is the cut the timeline just assembled, playing.
 */
const DeliverStage: React.FC = () => {
  const frame = useCurrentFrame();
  const scale = useScale();
  const length = HERO_DURATION_FRAMES - DELIVER_FROM;
  /**
   * Five quick cuts resolving on a long last shot — the montage carries the
   * energy, the held getaway lets the headline land on something still.
   */
  const quick = paced(18);
  const held = length - quick * (HERO_SHOTS.length - 1);

  const headline = interpolate(frame, [paced(22), paced(44)], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // The cut opens on a blown-out desert frame straight out of a dark editor;
  // a floor under the scrim keeps that from reading as a flash.
  const scrim = 0.34 + headline * 0.66;

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Series>
        {HERO_SHOTS.map((shot, i) => (
          <Series.Sequence
            key={shot.id}
            durationInFrames={i === HERO_SHOTS.length - 1 ? held : quick}
          >
            <OffthreadVideo
              src={resolveHeroAsset(`${shot.clip}.webm`)}
              muted
              // The takes run two seconds; start a beat in, where the motion is.
              trimBefore={12}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </Series.Sequence>
        ))}
      </Series>

      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to top, rgba(2,6,23,0.94) 0%, rgba(2,6,23,0.82) 34%, rgba(2,6,23,0.66) 62%, rgba(2,6,23,0.5) 100%)",
          opacity: scrim,
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(58% 44% at 50% 50%, rgba(2,6,23,0.72), transparent 72%)",
          opacity: headline,
        }}
      />
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          fontFamily: PROMO_FONT,
          padding: `0 ${90 * scale}px`,
          textAlign: "center",
          opacity: headline,
          transform: `translateY(${interpolate(frame, [paced(26), paced(50)], [22, 0], {
            easing: Easing.out(Easing.cubic),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }) * scale}px)`,
        }}
      >
        <div
          style={{
            fontSize: 86 * scale,
            fontWeight: 600,
            lineHeight: 1.06,
            letterSpacing: -2 * scale,
            backgroundImage: PROMO_ACCENT_GRADIENT,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          One sentence in.
          <br />
          The whole project out.
        </div>
        <div
          style={{
            marginTop: 26 * scale,
            fontSize: 30 * scale,
            color: PROMO_TEXT,
            opacity: 0.82,
          }}
        >
          Open source. Local-first. Your keys, at provider rates.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const HeroProject: React.FC = () => {
  useInterFont();
  return (
    <AbsoluteFill style={{ background: PROMO_BG }}>
      <Sequence from={0} durationInFrames={BRIEF_TO}>
        <BriefStage />
      </Sequence>

      <Sequence from={CHAT_FROM} durationInFrames={BOARD_FROM + DISSOLVE - CHAT_FROM}>
        <Settle>
          <ChatStage />
        </Settle>
        <HeroCaption
          claim="Describe the project."
          small="One sentence. The agent picks the shape and plans the documents."
          from={paced(16)}
          to={BOARD_FROM - CHAT_FROM}
        />
      </Sequence>

      <Sequence from={BOARD_FROM} durationInFrames={CUT_FROM + DISSOLVE - BOARD_FROM}>
        <Settle>
          <BoardStage />
        </Settle>
        <HeroCaption
          claim="Board it before you spend."
          small="A still for every shot — cheap frames first, video only on what works."
          from={paced(14)}
          to={RENDER_FROM - BOARD_FROM}
        />
        <HeroCaption
          claim="Then animate the stills."
          small="Each approved frame becomes a clip, on the model you picked."
          from={RENDER_FROM - BOARD_FROM + paced(4)}
          to={CUT_FROM - BOARD_FROM}
        />
      </Sequence>

      <Sequence from={CUT_FROM} durationInFrames={DELIVER_FROM + DISSOLVE - CUT_FROM}>
        <Settle>
          <CutStage />
        </Settle>
        <HeroCaption
          claim="Cut it on the timeline."
          small="Every clip keeps the shot it came from. Re-roll one, the cut updates."
          from={paced(14)}
          to={DELIVER_FROM - CUT_FROM}
        />
      </Sequence>

      <Sequence
        from={DELIVER_FROM}
        durationInFrames={HERO_DURATION_FRAMES - DELIVER_FROM}
      >
        <Settle from={1.02}>
          <DeliverStage />
        </Settle>
      </Sequence>

      <StageRail stages={STAGES} until={DELIVER_FROM} />
      <LoopFade totalFrames={HERO_DURATION_FRAMES} />
    </AbsoluteFill>
  );
};
