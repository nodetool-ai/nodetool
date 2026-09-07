/**
 * The instrument picker on a midi track header.
 *
 * The audition is mocked: jsdom has no Web Audio, and what matters here is
 * that picking a voice writes the track and that the editor panel opens on the
 * Edit toggle — the sound itself is `preview/audition.ts`'s own test.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import { findInstrumentPreset } from "@nodetool-ai/timeline";
import type { MidiInstrument } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { TracksRegion } from "../TracksRegion";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";

jest.mock("../../preview/audition", () => ({
  playAuditionNote: jest.fn(async () => undefined),
  AUDITION_NOTE_MS: 600,
  AUDITION_DEFAULT_PITCH: 60
}));

import { playAuditionNote } from "../../preview/audition";

const renderRegion = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider>
        <TracksRegion heightPx={400} />
      </TimelineProvider>
    </ThemeProvider>
  );

/** The header's preset select — the toolbar has a combobox of its own. */
const presetSelect = () =>
  screen.getByRole("combobox", { name: /instrument for bass/i });

/** The waveform of a voice, when the voice is the built-in synth. */
const waveformOf = (instrument: MidiInstrument | undefined) =>
  instrument?.type === "subtractive" ? instrument.waveform : undefined;

function seedMidiTrack(): string {
  act(() => {
    const s = useTimelineStore.getState();
    s.reset();
    s.addTrack("midi", "Bass");
  });
  return useTimelineStore.getState().tracks[0].id;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("TrackHeader — midi instrument", () => {
  it("names the preset the track's voice matches", () => {
    renderRegion();
    seedMidiTrack();

    // A new midi track gets DEFAULT_MIDI_INSTRUMENT, which is the saw lead.
    expect(presetSelect()).toHaveTextContent("Saw Lead");
  });

  it("writes the picked preset's instrument onto the track", async () => {
    const user = userEvent.setup();
    renderRegion();
    const trackId = seedMidiTrack();

    await user.click(presetSelect());
    await user.click(await screen.findByRole("option", { name: "Soft Pad" }));

    const track = useTimelineStore
      .getState()
      .tracks.find((t) => t.id === trackId);
    expect(track?.instrument).toEqual(findInstrumentPreset("soft-pad")?.instrument);
  });

  it("reads Custom once the voice has been edited by hand", () => {
    renderRegion();
    const trackId = seedMidiTrack();

    act(() => {
      useTimelineStore.getState().setTrackInstrument(trackId, {
        type: "subtractive",
        waveform: "sine",
        attackMs: 7,
        decayMs: 7,
        sustain: 0.3,
        releaseMs: 7,
        cutoffHz: 900,
        resonance: 3,
        gainDb: -2
      });
    });

    expect(presetSelect()).toHaveTextContent("Custom");
  });

  it("edits a FableSynth voice with its own controls", async () => {
    const user = userEvent.setup();
    renderRegion();
    const trackId = seedMidiTrack();

    await user.click(presetSelect());
    await user.click(await screen.findByRole("option", { name: "BL-1 Acid" }));
    await user.click(screen.getByTestId(`track-instrument-${trackId}`));

    // BL-1 is not the built-in synth, so the panel offers its filter and level
    // rather than a waveform.
    expect(
      screen.queryByRole("combobox", { name: /waveform/i })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Drive" })).toBeInTheDocument();
    expect(
      screen.getByText(/BL-1 — a monophonic acid line/)
    ).toBeInTheDocument();
  });

  it("names the DR-1 kit's pads in the editor", async () => {
    const user = userEvent.setup();
    renderRegion();
    const trackId = seedMidiTrack();

    await user.click(presetSelect());
    await user.click(
      await screen.findByRole("option", { name: "DR-1 TR-Void Kit" })
    );
    await user.click(screen.getByTestId(`track-instrument-${trackId}`));

    // A kit has no cutoff of its own — each pad carries its own filter.
    expect(
      screen.queryByRole("slider", { name: "Cutoff" })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Pads from MIDI 36: Kick,/)).toBeInTheDocument();
  });

  it("opens the instrument editor from the Edit toggle", async () => {
    const user = userEvent.setup();
    renderRegion();
    const trackId = seedMidiTrack();

    expect(
      screen.queryByTestId(`track-instrument-panel-${trackId}`)
    ).not.toBeInTheDocument();

    await user.click(screen.getByTestId(`track-instrument-${trackId}`));

    expect(
      screen.getByTestId(`track-instrument-panel-${trackId}`)
    ).toBeInTheDocument();
    expect(playAuditionNote).not.toHaveBeenCalled();
  });

  it("auditions the new voice when the waveform changes", async () => {
    const user = userEvent.setup();
    renderRegion();
    const trackId = seedMidiTrack();

    await user.click(screen.getByTestId(`track-instrument-${trackId}`));
    const waveform = screen.getByRole("combobox", { name: /waveform/i });
    await user.click(waveform);
    await user.click(await screen.findByRole("option", { name: "Square" }));

    expect(
      waveformOf(
        useTimelineStore.getState().tracks.find((t) => t.id === trackId)
          ?.instrument
      )
    ).toBe("square");
    // Debounced: the note is scheduled, not played on the keystroke.
    await screen.findByTestId(`track-instrument-panel-${trackId}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(playAuditionNote).toHaveBeenCalledTimes(1);
  });
});
