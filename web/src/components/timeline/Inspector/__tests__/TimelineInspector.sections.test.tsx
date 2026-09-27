/**
 * TimelineInspector section-header interactions — the FCP-style controls that
 * live inside CollapsibleSection titles: the activation checkbox that toggles
 * an effect without folding the section, and the hover-revealed reset action.
 */

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { makeTrack, makeClip } from "@nodetool-ai/timeline";
import type { ClipColorEffect } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { SPACING } from "../../../ui_primitives";
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

function seedTextClip() {
  const track = makeTrack({ type: "overlay", name: "Titles" });
  const clip = makeClip({
    trackId: track.id,
    name: "Title",
    sourceType: "imported",
    mediaType: "text",
    startMs: 0,
    durationMs: 2000,
    textStyle: {
      text: "Original title",
      fontSizePx: 72,
      color: "#ffffff",
      align: "center"
    }
  });
  act(() => {
    useTimelineStore.setState({ tracks: [track], clips: [clip] });
    useTimelineUIStore.getState().setSelection([clip.id]);
  });
  return clip;
}

function seedAnimatedClip() {
  const clip = seedImportedClip();
  act(() => {
    useTimelineStore.getState().setClipAnimations(clip.id, [
      {
        id: "pop-in",
        role: "in",
        preset: "pop",
        durationMs: 500,
        enabled: true,
        params: { overshoot: 1.08 }
      }
    ]);
  });
  return clip;
}

// The text and caption sections carry a FontPicker, which reads the fonts
// endpoint (T17); the mocked tRPC client answers with an empty list.
const renderInspector = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false } }
          })
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

beforeEach(() => {
  localStorage.clear();
});

describe("TimelineInspector section headers", () => {
  it("nests media and timing fields under their section headers", async () => {
    const user = userEvent.setup();
    renderInspector();
    seedTextClip();

    const media = screen.getByRole("button", { name: /^media$/i });
    await user.click(media);
    const mediaBody = media.parentElement?.querySelector(".MuiCollapse-wrapperInner > div");
    expect(mediaBody).toBeTruthy();
    expect(getComputedStyle(mediaBody!).paddingLeft).toBe(mockTheme.spacing(SPACING.xxxl));

    const timing = screen.getByRole("button", { name: /^timing$/i });
    await user.click(timing);
    const timingBody = timing.parentElement?.querySelector(".MuiCollapse-wrapperInner > div");
    expect(timingBody).toBeTruthy();
    expect(getComputedStyle(timingBody!).paddingLeft).toBe(mockTheme.spacing(SPACING.xxxl));
    expect(getComputedStyle(screen.getByText("Hidden").parentElement!).display).toBe("flex");
  });

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

  it("edits authored text without opening the media fold", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clip = seedTextClip();

    const mediaFold = screen.getByRole("button", { name: /^media$/i });
    const textFold = screen.getByRole("button", { name: /^text$/i });
    expect(mediaFold).toHaveAttribute("aria-expanded", "false");
    expect(textFold).toHaveAttribute("aria-expanded", "false");

    await user.click(textFold);
    const input = screen.getByRole("textbox", { name: /text content/i });
    await user.clear(input);
    await user.type(input, "Updated title");

    expect(mediaFold).toHaveAttribute("aria-expanded", "false");
    expect(
      useTimelineStore.getState().clips.find((item) => item.id === clip.id)
        ?.textStyle?.text
    ).toBe("Updated title");
  });

  it("adds an in animation with the selected preset defaults", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clip = seedImportedClip();

    await user.click(screen.getByRole("button", { name: /^animate$/i }));
    await user.click(
      screen.getByRole("combobox", { name: /new animation preset/i })
    );
    await user.click(screen.getByRole("option", { name: "pop" }));
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    expect(
      useTimelineStore.getState().clips.find((item) => item.id === clip.id)
        ?.animations
    ).toEqual([
      expect.objectContaining({
        role: "in",
        preset: "pop",
        durationMs: 500,
        enabled: true,
        params: { overshoot: 1.08 }
      })
    ]);
  });

  it("patches preset parameters from the animation slider", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clip = seedAnimatedClip();

    await user.click(screen.getByRole("button", { name: /^animate$/i }));
    const slider = screen.getByRole("slider", { name: "overshoot" });
    act(() => slider.focus());
    await user.keyboard("{ArrowRight}");

    await waitFor(() => {
      const overshoot = useTimelineStore
        .getState()
        .clips.find((item) => item.id === clip.id)?.animations?.[0].params
        ?.overshoot;
      expect(overshoot).toEqual(expect.any(Number));
      expect(overshoot as number).toBeGreaterThan(1.08);
    });
  });
});
