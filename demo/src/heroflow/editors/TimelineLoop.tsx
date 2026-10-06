/**
 * Timeline: the reader asks to tighten the opening, and the agent trims the
 * first shot and ripples the rest of the cut, dialogue included, while the
 * film keeps playing.
 */
import React from "react";
import { OffthreadVideo } from "remotion";

import { FPS, expoOut, inOut, span } from "../clock";
import { BEATS, FILM, TOTAL_SECONDS, shotLength, shotStart } from "../data";
import { TimelineStep, type ClipSpan } from "../steps";
import { C, R, heroAsset } from "../theme";
import { Icon, type AgentStatus } from "../ui";
import { EditorStage, useBoxes, useStageRef, useT } from "./common";

const FILM_FROM = 4.6;
const TRIM: readonly [number, number] = [0.8, 1.9];
const RIPPLE: readonly [number, number] = [2.0, 2.7];
const CUT = 1.07;

export const TimelineLoop: React.FC = () => {
  const t = useT();
  const stageRef = useStageRef();
  const boxes = useBoxes(stageRef);
  const trimmed = inOut(span(t, TRIM[0], TRIM[1])) * CUT;
  const shift = inOut(span(t, RIPPLE[0], RIPPLE[1])) * CUT;
  const layout: ClipSpan[] = BEATS.map((_, i) =>
    i === 0
      ? { start: 0, length: shotLength(0) - trimmed }
      : { start: shotStart(i) - shift, length: shotLength(i) }
  );
  const film = FILM_FROM + t;
  const agent: AgentStatus | null =
    t < 0.45
      ? null
      : t < RIPPLE[1] + 0.1
        ? { text: "Trimming the opening" }
        : {
            text: `Opening tightened · ${(TOTAL_SECONDS - CUT).toFixed(1)} s`,
            done: true
          };
  const monitor = boxes?.["tl-monitor"];
  const bubble = expoOut(span(t, 0.05, 0.45));
  return (
    <EditorStage
      scale={1.04}
      agent={agent}
      stageRef={stageRef}
      overlay={
        monitor ? (
          <div
            style={{
              position: "absolute",
              left: monitor.x + monitor.w + 28,
              top: monitor.y + 18,
              opacity: bubble,
              transform: `translateY(${(1 - bubble) * 16}px)`,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              maxWidth: 300
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                color: C.dim
              }}
            >
              You
            </div>
            <div
              style={{
                padding: "14px 18px",
                borderRadius: `${R.lg}px ${R.lg}px ${R.lg}px 4px`,
                background: C.overlay,
                border: `1px solid ${C.lineStrong}`,
                fontSize: 24,
                fontWeight: 500,
                lineHeight: 1.3,
                color: C.text
              }}
            >
              Tighten the opening.
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 16,
                color: C.dim,
                opacity: span(t, RIPPLE[1], RIPPLE[1] + 0.3)
              }}
            >
              <Icon name="cut" size={16} color={C.warning} />
              Shot 1 −{CUT.toFixed(1)} s, rest rippled
            </div>
          </div>
        ) : null
      }
    >
      <TimelineStep
        playhead={film - (film > shotLength(0) ? shift : 0)}
        layout={layout}
        trim={{
          index: 0,
          amount:
            span(t, TRIM[0] - 0.2, TRIM[0]) *
            (1 - span(t, RIPPLE[1], RIPPLE[1] + 0.3))
        }}
        voice
        total={TOTAL_SECONDS - shift}
        monitor={
          <OffthreadVideo
            src={heroAsset(FILM)}
            muted
            trimBefore={Math.round(FILM_FROM * FPS)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        }
      />
    </EditorStage>
  );
};
