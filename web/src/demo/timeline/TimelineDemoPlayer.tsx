/** @jsxImportSource @emotion/react */
/**
 * TimelineDemoPlayer — renders the real timeline editor UI (preview + tracks)
 * for a timeline cast at a given time. Sibling to `../DemoPlayer.tsx` (the
 * graph-editor player): a self-contained provider stack driving the
 * production components (`PreviewArea`, `TracksRegion`) as a pure function of
 * elapsed time via `TimelineDemoEngine`.
 *
 * Deliberately mounts only the preview + tracks surfaces, not the full
 * `TimelineEditor` page shell — that page also wires up autosave, generation
 * subscriptions, and tRPC-backed sequence loading, none of which apply to a
 * backend-free, hand-authored cast.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { ThemeProvider, CssBaseline } from "@mui/material";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import { MemoryRouter } from "react-router-dom";
import { TRPCProvider } from "../../trpc/Provider";

import "../../styles/vars.css";
import "../../styles/base.css";

import ThemeNodetool from "../../components/themes/ThemeNodetool";
import { TimelineProvider } from "../../stores/timeline/TimelineInstance";
import { PreviewArea } from "../../components/timeline/preview/PreviewArea";
import { TracksRegion } from "../../components/timeline/Tracks/TracksRegion";
import type { TimelineDemoCast } from "./timelineCastTypes";
import { TimelineDemoEngine } from "./timelineReplay";

const TRACKS_HEIGHT_PX = 320;

export interface TimelineDemoPlayerProps {
  cast: TimelineDemoCast;
  /** Elapsed time into the cast, in milliseconds. */
  timeMs: number;
  style?: React.CSSProperties;
}

function TimelineDemoSurface({
  engine,
  timeMs,
}: {
  engine: TimelineDemoEngine;
  timeMs: number;
}): React.JSX.Element {
  // Drive the replay synchronously before paint so each frame's DOM reflects
  // exactly the cast state at `timeMs`.
  useLayoutEffect(() => {
    engine.seekToTime(timeMs);
  }, [engine, timeMs]);

  const sequence = engine.instance.doc.getState();

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div style={{ flex: 1, minHeight: 0 }}>
        <PreviewArea
          fps={engine.fps}
          sequenceWidth={sequence.width}
          sequenceHeight={sequence.height}
        />
      </div>
      <TracksRegion heightPx={TRACKS_HEIGHT_PX} />
    </div>
  );
}

/** Self-contained timeline surface. `timeMs` may change every frame. */
export function TimelineDemoPlayer({
  cast,
  timeMs,
  style,
}: TimelineDemoPlayerProps): React.JSX.Element {
  const castRef = useRef(cast);
  castRef.current = cast;

  const engine = useMemo(
    () => new TimelineDemoEngine(castRef.current),
    // Rebuild only when the cast identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cast.id]
  );

  useEffect(() => () => engine.dispose(), [engine]);

  return (
    <MemoryRouter>
      <TRPCProvider>
        <ThemeProvider theme={ThemeNodetool} defaultMode="dark">
          <InitColorSchemeScript attribute="class" defaultMode="dark" />
          <CssBaseline />
          <div
            data-demo-player
            style={{ width: "100%", height: "100%", ...style }}
          >
            <TimelineProvider instance={engine.instance}>
              <TimelineDemoSurface engine={engine} timeMs={timeMs} />
            </TimelineProvider>
          </div>
        </ThemeProvider>
      </TRPCProvider>
    </MemoryRouter>
  );
}

export default TimelineDemoPlayer;
