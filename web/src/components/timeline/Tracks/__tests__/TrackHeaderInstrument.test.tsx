/**
 * The instrument picker on a midi track header.
 *
 * The audition is mocked: jsdom has no Web Audio, and what matters here is
 * that picking a voice writes the track and that the editor panel opens on the
 * Edit toggle — the sound itself is `preview/audition.ts`'s own test.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import { findInstrumentPreset } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { TimelineInstrumentsPanel } from "../../TimelineInstrumentsPanel";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";
import { TracksRegion } from "../TracksRegion";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { maxTrackHeaderWidthForViewport } from "../../../../stores/timeline/TimelineUIStore";

jest.mock("../../preview/audition", () => ({
  playAuditionNote: jest.fn(async () => undefined),
  AUDITION_NOTE_MS: 600,
  AUDITION_DEFAULT_PITCH: 60
}));

import { playAuditionNote } from "../../preview/audition";

function InstrumentDock() {
  const tab = useTimelineUIStore(s => s.panelTab);
  return tab === "instrument" ? <aside data-testid="instrument-dock"><TimelineInstrumentsPanel /></aside> : null;
}
const renderRegion = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider>
        <TracksRegion heightPx={400} /><InstrumentDock />
      </TimelineProvider>
    </ThemeProvider>
  );

/** The header's preset select — the toolbar has a combobox of its own. */
const presetSelect = () =>
  screen.getByRole("combobox", { name: /instrument for bass/i });

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
  useTimelineUIStore.setState({panelTab: "inspector", expandedInstrumentTrackId: null, instrumentKeyboards: {}});
});

describe("TrackHeader — midi instrument", () => {
  it("reserves lane space when calculating the maximum header width", () => {
    expect(maxTrackHeaderWidthForViewport(600)).toBe(360);
    expect(maxTrackHeaderWidthForViewport(1200)).toBe(480);
    expect(maxTrackHeaderWidthForViewport(300)).toBe(160);
  });

  it("resizes the track-header column with the keyboard", async () => {
    const user = userEvent.setup();
    renderRegion();

    const region = screen.getByTestId("tracks-region");
    const separator = screen.getByRole("separator", {
      name: "Resize track headers"
    });
    expect(separator).toHaveAttribute("aria-orientation", "vertical");
    expect(separator).toHaveAttribute("aria-valuenow", "320");

    separator.focus();
    await user.keyboard("{ArrowRight}");

    expect(separator).toHaveAttribute("aria-valuenow", "336");
    expect(region).toHaveStyle("--timeline-track-header-width: 336px");
  });

  it("names the preset the track's voice matches", () => {
    renderRegion();
    seedMidiTrack();

    expect(presetSelect()).toHaveTextContent("WT-1 Prime Lead");
  });

  it("writes the picked preset's instrument onto the track", async () => {
    const user = userEvent.setup();
    renderRegion();
    const trackId = seedMidiTrack();

    await user.click(presetSelect());
    await user.click(await screen.findByRole("option", { name: "WT-1 Bloom Pad" }));

    const track = useTimelineStore
      .getState()
      .tracks.find((t) => t.id === trackId);
    expect(track?.instrument).toEqual(
      findInstrumentPreset("wt1-bloom-pad")?.instrument
    );
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
    seedMidiTrack();

    await user.click(presetSelect());
    await user.click(await screen.findByRole("option", { name: "BL-1 Acid" }));
    await user.click(screen.getByRole("button", { name: "Edit instrument" }));

    // BL-1 exposes the device's oscillator, filter, envelope, accent and glide
    // modules rather than the built-in synth's waveform control.
    expect(
      screen.queryByRole("combobox", { name: /waveform/i })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "DRIVE" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "OSC" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "ENV" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "ACC AMT" })).toBeInTheDocument();
    expect(
      screen.getByRole("slider", { name: "SLD TIME" })
    ).toBeInTheDocument();
  });

  it("exposes both WT-1 oscillators and envelopes", async () => {
    const user = userEvent.setup();
    renderRegion();
    seedMidiTrack();

    await user.click(presetSelect());
    await user.click(
      await screen.findByRole("option", { name: "WT-1 Prime Lead" })
    );
    await user.click(screen.getByRole("button", { name: "Edit instrument" }));

    expect(screen.getByRole("region", { name: "OSC A" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "OSC B" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "AMP ENV" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "MOD ENV" })).toBeInTheDocument();
  });

  it("selects and edits DR-1 pads", async () => {
    const user = userEvent.setup();
    renderRegion();
    seedMidiTrack();

    await user.click(presetSelect());
    await user.click(
      await screen.findByRole("option", { name: "DR-1 TR-Void Kit" })
    );
    await user.click(screen.getByRole("button", { name: "Edit instrument" }));

    expect(screen.getByRole("region", { name: "PADS" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit pad 1: Kick" })
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Edit pad 3: Snare" }));

    expect(screen.getByText("03 · SNARE")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "NOISE + RING" })).getByRole(
        "slider",
        { name: "NOISE" }
      )
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "PITCH ENV" })).getByRole(
        "slider",
        { name: "AMT" }
      )
    ).toBeInTheDocument();
  });

  it("opens the instrument editor from the Edit toggle", async () => {
    const user = userEvent.setup();
    renderRegion();
    const trackId = seedMidiTrack();

    expect(
      screen.queryByTestId(`track-instrument-panel-${trackId}`)
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit instrument" }));

    expect(
      screen.getByTestId(`track-instrument-panel-${trackId}`)
    ).toBeInTheDocument();
    expect(playAuditionNote).not.toHaveBeenCalled();
  });

  it("auditions a new supported voice and keeps the panel outside track lanes", async () => {
    const user = userEvent.setup();
    renderRegion();
    seedMidiTrack();
    await user.click(screen.getByRole("button", {name: "Edit instrument"}));
    expect(within(screen.getByTestId("tracks-region")).queryByTestId(/track-instrument-panel/)).not.toBeInTheDocument();
    const picker = screen.getByRole("combobox", {name: "Instrument preset"});
    await user.click(picker);
    expect(screen.queryByRole("option", {name: "Saw Lead"})).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", {name: "BL-1 Acid"}));
    expect(useTimelineStore.getState().tracks[0].instrument?.type).toBe("bass");
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(playAuditionNote).toHaveBeenCalledTimes(1);
  });

  it("toggles a keyboard independently for each instrument track, including drums", async () => {
    const user = userEvent.setup();
    renderRegion();
    const bassId = seedMidiTrack();
    let drumId = "";
    act(() => {
      useTimelineStore.getState().addTrack("midi", "Drums");
      drumId = useTimelineStore.getState().tracks[1].id;
      useTimelineStore.getState().setTrackInstrument(drumId, findInstrumentPreset("dr1-tr-void")!.instrument);
      useTimelineUIStore.getState().toggleExpandedInstrument(bassId);
    });
    expect(screen.queryByRole("region", {name: "KEYS"})).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "Keyboard"}));
    expect(screen.getByRole("region", {name: "KEYS"})).toBeInTheDocument();
    act(() => useTimelineUIStore.getState().toggleExpandedInstrument(drumId));
    expect(screen.queryByRole("region", {name: "KEYS"})).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "Keyboard"}));
    expect(screen.getByRole("region", {name: "KEYS"})).toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "Keyboard"}));
    act(() => useTimelineUIStore.getState().toggleExpandedInstrument(bassId));
    expect(screen.getByRole("region", {name: "KEYS"})).toBeInTheDocument();
  });
});
