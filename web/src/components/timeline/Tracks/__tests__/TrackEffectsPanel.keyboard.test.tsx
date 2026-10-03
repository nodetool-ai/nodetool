/** Keyboard operation of the effects panel (F68). */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { makeTrack, makeTrackEffect } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import {
  TimelineProvider,
  createTimelineInstance
} from "../../../../stores/timeline/TimelineInstance";
import { TrackEffectsPanel } from "../TrackEffectsPanel";

function setup() {
  const instance = createTimelineInstance();
  const track = makeTrack({ type: "audio", name: "A1" });
  const gain = makeTrackEffect("gain");
  const eq = makeTrackEffect("eq3");
  act(() => {
    instance.doc.setState({ tracks: [{ ...track, effects: [gain, eq] }] });
  });
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider instance={instance}>
        <TrackEffectsPanel trackId={track.id} />
      </TimelineProvider>
    </ThemeProvider>
  );
  const effects = () => instance.doc.getState().tracks[0].effects ?? [];
  return { effects, gain, eq };
}

describe("TrackEffectsPanel keyboard", () => {
  it("moves an EQ band with the arrow keys", () => {
    const { effects, eq } = setup();
    const handle = screen.getByRole("slider", { name: "low band" });
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    const after = effects().find((e) => e.id === eq.id) as typeof eq & {
      lowGainDb: number;
    };
    expect(after.lowGainDb).toBeCloseTo(
      (eq as typeof eq & { lowGainDb: number }).lowGainDb + 0.5
    );
  });

  it("reorders an effect with Alt+Arrow and names it in the labels", () => {
    const { effects, gain } = setup();
    const grip = screen.getByRole("button", { name: /reorder gain/i });
    expect(screen.getByRole("button", { name: /remove gain/i })).toBeTruthy();
    fireEvent.keyDown(grip, { key: "ArrowRight", altKey: true });
    expect(effects().map((e) => e.id)[1]).toBe(gain.id);
  });
});
