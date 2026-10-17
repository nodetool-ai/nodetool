/**
 * DAW lab page (web/daw-lab.html): mounts timeline DAW views over a fixture
 * song with no backend, for visual checks and headless audio bounces.
 *
 *   ?view=<name>   one of LAB_VIEWS (default "tracks")
 *
 * `window.dawLab.bounce()` renders the fixture through the export path and
 * resolves to per-channel RMS and peak, so a driver can check a device sounds.
 */
import React, { useMemo } from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

import "../../../../styles/vars.css";
import "../../../../styles/base.css";

import ThemeNodetool from "../../../themes/ThemeNodetool";
import { ThemeRoot } from "../../../ui_primitives";
import { TRPCProvider } from "../../../../trpc/Provider";
import {
  createTimelineInstance,
  TimelineProvider,
  type TimelineInstance
} from "../../../../stores/timeline/TimelineInstance";
import { renderTimelineAudio } from "../../render/renderAudio";
import { labDocument } from "./labDocument";
import { LAB_VIEWS } from "./labViews";

interface BounceStats {
  channels: Array<{ rms: number; peak: number }>;
  durationSec: number;
}

declare global {
  interface Window {
    dawLab?: {
      instance: TimelineInstance;
      bounce: (durationMs?: number) => Promise<BounceStats | null>;
    };
  }
}

function stats(buffer: AudioBuffer): BounceStats {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => {
    const data = buffer.getChannelData(c);
    let sum = 0;
    let peak = 0;
    for (const v of data) {
      sum += v * v;
      peak = Math.max(peak, Math.abs(v));
    }
    return { rms: Math.sqrt(sum / Math.max(1, data.length)), peak };
  });
  return { channels, durationSec: buffer.duration };
}

function Lab(): React.JSX.Element {
  const instance = useMemo(() => {
    const created = createTimelineInstance();
    created.doc.getState().loadSequence(labDocument());
    return created;
  }, []);
  const viewName = new URLSearchParams(window.location.search).get("view") ?? "tracks";
  const view = LAB_VIEWS[viewName] ?? LAB_VIEWS.tracks;

  window.dawLab = {
    instance,
    bounce: async (durationMs) => {
      const doc = instance.doc.getState();
      const buffer = await renderTimelineAudio({
        clips: doc.clips,
        tracks: doc.tracks,
        tempo: doc.tempo,
        durationMs: durationMs ?? doc.durationMs,
        resolveUrl: async () => undefined
      });
      return buffer ? stats(buffer) : null;
    }
  };

  return (
    <MemoryRouter>
      <TRPCProvider>
        <ThemeRoot theme={ThemeNodetool}>
          <TimelineProvider instance={instance}>
            <div data-daw-lab={viewName} style={{ width: "100vw", height: "100vh" }}>
              {view.render()}
            </div>
          </TimelineProvider>
        </ThemeRoot>
      </TRPCProvider>
    </MemoryRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Lab />);
