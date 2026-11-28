/**
 * The inspector's region parameters (CE6): non-destructive transpose, velocity
 * offset and quantize on a midi clip.
 */

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { TimelineInspector } from "../TimelineInspector";
import { TimelineAiPanel, TimelineColorPanel, TimelineEffectControlsPanel, TimelineMotionPanel } from "../TimelineClipPanels";
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
            <>
              <TimelineInspector />
              <TimelineEffectControlsPanel />
              <TimelineMotionPanel />
              <TimelineColorPanel />
              <TimelineAiPanel />
            </>
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

const clipOf = (clipId: string) =>
  useTimelineStore.getState().clips.find((c) => c.id === clipId)!;

beforeEach(() => {
  localStorage.clear();
});

describe("ClipMidiSection region parameters", () => {
  it("sets the transpose without rewriting the stored notes", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clipId = seedMidiClip();
    await user.click(screen.getByRole("button", { name: /midi/i }));
    const slider = screen.getByRole("slider", { name: /region transpose/i });
    slider.focus();
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(clipOf(clipId).transpose).toBe(2);
    expect(clipOf(clipId).notes!.map((n) => n.pitch)).toEqual([60, 64]);
  });

  it("sets the velocity offset and clears it at zero", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clipId = seedMidiClip();
    await user.click(screen.getByRole("button", { name: /midi/i }));
    const slider = screen.getByRole("slider", { name: /region velocity offset/i });
    slider.focus();
    await user.keyboard("{ArrowUp}");
    expect(clipOf(clipId).velocityOffset).toBe(1);
    await user.keyboard("{ArrowDown}");
    expect(clipOf(clipId).velocityOffset).toBeUndefined();
  });

  it("sets and clears the region quantize", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clipId = seedMidiClip();
    await user.click(screen.getByRole("button", { name: /midi/i }));
    await user.click(screen.getByRole("combobox", { name: /region quantize grid/i }));
    await user.click(await screen.findByRole("option", { name: "1/8" }));
    expect(clipOf(clipId).quantize).toEqual({ grid: "1/8", strength: 100 });
    expect(clipOf(clipId).notes!.map((n) => n.startTick)).toEqual([0, 500]);
    await user.click(screen.getByRole("combobox", { name: /region quantize grid/i }));
    await user.click(await screen.findByRole("option", { name: "Off" }));
    expect(clipOf(clipId).quantize).toBeUndefined();
  });

  it("counts the notes the clip plays, repeats and quantize included (F15)", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clipId = seedMidiClip();
    act(() => {
      useTimelineStore.setState((state) => ({
        clips: state.clips.map((c) =>
          c.id === clipId ? { ...c, loopLengthMs: 1000 } : c
        )
      }));
    });
    await user.click(screen.getByRole("button", { name: /midi/i }));
    // The 4 s clip repeats its 1 s window four times: two notes, eight heard.
    expect(screen.getByText("2 (8 audible)")).toBeInTheDocument();
  });
});
