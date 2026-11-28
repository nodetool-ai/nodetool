import React from "react";
import { act, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import { MIDI_PPQ, makeTrack } from "@nodetool-ai/timeline";
import type { ClipHarmony } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import {
  TimelineProvider,
  createTimelineInstance
} from "../../../../stores/timeline/TimelineInstance";
import { useTimelineLayoutStore } from "../../../../stores/timeline/TimelineLayoutStore";
import { ChordClipStrip } from "../../daw/harmony/ChordClipStrip";

jest.mock("../../daw/harmony/harmony.css", () => ({}));

const BAR = MIDI_PPQ * 4;

function renderStrip(harmony: ClipHarmony | undefined, dawMode: boolean) {
  const instance = createTimelineInstance();
  act(() => {
    useTimelineLayoutStore.setState({ dawMode });
    instance.doc.setState({
      tempo: { bpm: 120, offsetMs: 0, timeSignature: { beatsPerBar: 4, beatUnit: 4 } },
      tracks: [
        {
          ...makeTrack({ id: "chords", type: "chord", name: "Chords" }),
          chords: [
            { id: "a", startTick: 0, durationTick: BAR, root: 9, quality: "min", inversion: 0 },
            { id: "b", startTick: BAR, durationTick: BAR, root: 5, quality: "maj", inversion: 0 }
          ]
        }
      ]
    });
    instance.ui.setState({ msPerPx: 10 });
  });
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider instance={instance}>
        <ChordClipStrip clip={{ mediaType: "midi", startMs: 0, durationMs: 4000, harmony }} />
      </TimelineProvider>
    </ThemeProvider>
  );
}

describe("ChordClipStrip", () => {
  afterEach(() => {
    act(() => useTimelineLayoutStore.setState({ dawMode: false }));
  });

  it("names the chords under a clip that follows the chord track", () => {
    renderStrip({ style: "comp", input: "chords" }, true);
    expect(screen.getByTestId("chord-clip-strip")).toBeInTheDocument();
    expect(screen.getByText("Am")).toBeInTheDocument();
    expect(screen.getByText("F")).toBeInTheDocument();
  });

  it("draws nothing for a clip that does not follow the chords", () => {
    renderStrip({ style: "arp", input: "notes" }, true);
    expect(screen.queryByTestId("chord-clip-strip")).not.toBeInTheDocument();
  });

  it("draws nothing outside the music view", () => {
    renderStrip({ style: "comp", input: "chords" }, false);
    expect(screen.queryByTestId("chord-clip-strip")).not.toBeInTheDocument();
  });
});
