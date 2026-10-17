/**
 * The harmony panel with no midi clip selected offers to select one.
 */

import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import { DEFAULT_MIDI_INSTRUMENT, makeTrack } from "@nodetool-ai/timeline";
import type { TimelineClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../../__mocks__/themeMock";
import {
  TimelineProvider,
  createTimelineInstance
} from "../../../../../stores/timeline/TimelineInstance";
import { HarmonyPanel } from "../HarmonyPanel";

jest.mock("../harmony.css", () => ({}));

function renderPanel() {
  const instance = createTimelineInstance();
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider instance={instance}>
        <HarmonyPanel />
      </TimelineProvider>
    </ThemeProvider>
  );
  return instance;
}

describe("HarmonyPanel empty state", () => {
  it("selects the first midi clip from its action", async () => {
    const user = userEvent.setup();
    const instance = renderPanel();
    const track = makeTrack({ type: "midi", name: "Keys", instrument: DEFAULT_MIDI_INSTRUMENT });
    const clip: TimelineClip = {
      id: "clip-midi",
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
      notes: []
    };
    act(() => {
      instance.doc.setState({ tracks: [track], clips: [clip] });
    });

    expect(screen.getByText("No MIDI clip selected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit “Riff”" }));

    expect(instance.ui.getState().selectedClipIds.has("clip-midi")).toBe(true);
    expect(screen.getByTestId("harmony-panel-clip")).toBeInTheDocument();
  });

  it("has no action when the timeline holds no midi clip", () => {
    renderPanel();
    expect(screen.getByText("Add a MIDI clip to arpeggiate it or comp it over the chord track.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
