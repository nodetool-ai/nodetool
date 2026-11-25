/**
 * Read-only timeline editor for the marketing site (web/timeline-embed.html).
 *
 * Mounts the production `PreviewArea` and `TracksRegion` in Simple mode over
 * one of the shipped example timelines, with no backend. A visitor can play,
 * scrub, zoom and select clips. Edits are restored at once by
 * `guardReadOnly`, and a note says the demo is read-only.
 *
 *   ?film=<slug>   one of EMBED_FILMS (default "kite")
 *
 * Built by `npm run build:timeline-embed` into
 * marketing/public/embed/timeline/, which the marketing site loads in an
 * iframe when the visitor asks for it.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import type { TimelineSequence } from "@nodetool-ai/timeline";

import "../../../styles/vars.css";
import "../../../styles/base.css";
import "../../../components/timeline/fonts.css";

import ThemeNodetool from "../../../components/themes/ThemeNodetool";
import { Caption, FlexColumn, LoadingSpinner, ThemeRoot } from "../../../components/ui_primitives";
import { TRPCProvider } from "../../../trpc/Provider";
import TranslationProvider from "../../../contexts/TranslationProvider";
import {
  createTimelineInstance,
  TimelineProvider,
  type TimelineInstance
} from "../../../stores/timeline/TimelineInstance";
import { TimelineSimpleModeContext } from "../../../stores/timeline/TimelineEditorMode";
import { PreviewArea } from "../../../components/timeline/preview/PreviewArea";
import { TracksRegion } from "../../../components/timeline/Tracks/TracksRegion";
import { ensureBundledFontsLoaded } from "../../../components/timeline/preview/fontLoading";
import { guardReadOnly } from "./readOnlyGuard";

interface ExampleBundle {
  name: string;
  fps: number;
  width: number;
  height: number;
  durationMs: number;
  document: Pick<TimelineSequence, "tracks" | "clips" | "markers"> &
    Partial<Pick<TimelineSequence, "camera2d" | "source">>;
}

/** Example timelines made only of shapes, text and effects: no media to fetch. */
const EMBED_FILMS: Record<string, () => Promise<{ default: unknown }>> = {
  kite: () => import("../../../../../packages/base-nodes/nodetool/examples/timelines/kite.timeline.json"),
  serein: () => import("../../../../../packages/base-nodes/nodetool/examples/timelines/serein.timeline.json"),
  cadence: () => import("../../../../../packages/base-nodes/nodetool/examples/timelines/cadence.timeline.json")
};

/** Where the playhead starts: a full frame, not the fade in from black. */
const START_MS: Record<string, number> = { kite: 6300, serein: 11000, cadence: 8000 };

/** Tracks take this share of the frame, within the bounds below. */
const TRACKS_SHARE = 0.42;
const MIN_TRACKS_PX = 150;
const MAX_TRACKS_PX = 320;
const NOTE_VISIBLE_MS = 2600;

function toSequence(slug: string, bundle: ExampleBundle): TimelineSequence {
  const { document } = bundle;
  return {
    id: `embed-${slug}`,
    projectId: "embed",
    name: bundle.name,
    fps: bundle.fps,
    width: bundle.width,
    height: bundle.height,
    durationMs: bundle.durationMs,
    tracks: document.tracks,
    clips: document.clips,
    markers: document.markers,
    camera2d: document.camera2d ?? null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function useViewportHeight(): number {
  const [height, setHeight] = useState(() => window.innerHeight);
  useEffect(() => {
    const onResize = (): void => setHeight(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return height;
}

function Embed({ instance }: { instance: TimelineInstance }): React.JSX.Element {
  const viewportHeight = useViewportHeight();
  const [noteShown, setNoteShown] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);
  const { fps, width, height } = instance.doc.getState();

  const showNote = useCallback(() => {
    setNoteShown(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setNoteShown(false), NOTE_VISIBLE_MS);
  }, []);

  useEffect(() => {
    void ensureBundledFontsLoaded();
    const stop = guardReadOnly(instance.doc, showNote);
    return () => {
      stop();
      window.clearTimeout(hideTimer.current);
    };
  }, [instance, showNote]);

  const tracksHeight = Math.round(
    Math.min(MAX_TRACKS_PX, Math.max(MIN_TRACKS_PX, viewportHeight * TRACKS_SHARE))
  );

  return (
    <TimelineSimpleModeContext.Provider value={true}>
      <TimelineProvider instance={instance}>
        <FlexColumn fullWidth fullHeight sx={{ overflow: "hidden", position: "relative" }}>
          <FlexColumn sx={{ flex: "1 1 0", minHeight: 0 }}>
            <PreviewArea fps={fps} sequenceWidth={width} sequenceHeight={height} />
          </FlexColumn>
          <TracksRegion heightPx={tracksHeight} />
          <FlexColumn
            role="status"
            aria-live="polite"
            sx={{
              position: "absolute",
              left: "50%",
              top: (theme) => theme.spacing(2),
              transform: "translateX(-50%)",
              pointerEvents: "none",
              opacity: noteShown ? 1 : 0,
              transition: (theme) => theme.transitions.create("opacity"),
              bgcolor: "background.paper",
              border: 1,
              borderColor: "divider",
              borderRadius: 1,
              px: 2,
              py: 1
            }}
          >
            {noteShown ? <Caption>This demo is read-only. Edit for real in NodeTool.</Caption> : null}
          </FlexColumn>
        </FlexColumn>
      </TimelineProvider>
    </TimelineSimpleModeContext.Provider>
  );
}

function App(): React.JSX.Element {
  const [instance, setInstance] = useState<TimelineInstance | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("film") ?? "kite";
    const slug = requested in EMBED_FILMS ? requested : "kite";
    EMBED_FILMS[slug]()
      .then((module) => {
        const created = createTimelineInstance();
        created.doc.getState().loadSequence(toSequence(slug, module.default as ExampleBundle));
        created.playback.getState().seek(START_MS[slug] ?? 0);
        setInstance(created);
      })
      .catch(() => setFailed(true));
  }, []);

  return (
    <MemoryRouter>
      <TranslationProvider>
        <TRPCProvider>
          <ThemeRoot theme={ThemeNodetool}>
            {instance ? (
              <Embed instance={instance} />
            ) : (
              <FlexColumn fullWidth fullHeight align="center" justify="center">
                {failed ? <Caption>The timeline couldn&apos;t load. Reload the page to try again.</Caption> : <LoadingSpinner />}
              </FlexColumn>
            )}
          </ThemeRoot>
        </TRPCProvider>
      </TranslationProvider>
    </MemoryRouter>
  );
}

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(<App />);
}
