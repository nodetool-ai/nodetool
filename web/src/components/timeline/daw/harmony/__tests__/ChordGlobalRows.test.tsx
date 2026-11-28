/**
 * The music view's Signature and Chord rows: what they show and the edits a
 * click and a drag make.
 */

import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import { MIDI_PPQ, makeTrack } from "@nodetool-ai/timeline";
import type { TimelineChord } from "@nodetool-ai/timeline";

import { installPointerEvent } from "../../../../../test-utils/pointerEvent";
import mockTheme from "../../../../../__mocks__/themeMock";
import {
  TimelineProvider,
  createTimelineInstance
} from "../../../../../stores/timeline/TimelineInstance";
import { ChordGlobalRows } from "../ChordGlobalRows";

jest.mock("../harmony.css", () => ({}));

beforeAll(() => installPointerEvent());

const BAR = MIDI_PPQ * 4;
const chord = (id: string, bar: number, root: number, quality: TimelineChord["quality"]): TimelineChord => ({
  id,
  startTick: bar * BAR,
  durationTick: BAR,
  root,
  quality,
  inversion: 0
});

function renderRows(chords: TimelineChord[] | null) {
  const instance = createTimelineInstance();
  const track = makeTrack({ id: "chords", type: "chord", name: "Chords" });
  act(() => {
    instance.doc.setState({
      tempo: { bpm: 120, offsetMs: 0, timeSignature: { beatsPerBar: 4, beatUnit: 4 }, key: { tonic: "A", mode: "minor" } },
      tracks: chords ? [{ ...track, chords }] : []
    });
    instance.ui.setState({ msPerPx: 10 });
  });
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider instance={instance}>
        <ChordGlobalRows headerWidth={200} totalWidthPx={4000} />
      </TimelineProvider>
    </ThemeProvider>
  );
  return instance;
}

describe("ChordGlobalRows", () => {
  it("shows the signature and key", () => {
    renderRows(null);
    expect(screen.getByTestId("signature-label")).toHaveTextContent("4/4 Am");
  });

  it("shows the empty state with an Apply Progression button", () => {
    renderRows(null);
    expect(
      screen.getByText("No chords yet. Ask the assistant for a progression, or pick one.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply Progression..." })).toBeInTheDocument();
  });

  it("draws one block per chord", () => {
    renderRows([chord("a", 0, 9, "min"), chord("b", 1, 5, "maj")]);
    expect(screen.getByRole("button", { name: "Am chord" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "F chord" })).toBeInTheDocument();
    expect(screen.queryByTestId("chord-row-empty")).not.toBeInTheDocument();
  });

  it("changes a chord from the diatonic picker", async () => {
    const user = userEvent.setup();
    const instance = renderRows([chord("a", 0, 9, "min")]);
    await user.click(screen.getByRole("button", { name: "Am chord" }));
    const picker = await screen.findByTestId("chord-picker");
    expect(picker).toBeInTheDocument();
    // A minor: the iv chord is Dm.
    await user.click(screen.getByRole("button", { name: "Dm" }));
    expect(instance.doc.getState().tracks[0].chords?.[0]).toMatchObject({ id: "a", root: 2, quality: "min" });
  });

  it("takes any chord symbol and reports a bad one", async () => {
    const user = userEvent.setup();
    const instance = renderRows([chord("a", 0, 9, "min")]);
    await user.click(screen.getByRole("button", { name: "Am chord" }));
    const field = await screen.findByLabelText("Chord symbol");
    await user.clear(field);
    await user.type(field, "Bb7{Enter}");
    expect(instance.doc.getState().tracks[0].chords?.[0]).toMatchObject({ root: 10, quality: "dom7" });

    await user.click(screen.getByRole("button", { name: "B♭7 chord" }));
    const again = await screen.findByLabelText("Chord symbol");
    await user.clear(again);
    await user.type(again, "H7{Enter}");
    expect(await screen.findByText(/Cannot read the chord symbol/)).toBeInTheDocument();
  });

  it("moves the change between two chords with a drag, snapped to the beat", () => {
    const instance = renderRows([chord("a", 0, 9, "min"), chord("b", 1, 5, "maj")]);
    const line = document.querySelector<HTMLElement>('[data-chord-line="b"]') as HTMLElement;
    const lane = screen.getByTestId("chord-row-lane");
    jest.spyOn(lane, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 4000, bottom: 30, width: 4000, height: 30, x: 0, y: 0, toJSON: () => ({}) });
    // 120 bpm, 10 ms/px: a beat is 500 ms = 50 px. Bar 2 starts at 200 px; drag to 255 px.
    fireEvent.pointerDown(line, { clientX: 200, button: 0, pointerId: 1 });
    fireEvent.pointerMove(line, { clientX: 255, pointerId: 1 });
    fireEvent.pointerUp(line, { clientX: 255, pointerId: 1 });
    const chords = instance.doc.getState().tracks[0].chords ?? [];
    expect(chords.map((c) => [c.id, c.startTick, c.durationTick])).toEqual([
      ["a", 0, BAR + MIDI_PPQ],
      ["b", BAR + MIDI_PPQ, BAR - MIDI_PPQ]
    ]);
  });

  it("offers the four chord commands in the row menu", async () => {
    const user = userEvent.setup();
    renderRows([chord("a", 0, 9, "min")]);
    await user.click(screen.getByTestId("chord-row-menu"));
    expect(await screen.findByRole("menuitem", { name: "Apply Progression..." })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Detect Chords from Selection" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Transpose Chords..." })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Clear Chords" })).toBeInTheDocument();
  });
});
