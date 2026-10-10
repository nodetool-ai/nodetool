/**
 * A knob drag in the instrument panel is one gesture, so it must be one undo
 * entry — not one per pointermove.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { findInstrumentPreset } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import {
  getTimelineTemporal,
  useTimelineStore
} from "../../../../stores/timeline/TimelineStore";
import { TrackInstrumentPanel } from "../TrackInstrumentPanel";

jest.mock("../../preview/audition", () => ({
  playAuditionNote: jest.fn(async () => undefined),
  AUDITION_NOTE_MS: 600,
  AUDITION_DEFAULT_PITCH: 60
}));

// jsdom has no PointerEvent, so fireEvent would drop clientY.
class FakePointerEvent extends MouseEvent {
  pointerId: number;
  constructor(type: string, props: PointerEventInit = {}) {
    super(type, props);
    this.pointerId = props.pointerId ?? 1;
  }
}
Object.defineProperty(window, "PointerEvent", {
  configurable: true,
  value: FakePointerEvent
});

beforeEach(() => {
  // jsdom has no pointer capture; the knob calls it on pointerdown.
  HTMLElement.prototype.setPointerCapture = jest.fn();
  HTMLElement.prototype.releasePointerCapture = jest.fn();
  HTMLElement.prototype.hasPointerCapture = jest.fn(() => true);
});

describe("TrackInstrumentPanel knob undo", () => {
  it("records a whole knob drag as one undo entry", () => {
    let trackId = "";
    act(() => {
      const s = useTimelineStore.getState();
      s.reset();
      s.addTrack("midi", "Bass");
      trackId = useTimelineStore.getState().tracks[0].id;
      s.setTrackInstrument(trackId, findInstrumentPreset("bl1-acid")!.instrument);
      getTimelineTemporal().clear();
    });

    render(
      <ThemeProvider theme={mockTheme}>
        <TrackInstrumentPanel trackId={trackId} />
      </ThemeProvider>
    );

    const drive = screen.getByRole("slider", { name: "DRIVE" });
    const before = useTimelineStore.getState().tracks[0].instrument;
    fireEvent.pointerDown(drive, { button: 0, pointerId: 1, clientY: 200 });
    for (let y = 190; y >= 150; y -= 10) {
      fireEvent.pointerMove(drive, { pointerId: 1, clientY: y });
    }
    fireEvent.pointerUp(drive, { pointerId: 1, clientY: 150 });

    const after = useTimelineStore.getState().tracks[0].instrument;
    expect(after).not.toEqual(before);
    expect(getTimelineTemporal().pastStates).toHaveLength(1);

    act(() => getTimelineTemporal().undo());
    expect(useTimelineStore.getState().tracks[0].instrument).toEqual(before);
  });
});
