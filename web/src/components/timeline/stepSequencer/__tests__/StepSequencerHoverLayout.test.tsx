/**
 * Round 4 hover overlap: the hover buttons of a short row and of a subrow
 * header cover only the flexible name area, never the right-end controls.
 */

import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import { DEFAULT_MIDI_INSTRUMENT, makeTrack, normalizePattern } from "@nodetool-ai/timeline";
import type { StepPattern, StepRow, TimelineClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { TimelineProvider, createTimelineInstance, type TimelineInstance } from "../../../../stores/timeline/TimelineInstance";
import { PianoRollPanel } from "../../pianoRoll/PianoRollPanel";

jest.mock("../../preview/audition", () => ({
  playAuditionNote: jest.fn(() => Promise.resolve()),
  AUDITION_NOTE_MS: 600,
  AUDITION_DEFAULT_PITCH: 60
}));
jest.mock("../../../../hooks/timeline/useTimelineAgentBridge", () => ({
  createBrowserStepPatternLibrary: () => ({ list: async () => [], save: async () => ({ id: "u1" }) })
}));

const CLIP_ID = "clip-pattern";

function seed(instance: TimelineInstance, rows: Array<Partial<StepRow> & Pick<StepRow, "id" | "assignment">>, extra: Partial<StepPattern> = {}): void {
  const track = makeTrack({ type: "midi", name: "Drums", instrument: DEFAULT_MIDI_INSTRUMENT });
  const clip: TimelineClip = {
    id: CLIP_ID,
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
    pattern: normalizePattern({ lengthSteps: 16, rows: rows as StepRow[], ...extra })
  };
  act(() => {
    instance.doc.setState({ tracks: [track], clips: [clip] });
    instance.ui.getState().openPianoRoll(CLIP_ID);
  });
}

function setup(rows = [{ id: "kick", assignment: { type: "note" as const, pitch: 36 } }], extra: Partial<StepPattern> = {}): TimelineInstance {
  const instance = createTimelineInstance();
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider instance={instance}>
        <PianoRollPanel />
      </TimelineProvider>
    </ThemeProvider>
  );
  seed(instance, rows, extra);
  return instance;
}


/** The hover buttons sit in a box that holds none of the header's right-end controls. */
function expectContained(inline: HTMLElement, rightEnd: HTMLElement): void {
  const box = inline.parentElement!;
  expect(box.contains(rightEnd)).toBe(false);
  expect(box).toHaveStyle({ position: "relative" });
}

it("keeps the hover buttons off the right end of a short row and a subrow header", () => {
  setup([{ id: "kick", assignment: { type: "note" as const, pitch: 36 }, subrows: ["velocity"], subrowsExpanded: true } as never]);
  const zoom = screen.getByRole("slider", { name: /Vertical zoom/i });
  act(() => {
    zoom.focus();
  });
  fireEvent.keyDown(zoom, { key: "Home" });
  const header = screen.getByTestId("row-header-kick");
  expect(parseFloat(header.style.height)).toBeLessThan(56);
  const more = within(header).getByRole("button", { name: /Row actions/i });
  expectContained(screen.getByTestId("row-inline-kick"), more);
  const sub = screen.getByTestId("subrow-header-kick-velocity");
  const subMore = within(sub).getByRole("button", { name: /Subrow actions/i });
  expectContained(screen.getByTestId("row-inline-kick-velocity"), subMore);
});
