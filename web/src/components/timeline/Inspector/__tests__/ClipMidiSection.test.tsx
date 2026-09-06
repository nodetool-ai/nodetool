/**
 * The inspector's MIDI section — the note edits a user reaches without the
 * agent. Each control writes the clip through one store action, so the
 * assertions read the document rather than the DOM.
 */

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { makeTrack } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { TimelineInspector } from "../TimelineInspector";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";

const renderInspector = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter>
          <TimelineProvider>
            <TimelineInspector />
          </TimelineProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );

/** A selected two-note midi clip, its second note off the grid. */
function seedMidiClip(): string {
  const track = makeTrack({ type: "midi", name: "Bass" });
  let clipId = "";
  act(() => {
    useTimelineStore.setState({ tracks: [track], clips: [] });
    clipId = useTimelineStore.getState().addMidiClip({
      trackId: track.id,
      startMs: 0,
      durationMs: 4000,
      name: "Riff",
      notes: [
        { pitch: 60, startTick: 0, durationTick: 240 },
        { pitch: 64, startTick: 500, durationTick: 240 }
      ]
    });
    useTimelineUIStore.getState().setSelection([clipId]);
  });
  return clipId;
}

const notesOf = (clipId: string) =>
  useTimelineStore.getState().clips.find((c) => c.id === clipId)!.notes!;

beforeEach(() => {
  localStorage.clear();
});

describe("ClipMidiSection", () => {
  it("shows only for a midi clip", async () => {
    const user = userEvent.setup();
    renderInspector();
    seedMidiClip();

    await user.click(screen.getByRole("button", { name: /midi/i }));
    expect(screen.getByText("2 (2 audible)")).toBeInTheDocument();
  });

  it("transposes the clip an octave from the +12 button", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clipId = seedMidiClip();

    await user.click(screen.getByRole("button", { name: /midi/i }));
    await user.click(
      screen.getByRole("button", { name: "Transpose +12 semitones" })
    );

    expect(notesOf(clipId).map((n) => n.pitch)).toEqual([72, 76]);
  });

  it("applies a quantize with the chosen division", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clipId = seedMidiClip();

    await user.click(screen.getByRole("button", { name: /midi/i }));
    await user.click(
      screen.getByRole("combobox", { name: /quantize division/i })
    );
    await user.click(await screen.findByRole("option", { name: "1/8" }));
    await user.click(screen.getByRole("button", { name: /apply quantize/i }));

    // 1/8 is 480 ticks: the second note moves from 500 onto 480.
    expect(notesOf(clipId).map((n) => n.startTick)).toEqual([0, 480]);
  });

  it("leaves the notes alone until Apply is pressed", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clipId = seedMidiClip();

    await user.click(screen.getByRole("button", { name: /midi/i }));
    await user.click(
      screen.getByRole("combobox", { name: /quantize division/i })
    );
    await user.click(await screen.findByRole("option", { name: "1/8" }));

    expect(notesOf(clipId).map((n) => n.startTick)).toEqual([0, 500]);
  });
});
