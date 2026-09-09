/**
 * The inspector's MIDI section — the note edits a user reaches without the
 * agent.
 */

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";

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
  it("shows only sections that affect a midi clip", () => {
    renderInspector();
    seedMidiClip();

    expect(screen.getByText(/^MIDI$/)).toBeInTheDocument();
    expect(screen.getByText(/^Timing$/)).toBeInTheDocument();
    expect(screen.getByText(/^Audio$/)).toBeInTheDocument();

    for (const title of [
      "Media",
      "Group",
      "Render",
      "Transform",
      "Color",
      "Blur",
      "Effects",
      "Mask",
      "Matte",
      "Transition",
      "Time remap",
      "Animate",
      "Keyframes"
    ]) {
      expect(screen.queryByText(title)).toBeNull();
    }
  });

  it("mutes and mixes a midi clip", async () => {
    const user = userEvent.setup();
    renderInspector();
    seedMidiClip();

    await user.click(screen.getByRole("button", { name: /^timing$/i }));
    expect(
      screen.queryByRole("textbox", { name: /playback speed/i })
    ).toBeNull();
    expect(screen.queryByText(/^Hidden$/)).toBeNull();

    await user.click(screen.getByRole("button", { name: /^audio$/i }));
    const mute = screen.getByRole("switch", { name: /^mute$/i });
    await user.click(mute);
    expect(mute).toBeChecked();

    const volume = screen.getByRole("slider", { name: /^volume$/i });
    await user.tab();
    expect(volume).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(volume).toHaveAttribute("aria-valuenow", "0.5");

    const fadeIn = screen.getByRole("textbox", {
      name: /fade in \(seconds\)/i
    });
    await user.clear(fadeIn);
    await user.type(fadeIn, "0.25");
    await user.tab();
    expect(fadeIn).toHaveValue("0.25");
  });

  it("offers group membership only when a group exists", async () => {
    const user = userEvent.setup();
    renderInspector();
    seedMidiClip();
    const groupTrack = makeTrack({ type: "overlay", name: "Groups" });
    const group = makeClip({
      trackId: groupTrack.id,
      name: "Rhythm section",
      mediaType: "group",
      sourceType: "imported",
      startMs: 0,
      durationMs: 4000
    });

    act(() => {
      const state = useTimelineStore.getState();
      useTimelineStore.setState({
        tracks: [...state.tracks, groupTrack],
        clips: [...state.clips, group]
      });
    });

    await user.click(screen.getByRole("button", { name: /^group$/i }));
    await user.click(
      screen.getByRole("combobox", { name: /parent group/i })
    );
    await user.click(
      await screen.findByRole("option", { name: "Rhythm section" })
    );

    expect(
      screen.getByRole("combobox", { name: /parent group/i })
    ).toHaveTextContent("Rhythm section");
  });

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
