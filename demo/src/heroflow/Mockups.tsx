/**
 * Static design frames for the hero flow, one per step plus an overview.
 * They fix layout, copy and the hand-off between steps before any motion
 * is written. Review in `npm run studio:heroflow`, export with
 * `npm run still:heroflow`.
 */
import React from "react";
import { AbsoluteFill } from "remotion";

import { useInterFont } from "../promo/fonts";
import {
  BeatSheetStep,
  ComposerStep,
  EntitiesStep,
  StoryboardStep,
  TimelineStep
} from "./steps";
import { C, FONT, MONO, R } from "./theme";
import {
  AgentLine,
  AgentStatusContext,
  Stage,
  StepRail,
  type AgentStatus
} from "./ui";

export type Mockup = {
  id: string;
  step: number;
  title: string;
  agent?: AgentStatus;
  /**
   * Scales the surface up to fill the frame. Each surface is laid out at its
   * natural size; this is the largest factor that keeps a 40 px margin.
   */
  scale: number;
  /** How this frame hands off to the next one. */
  handoff: string;
  render: () => React.ReactNode;
};

export const MOCKUPS: Mockup[] = [
  {
    id: "1-prompt",
    step: 0,
    title: "Prompt",
    scale: 1.25,
    handoff: "Send. The composer opens into the beat sheet.",
    render: () => <ComposerStep />
  },
  {
    id: "2-beats",
    step: 1,
    title: "Beat sheet",
    scale: 1.2,
    agent: {
      text: "5 beats written",
      done: true
    },
    handoff:
      "The mention chips detach from the lines and fly down. Each one opens into an empty entity card.",
    render: () => <BeatSheetStep />
  },
  {
    id: "3-entities",
    step: 2,
    title: "Entities",
    scale: 1,
    agent: {
      text: "Rendering references · 4 of 6"
    },
    handoff:
      "The cards shrink to dot chips and drop into the shot cards that use them. Beat lines become shot actions.",
    render: () => (
      <EntitiesStep states={{ bedroom: "rendering", style: "empty" }} />
    )
  },
  {
    id: "4a-stills",
    step: 3,
    title: "Storyboard · stills",
    scale: 1.09,
    agent: { text: "Rendering stills · 3 of 5" },
    handoff:
      "Stills land left to right in beat order. When the last one lands, the clip pass starts on shot 1.",
    render: () => (
      <StoryboardStep
        states={["still", "still", "still", "still-rendering", "queued"]}
      />
    )
  },
  {
    id: "4b-clips",
    step: 3,
    title: "Storyboard · clips",
    scale: 1.09,
    agent: { text: "Animating clips · 3 of 5" },
    handoff:
      "Each card collapses into a clip and slides down onto V1 in order. The beat strip becomes the ruler.",
    render: () => (
      <StoryboardStep
        states={["clip", "clip", "clip", "clip-rendering", "still"]}
        progress={0.4}
      />
    )
  },
  {
    id: "5-timeline",
    step: 4,
    title: "Timeline",
    scale: 1.04,
    agent: {
      text: "Cut assembled · 15.0 s",
      done: true
    },
    handoff:
      "The playhead runs the cut. The monitor grows to full frame and ends on the title.",
    render: () => <TimelineStep />
  }
];

/**
 * One step's picture: the surface scaled to fill the frame, the agent's
 * status in its header. `chrome` adds the step rail and agent line, for a
 * tutorial cut; the landing page hero runs without them.
 */
const FrameBody: React.FC<{ mockup: Mockup; chrome?: boolean }> = ({
  mockup: m,
  chrome = false
}) => (
  <Stage>
    <AgentStatusContext.Provider value={chrome ? null : (m.agent ?? null)}>
      <AbsoluteFill style={{ transform: `scale(${chrome ? 1 : m.scale})` }}>
        {m.render()}
      </AbsoluteFill>
    </AgentStatusContext.Provider>
    {chrome ? <StepRail active={m.step} /> : null}
    {chrome && m.agent ? (
      <AgentLine text={m.agent.text} done={m.agent.done} />
    ) : null}
  </Stage>
);

export const MockupFrame: React.FC<{ id: string; chrome?: boolean }> = ({
  id,
  chrome = false
}) => {
  useInterFont();
  const m = MOCKUPS.find((x) => x.id === id) ?? MOCKUPS[0];
  return <FrameBody mockup={m} chrome={chrome} />;
};

/** All frames in reading order, each with its hand-off note. */
export const MockupOverview: React.FC = () => {
  useInterFont();
  const scale = 0.29;
  const w = 1920 * scale;
  const h = 1080 * scale;
  return (
    <AbsoluteFill
      style={{
        background: C.stage,
        fontFamily: FONT,
        color: C.text,
        padding: "56px 70px"
      }}
    >
      <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1 }}>
        Hero flow · design frames
      </div>
      <div style={{ fontSize: 19, color: C.dim, marginTop: 6 }}>
        Prompt → beat sheet → entities → storyboard (stills, clips) → timeline
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(3, ${w}px)`,
          columnGap: 34,
          rowGap: 26,
          marginTop: 34
        }}
      >
        {MOCKUPS.map((m, i) => (
          <div key={m.id}>
            <div
              style={{
                width: w,
                height: h,
                borderRadius: R.md,
                overflow: "hidden",
                border: `1px solid ${C.line}`,
                position: "relative"
              }}
            >
              <div
                style={{
                  width: 1920,
                  height: 1080,
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                  position: "relative"
                }}
              >
                <FrameBody mockup={m} />
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "baseline",
                marginTop: 12
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 15, color: C.dim }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span style={{ fontSize: 19, fontWeight: 600 }}>{m.title}</span>
            </div>
            <div
              style={{
                fontSize: 15,
                lineHeight: 1.4,
                color: C.dim,
                marginTop: 4,
                width: w
              }}
            >
              → {m.handoff}
            </div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
