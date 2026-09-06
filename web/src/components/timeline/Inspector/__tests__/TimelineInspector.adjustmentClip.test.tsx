/**
 * TimelineInspector for an `adjustment` clip (T26): it treats the composite
 * beneath it rather than drawing its own picture, so most sections a normal
 * clip carries don't apply. Only Timing, Render (opacity), Effects, the mask
 * half of Mask/Matte, and Animate/Keyframes should show.
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

function seedAdjustmentClip() {
  const track = makeTrack({ type: "video", name: "V1" });
  const clip = makeClip({
    trackId: track.id,
    name: "Adjustment",
    sourceType: "imported",
    mediaType: "adjustment",
    startMs: 0,
    durationMs: 4000,
    opacity: 1,
    effects: [
      { id: "e1", type: "color", enabled: true, brightness: 0.2 },
      { id: "e2", type: "blur", enabled: true, radius: 4 }
    ]
  });
  act(() => {
    useTimelineStore.setState({ tracks: [track], clips: [clip] });
    useTimelineUIStore.getState().setSelection([clip.id]);
  });
  return clip;
}

/** Whether a collapsible section fold with this title exists in the DOM. */
function hasSectionFold(title: string): boolean {
  return screen
    .queryAllByRole("button", { name: new RegExp(title, "i") })
    .some((el) => el.getAttribute("aria-expanded") !== null);
}

beforeEach(() => {
  localStorage.clear();
});

describe("TimelineInspector — adjustment clip", () => {
  it("shows Timing, Render, Effects and the mask half of Mask/Matte", () => {
    renderInspector();
    seedAdjustmentClip();

    expect(hasSectionFold("Timing")).toBe(true);
    expect(hasSectionFold("Render")).toBe(true);
    expect(hasSectionFold("Effects")).toBe(true);
    expect(hasSectionFold("Mask")).toBe(true);
    expect(hasSectionFold("Animate")).toBe(true);
    expect(hasSectionFold("Keyframes")).toBe(true);
  });

  it("hides Transform, Color, Blur, Media, Matte and Transition", () => {
    renderInspector();
    seedAdjustmentClip();

    expect(hasSectionFold("Transform")).toBe(false);
    expect(hasSectionFold("^Color$")).toBe(false);
    expect(hasSectionFold("^Blur$")).toBe(false);
    expect(hasSectionFold("^Media$")).toBe(false);
    expect(hasSectionFold("^Matte$")).toBe(false);
    expect(hasSectionFold("Transition")).toBe(false);
  });

  it("shows the opacity slider under Render", async () => {
    const user = userEvent.setup();
    renderInspector();
    seedAdjustmentClip();

    const fold = screen
      .getAllByRole("button", { name: /render/i })
      .find((el) => el.getAttribute("aria-expanded") !== null);
    if (!fold) throw new Error("No Render section fold");
    await user.click(fold);

    expect(screen.getByRole("slider", { name: /opacity/i })).toBeTruthy();
  });
});
