/**
 * Opening and closing the clip editor from the tracks surface.
 *
 * Double-clicking a midi clip is the DAW gesture for "show me the notes"; the
 * panel's Close button is the only way back on a desktop, so both are driven
 * through the real `TracksRegion` rather than by poking the UI store.
 */

import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import { DEFAULT_MIDI_INSTRUMENT, makeTrack } from "@nodetool-ai/timeline";
import type { TimelineClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import {
  TimelineProvider,
  createTimelineInstance,
  type TimelineInstance
} from "../../../../stores/timeline/TimelineInstance";
import { TracksRegion } from "../../Tracks/TracksRegion";
import { PianoRollPanel } from "../PianoRollPanel";

jest.mock("../../../../lib/rest-fetch", () => ({
  restFetch: jest.fn()
}));
jest.mock("../../preview/audition", () => ({
  playAuditionNote: jest.fn(() => Promise.resolve()),
  AUDITION_NOTE_MS: 600,
  AUDITION_DEFAULT_PITCH: 60
}));
jest.mock("../../Tracks/useClipThumbnails", () => ({
  useClipThumbnails: () => null
}));
jest.mock("../../Tracks/useAudioPeaks", () => ({
  useAudioPeaks: () => ({ peaks: null, durationMs: null })
}));

beforeAll(() => {
  HTMLElement.prototype.setPointerCapture = jest.fn();
  HTMLElement.prototype.releasePointerCapture = jest.fn();
});

const CLIP_ID = "clip-midi";

function seed(instance: TimelineInstance): void {
  const track = makeTrack({
    type: "midi",
    name: "Bass",
    instrument: DEFAULT_MIDI_INSTRUMENT
  });
  const clip: TimelineClip = {
    id: CLIP_ID,
    trackId: track.id,
    name: "Riff",
    startMs: 0,
    durationMs: 4000,
    inPointMs: 0,
    mediaType: "midi",
    sourceType: "imported",
    status: "generated",
    locked: false,
    versions: [],
    notes: [{ id: "n1", pitch: 60, velocity: 100, startTick: 0, durationTick: 480 }]
  };
  act(() => {
    instance.doc.setState({ tracks: [track], clips: [clip] });
  });
}

describe("opening the clip editor", () => {
  it("opens on a double-click and hides again from the close button", async () => {
    const user = userEvent.setup();
    const instance = createTimelineInstance();
    render(
      <ThemeProvider theme={mockTheme}>
        <TimelineProvider instance={instance}>
          <TracksRegion heightPx={400} />
          <PianoRollPanel />
        </TimelineProvider>
      </ThemeProvider>
    );
    seed(instance);

    expect(screen.queryByTestId("piano-roll-panel")).not.toBeInTheDocument();

    await user.dblClick(screen.getByTestId(`clip-${CLIP_ID}`));

    expect(screen.getByTestId("piano-roll-panel")).toBeInTheDocument();
    expect(instance.ui.getState().pianoRollClipId).toBe(CLIP_ID);

    await user.click(
      screen.getByRole("button", { name: "Close note editor" })
    );

    expect(screen.queryByTestId("piano-roll-panel")).not.toBeInTheDocument();
    expect(instance.ui.getState().pianoRollClipId).toBeNull();
  });
});
