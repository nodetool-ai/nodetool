/**
 * F21: the Piano Roll and Step Editor tabs on a pattern region show the
 * expanded notes read-only, with Convert to MIDI kept.
 */

import React from "react";
import { act, render, screen, within } from "@testing-library/react";
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


it.each(["pianoRoll", "stepEditor"] as const)("shows the expanded notes read-only on the %s tab (F21)", (tab) => {
  const instance = setup([{ id: "kick", assignment: { type: "note" as const, pitch: 36 }, steps: [{ on: true }, {}, {}, {}, { on: true }] } as never]);
  act(() => instance.ui.getState().setClipEditorTab(tab));
  const view = screen.getByTestId("pattern-readonly-view");
  expect(view).toHaveAttribute("data-view", tab);
  expect(view).toHaveAttribute("aria-readonly", "true");
  // 2000 ms at 120 BPM is 16 steps: steps 0 and 4 play once each.
  const notes = within(view).getAllByTestId("pattern-readonly-note");
  expect(notes).toHaveLength(2);
  expect(screen.queryByTestId("piano-roll-grid")).toBeNull();
  expect(screen.getByRole("button", { name: /Convert to MIDI/i })).toBeInTheDocument();
});

it("draws the pitch keyboard with a label per row on the read-only Piano Roll (SQ27)", () => {
  const instance = setup([
    { id: "kick", assignment: { type: "note" as const, pitch: 36 }, steps: [{ on: true }] },
    { id: "snare", assignment: { type: "note" as const, pitch: 38 }, steps: [{}, { on: true }] }
  ] as never);
  act(() => instance.ui.getState().setClipEditorTab("pianoRoll"));
  const view = screen.getByTestId("pattern-readonly-view");
  const keyboard = within(view).getByTestId("pattern-readonly-keyboard");
  expect(keyboard).toHaveAttribute("data-pitches", "D2,C2");
  expect(within(keyboard).getByRole("img", { name: "Piano keyboard" })).toBeInTheDocument();
});

it("omits the keyboard on the read-only Step Editor", () => {
  const instance = setup([{ id: "kick", assignment: { type: "note" as const, pitch: 36 }, steps: [{ on: true }] }] as never);
  act(() => instance.ui.getState().setClipEditorTab("stepEditor"));
  expect(screen.queryByTestId("pattern-readonly-keyboard")).toBeNull();
});
