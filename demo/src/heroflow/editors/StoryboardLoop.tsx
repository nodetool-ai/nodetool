/**
 * Storyboard: the last two stills land, the reader approves four of the
 * five, and only the approved shots are animated.
 */
import React from "react";
import { Loop, OffthreadVideo, Sequence } from "remotion";

import { FPS, clipFrames, expoOut, span } from "../clock";
import { BEATS } from "../data";
import { StoryboardStep } from "../steps";
import { C, R, heroAsset } from "../theme";
import { Icon, type AgentStatus, type ShotState } from "../ui";
import { EditorStage, Pointer, useBoxes, useStageRef, useT } from "./common";

/** Still renders still running when the loop opens: shot, start, end. */
const STILLS: Record<number, readonly [number, number]> = {
  3: [-0.6, 0.9],
  4: [-0.3, 1.3]
};
const APPROVE: Record<number, number> = { 0: 1.75, 1: 2.1, 2: 2.45, 4: 2.85 };
const ANIMATE_AT = 3.25;
const CLIP_RENDER = 1.15;
const clipStart = (i: number): number => ANIMATE_AT + 0.1 + i * 0.12;

const shotState = (t: number, i: number): [ShotState, number, number] => {
  const still = STILLS[i];
  let reveal = 1;
  if (still) {
    const [a, b] = still;
    if (t < b) {
      return ["still-rendering", span(t, a, b), 0];
    }
    reveal = expoOut(span(t, b, b + 0.4));
  }
  if (APPROVE[i] === undefined || t < clipStart(i)) {
    return ["still", 0, reveal];
  }
  if (t < clipStart(i) + CLIP_RENDER) {
    return [
      "clip-rendering",
      span(t, clipStart(i), clipStart(i) + CLIP_RENDER),
      1
    ];
  }
  return ["clip", 1, 1];
};

export const StoryboardLoop: React.FC = () => {
  const t = useT();
  const stageRef = useStageRef();
  const boxes = useBoxes(stageRef);
  const shots = BEATS.map((_, i) => shotState(t, i));
  const approved = BEATS.map(
    (_, i) => APPROVE[i] !== undefined && t >= APPROVE[i]
  );
  const clips = shots.filter(([s]) => s === "clip").length;
  const agent: AgentStatus | null =
    t < ANIMATE_AT
      ? null
      : clips < 4
        ? { text: `Animating approved shots · ${clips} of 4` }
        : { text: "4 clips ready", done: true };
  const pressed = span(t, ANIMATE_AT - 0.05, ANIMATE_AT + 0.25);
  return (
    <EditorStage
      scale={1.09}
      agent={agent}
      stageRef={stageRef}
      overlay={
        <Pointer
          t={t}
          boxes={boxes}
          visible={[1.0, 4.3]}
          path={[
            { t: 1.0, at: [1500, 1000] },
            { t: 1.75, at: "approve-0", click: true },
            { t: 2.1, at: "approve-1", click: true },
            { t: 2.45, at: "approve-2", click: true },
            { t: 2.85, at: "approve-4", click: true },
            { t: ANIMATE_AT, at: "animate", click: true },
            { t: 4.3, at: [1700, 420] }
          ]}
        />
      }
    >
      <StoryboardStep
        states={shots.map(([s]) => s)}
        progress={shots.map(([, p]) => p)}
        reveal={shots.map(([, , r]) => r)}
        approved={approved}
        action={
          <div
            data-hf="animate"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 14px",
              borderRadius: R.pill,
              fontSize: 15,
              fontWeight: 600,
              color: C.text,
              background:
                pressed > 0 && pressed < 1 ? `${C.video}66` : `${C.video}33`,
              border: `1px solid ${C.video}88`
            }}
          >
            <Icon name="film" size={17} color={C.text} />
            Animate approved
          </div>
        }
        video={(i) =>
          shots[i][0] === "clip" ? (
            <Sequence from={Math.round((clipStart(i) + CLIP_RENDER) * FPS)}>
              <Loop durationInFrames={clipFrames(i)}>
                <OffthreadVideo
                  src={heroAsset(BEATS[i].clip)}
                  muted
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </Loop>
            </Sequence>
          ) : null
        }
      />
    </EditorStage>
  );
};
