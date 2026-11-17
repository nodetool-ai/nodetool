/**
 * The clip panels beside the Inspector: each control has one owner, as in the
 * native editor. The AI panel holds AI edit, extend, subject matte, smart
 * reframe and tracking, and the Inspector no longer does.
 */

import { act, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import type { TimelineClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { TimelineInspector } from "../TimelineInspector";
import {
  TimelineAiPanel,
  TimelineColorPanel,
  TimelineEffectControlsPanel,
  TimelineMotionPanel
} from "../TimelineClipPanels";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";

const renderPanel = (panel: React.ReactNode) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter>
          <TimelineProvider>{panel}</TimelineProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );

function seed(clips: Partial<TimelineClip>[], selected: number[]): string[] {
  const track = makeTrack({ type: "video", name: "V1" });
  const made = clips.map((patch, index) =>
    makeClip({
      trackId: track.id,
      name: `Clip ${index}`,
      sourceType: "imported",
      mediaType: "video",
      startMs: index * 4000,
      durationMs: 4000,
      ...patch
    })
  );
  act(() => {
    useTimelineStore.setState({ tracks: [track], clips: made });
    useTimelineUIStore
      .getState()
      .setSelection(selected.map((index) => made[index].id));
  });
  return made.map((clip) => clip.id);
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

describe("AI panel", () => {
  it("holds subject matte, smart reframe and tracking for a video clip", () => {
    renderPanel(<TimelineAiPanel />);
    seed([{ mediaType: "video" }], [0]);

    expect(hasSectionFold("^Subject matte$")).toBe(true);
    expect(hasSectionFold("^Smart reframe$")).toBe(true);
    expect(hasSectionFold("^Tracking$")).toBe(true);
  });

  it("says when nothing or several clips are selected", () => {
    renderPanel(<TimelineAiPanel />);
    seed([{}, {}], []);
    expect(screen.getByText("No clip selected")).toBeVisible();

    seed([{}, {}], [0, 1]);
    expect(screen.getByText("Several clips selected")).toBeVisible();
  });

  it("names a clip with no AI tools", () => {
    renderPanel(<TimelineAiPanel />);
    seed([{ mediaType: "audio" }], [0]);
    expect(screen.getByText("No AI tools for this clip")).toBeVisible();
  });
});

describe("Inspector", () => {
  it("keeps what the clip is and leaves the other panels' sections out", () => {
    renderPanel(<TimelineInspector />);
    seed([{ mediaType: "video" }], [0]);

    expect(hasSectionFold("^Media$")).toBe(true);
    expect(hasSectionFold("^Timing$")).toBe(true);
    expect(hasSectionFold("^Transition$")).toBe(true);
    for (const moved of [
      "^Render",
      "^Transform",
      "^Color",
      "^Effects",
      "^Subject matte",
      "^Smart reframe",
      "^Tracking",
      "^Animate"
    ]) {
      expect(hasSectionFold(moved)).toBe(false);
    }
  });
});

describe("Effect Controls, Motion and Color", () => {
  it("split the adjustment sections between them", () => {
    renderPanel(
      <>
        <TimelineEffectControlsPanel />
        <TimelineMotionPanel />
        <TimelineColorPanel />
      </>
    );
    seed([{ mediaType: "video" }], [0]);

    expect(hasSectionFold("^Render$")).toBe(true);
    expect(hasSectionFold("^Transform")).toBe(true);
    expect(hasSectionFold("^Mask")).toBe(true);
    expect(hasSectionFold("^Matte$")).toBe(true);
    expect(hasSectionFold("^Animate$")).toBe(true);
    expect(hasSectionFold("^Color")).toBe(true);
  });

  it("explain what a sounding clip cannot use", () => {
    renderPanel(
      <>
        <TimelineMotionPanel />
        <TimelineColorPanel />
      </>
    );
    seed([{ mediaType: "midi" }], [0]);

    expect(screen.getByText("Nothing to animate")).toBeVisible();
    expect(screen.getByText("This clip has no picture")).toBeVisible();
  });
});
