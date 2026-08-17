/** @jsxImportSource @emotion/react */
/**
 * TimelineDemoPlayer — renders the real timeline editor UI for a timeline cast
 * at a given time. Sibling to `../DemoPlayer.tsx` (the graph-editor player): a
 * self-contained provider stack driving the production components as a pure
 * function of elapsed time via `TimelineDemoEngine`.
 *
 * With `chrome` (the default) the layout is the editor's own — `TopBar` above,
 * `PreviewArea` beside `TimelineInspector`, `TracksRegion`, then
 * `BottomStatusBar` — so a tutorial shows the editor a viewer will open, not a
 * preview pane floating on its own. The inspector fills in from the cast's
 * `select` events: the clip the cast selects is the clip whose trim, adjustments,
 * and animations the panel shows. A cinematic composition that supplies its own
 * chrome (the promo) passes `chrome={false}` for the bare surface.
 *
 * The chrome is read-only like the rest of a replay: `TopBar`'s actions are
 * no-ops, present because a tutorial should show where Save and Export live.
 * The page shell around it is still deliberately absent — autosave, generation
 * subscriptions, and tRPC-backed sequence loading have nothing to do in a
 * backend-free, hand-authored cast.
 */
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import {
  DemoInspectorPane,
  DemoStatusBar,
  DemoTopBar
} from "./timelineChrome";
import type { TimelineDemoCast } from "./timelineCastTypes";
import { TimelineDemoEngine } from "./timelineReplay";
import {
  useMediaReadiness,
  type PendingMediaHandler,
} from "../mediaReadiness";

const TRACKS_HEIGHT_PX = 320;

/**
 * Force the preview compositor onto its Canvas2D backend for replays.
 * Headless render browsers can expose a software WebGPU adapter whose
 * swapchain never reaches the screenshotter — the monitor captures black
 * while everything else renders. Canvas2D pixels are captured reliably and
 * identically. Instance-scoped shadowing (not module-scoped) so importing
 * this file never affects the real app; only mounting the player does.
 */
function disableWebGpuForReplay(): void {
  try {
    Object.defineProperty(navigator, "gpu", {
      value: undefined,
      configurable: true,
    });
  } catch {
    // Navigator refuses the shadow — the compositor keeps its WebGPU path.
  }
}

export interface TimelineDemoPlayerProps {
  cast: TimelineDemoCast;
  /** Elapsed time into the cast, in milliseconds. */
  timeMs: number;
  /** Maps a pinned asset's `file` name to a host URL (casts with file-backed assets). */
  resolveAssetUrl?: (file: string) => string;
  /** Pixel height of the tracks region. Default 320. */
  tracksHeightPx?: number;
  /** Mount the editor chrome (top bar, inspector, status bar). Default true. */
  chrome?: boolean;
  /** Called with a promise per not-yet-decoded video so a frame renderer can
   *  block the capture until media is paintable (see ../mediaReadiness.ts). */
  onPendingMedia?: PendingMediaHandler;
  style?: React.CSSProperties;
}

function TimelineDemoSurface({
  engine,
  timeMs,
  tracksHeightPx,
  chrome,
}: {
  engine: TimelineDemoEngine;
  timeMs: number;
  tracksHeightPx: number;
  chrome: boolean;
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
      {chrome && <DemoTopBar />}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <PreviewArea
            fps={engine.fps}
            sequenceWidth={sequence.width}
            sequenceHeight={sequence.height}
          />
        </div>
        {chrome && <DemoInspectorPane />}
      </div>
      <TracksRegion heightPx={tracksHeightPx} />
      {chrome && <DemoStatusBar />}
    </div>
  );
}

/** Self-contained timeline surface. `timeMs` may change every frame. */
export function TimelineDemoPlayer({
  cast,
  timeMs,
  resolveAssetUrl,
  tracksHeightPx = TRACKS_HEIGHT_PX,
  chrome = true,
  onPendingMedia,
  style,
}: TimelineDemoPlayerProps): React.JSX.Element {
  const castRef = useRef(cast);
  castRef.current = cast;
  const resolveRef = useRef(resolveAssetUrl);
  resolveRef.current = resolveAssetUrl;
  const rootRef = useRef<HTMLDivElement>(null);
  useMediaReadiness(rootRef, timeMs, onPendingMedia);
  // Before the compositor mounts (state initializers run during the first
  // render, effects after), pin it to the deterministic Canvas2D backend.
  useState(() => disableWebGpuForReplay());

  const engine = useMemo(
    () =>
      new TimelineDemoEngine(castRef.current, {
        resolveAssetUrl: resolveRef.current,
      }),
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
            ref={rootRef}
            data-demo-player
            style={{ width: "100%", height: "100%", ...style }}
          >
            <TimelineProvider instance={engine.instance}>
              <TimelineDemoSurface
                engine={engine}
                timeMs={timeMs}
                tracksHeightPx={tracksHeightPx}
                chrome={chrome}
              />
            </TimelineProvider>
          </div>
        </ThemeProvider>
      </TRPCProvider>
    </MemoryRouter>
  );
}

export default TimelineDemoPlayer;
