import React from "react";
import { Composition, registerRoot, useCurrentFrame, useVideoConfig } from "remotion";
import { FocusCamera } from "../components/FocusCamera";
import { GraphFocusCamera } from "../components/GraphFocusCamera";
import type { TutorialShot } from "../types";

const validShots: readonly TutorialShot[] = [
  { id: "wide", fromMs: 0, toMs: 1000, target: { kind: "overview" }, moveMs: 0 },
  {
    id: "card",
    fromMs: 1000,
    toMs: 2000,
    target: { kind: "component", focusId: "card" },
    moveMs: 200,
    emphasis: "outline-dim",
  },
];

interface FixtureProps {
  invalid?: boolean;
}

const Fixture: React.FC<FixtureProps> = ({ invalid = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // The last sequential step seeks backward from 1900 to 1500 ms.
  const timeMs = frame === 44 ? 1900 : frame / fps * 1000;
  const shots = invalid
    ? [{ ...validShots[1], target: { kind: "component", focusId: "missing" } as const }]
    : validShots;
  return (
    <FocusCamera tutorialId="focus-browser-fixture" shots={shots} presentationTimeMs={timeMs}>
      {(presentationTimeMs) => (
        <div style={{ width: 1920, height: 1080, background: "#10131a", color: "white" }}>
          <div
            data-focus-id="card"
            style={{ position: "absolute", left: 600, top: 300, width: 360, height: 120 + presentationTimeMs / 20, background: "#345" }}
          >
            anchor {presentationTimeMs}
          </div>
        </div>
      )}
    </FocusCamera>
  );
};

const graphShots: readonly TutorialShot[] = [
  { id: "graph-wide", fromMs: 0, toMs: 1000, target: { kind: "overview" }, moveMs: 0 },
  { id: "graph-node", fromMs: 1000, toMs: 2000, target: { kind: "node", nodeId: "growing" }, moveMs: 200, anchorMs: 1500, emphasis: "outline-dim" },
];

const GraphFixture: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeMs = frame === 44 ? 1900 : frame / fps * 1000;
  return (
    <GraphFocusCamera
      tutorialId="graph-focus-browser-fixture"
      shots={graphShots}
      presentationTimeMs={timeMs}
      overviewViewport={{ x: 120, y: 80, zoom: 1.2 }}
    >
      {(castTimeMs, viewport) => (
        <div style={{ width: 1920, height: 1080, overflow: "hidden", background: "#10131a" }}>
          <div style={{ transformOrigin: "0 0", transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}>
            <div
              className="react-flow__node"
              data-id="growing"
              style={{ position: "absolute", left: 400, top: 220, width: 320, padding: 16, color: "white", background: "#345" }}
            >
              <img
                alt="fixture"
                src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180'%3E%3Crect width='320' height='180' fill='%23567'/%3E%3C/svg%3E"
                style={{ display: "block", width: "100%", height: "auto" }}
              />
              graph anchor {castTimeMs}
            </div>
          </div>
        </div>
      )}
    </GraphFocusCamera>
  );
};

const Root: React.FC = () => (
  <>
    <Composition
      id="FocusCameraFixture"
      component={Fixture}
      durationInFrames={60}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ invalid: false }}
    />
    <Composition
      id="GraphFocusCameraFixture"
      component={GraphFixture}
      durationInFrames={60}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
);

registerRoot(Root);
