/** F24: a save from the keyboard shows up in the open Pattern Browser. */

import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import { DEFAULT_MIDI_INSTRUMENT, makeTrack, normalizePattern } from "@nodetool-ai/timeline";
import type { StepRow, TimelineClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { TimelineProvider, createTimelineInstance } from "../../../../stores/timeline/TimelineInstance";
import { PianoRollPanel } from "../../pianoRoll/PianoRollPanel";

const saved: Array<Record<string, unknown>> = [];
jest.mock("../../../../hooks/timeline/useTimelineAgentBridge", () => ({
  createBrowserStepPatternLibrary: () => ({
    list: async () => saved,
    save: async (entry: Record<string, unknown>) => {
      const id = `u${saved.length + 1}`;
      saved.push({ ...entry, id, tags: [] });
      return { id };
    }
  })
}));
jest.mock("../../preview/audition", () => ({ playAuditionNote: jest.fn(() => Promise.resolve()) }));

it("lists a pattern saved with Shift-Command-P while the browser is open (F24)", async () => {
  const user = userEvent.setup();
  const instance = createTimelineInstance();
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider instance={instance}>
        <PianoRollPanel />
      </TimelineProvider>
    </ThemeProvider>
  );
  const track = makeTrack({ type: "midi", name: "Drums", instrument: DEFAULT_MIDI_INSTRUMENT });
  const clip = {
    id: "c",
    trackId: track.id,
    name: "Beat",
    startMs: 0,
    durationMs: 2000,
    inPointMs: 0,
    mediaType: "midi",
    sourceType: "imported",
    status: "generated",
    locked: false,
    versions: [],
    pattern: normalizePattern({ name: "Zebra Groove", lengthSteps: 16, rows: [{ id: "k", assignment: { type: "note", pitch: 36 } }] as StepRow[] })
  } as TimelineClip;
  act(() => {
    instance.doc.setState({ tracks: [track], clips: [clip] });
    instance.ui.getState().openPianoRoll("c");
  });
  await user.click(screen.getByTestId("toggle-browser"));
  expect(screen.queryByText("Zebra Groove", { selector: "[data-testid=step-pattern-browser] *" })).toBeNull();
  screen.getByTestId("step-sequencer").focus();
  await user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");
  expect(await screen.findByText("Zebra Groove", { selector: "[data-testid=step-pattern-browser] *" })).toBeInTheDocument();
});
