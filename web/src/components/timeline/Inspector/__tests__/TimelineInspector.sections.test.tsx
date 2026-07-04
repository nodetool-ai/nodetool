/**
 * TimelineInspector section-header interactions — the FCP-style controls that
 * live inside CollapsibleSection titles: the activation checkbox that toggles
 * an effect without folding the section, and the hover-revealed reset action.
 */

import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";
import { makeTrack, makeClip } from "@nodetool-ai/timeline";
import type { ClipColorEffect } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { TimelineInspector } from "../TimelineInspector";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";

const COLOR_EFFECT_ID = "inspector:color";

function seedImportedClip() {
  const track = makeTrack({ type: "video", name: "V1" });
  const clip = makeClip({
    trackId: track.id,
    name: "clip-1",
    sourceType: "imported",
    mediaType: "video",
    startMs: 0,
    durationMs: 2000,
    transform: {
      position: { x: 10, y: 20 },
      scale: { x: 2, y: 2 },
      rotation: 0,
      anchor: { x: 0.5, y: 0.5 }
    }
  });
  act(() => {
    useTimelineStore.setState({ tracks: [track], clips: [clip] });
    useTimelineUIStore.getState().setSelection([clip.id]);
  });
  return clip;
}

const renderInspector = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <MemoryRouter>
        <TimelineProvider>
          <TimelineInspector />
        </TimelineProvider>
      </MemoryRouter>
    </ThemeProvider>
  );

beforeEach(() => {
  localStorage.clear();
});

describe("TimelineInspector section headers", () => {
  it("toggles the color effect via the header checkbox without unfolding the section", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clip = seedImportedClip();

    const checkbox = screen.getByRole("checkbox", { name: /color enabled/i });
    expect(checkbox).toHaveAttribute("aria-checked", "false");
    // Folds default to closed, so the section body is unmounted.
    expect(screen.queryByLabelText("Brightness")).toBeNull();

    await user.click(checkbox);

    const effect = useTimelineStore
      .getState()
      .clips.find((c) => c.id === clip.id)
      ?.effects?.find(
        (e): e is ClipColorEffect => e.id === COLOR_EFFECT_ID
      );
    expect(effect?.enabled).toBe(true);
    expect(
      screen.getByRole("checkbox", { name: /color enabled/i })
    ).toHaveAttribute("aria-checked", "true");
    // Checking the box must not toggle the fold open.
    expect(screen.queryByLabelText("Brightness")).toBeNull();
  });

  it("resets the transform via the header action", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clip = seedImportedClip();

    // The fold header (role="button") also contains this text in its
    // accessible name, so match the inner action button exactly.
    await user.click(
      screen.getByRole("button", { name: /^reset transform$/i })
    );

    const updated = useTimelineStore
      .getState()
      .clips.find((c) => c.id === clip.id);
    expect(updated?.transform).toBeUndefined();
  });
});
