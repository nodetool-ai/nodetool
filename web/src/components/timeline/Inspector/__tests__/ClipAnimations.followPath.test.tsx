/**
 * `followPath` inspector controls (T9): the `d`/`orient` param editors, the
 * "Use shape clip" picker, and the "Hold" easing option every preset
 * animation's easing select now carries.
 */

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import type { ClipShapeStyle, TimelineClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { TimelineInspector } from "../TimelineInspector";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";

const renderInspector = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ThemeProvider theme={mockTheme}>
        <MemoryRouter>
          <TimelineProvider>
            <TimelineInspector />
          </TimelineProvider>
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );

function seed(clips: TimelineClip[], selected: string[]) {
  const track = makeTrack({ type: "video", name: "V1" });
  const placed = clips.map((clip) => ({ ...clip, trackId: track.id }));
  act(() => {
    useTimelineStore.setState({ tracks: [track], clips: placed });
    useTimelineUIStore.getState().setSelection(selected);
  });
  return placed;
}

function seedVideoClip(overrides: Partial<TimelineClip> = {}) {
  const clip = makeClip({
    name: "clip-1",
    sourceType: "imported",
    mediaType: "video",
    startMs: 0,
    durationMs: 2000,
    ...overrides
  });
  seed([clip], [clip.id]);
  return clip;
}

/** Adds a shape clip to the same track, alongside whatever `seed` placed. */
function addShapeClip(name: string, shapeStyle: ClipShapeStyle) {
  const trackId = useTimelineStore.getState().tracks[0]!.id;
  const shapeClip = makeClip({
    trackId,
    name,
    sourceType: "imported",
    mediaType: "shape",
    durationMs: 2000,
    shapeStyle
  });
  act(() => {
    useTimelineStore.setState((state) => ({
      clips: [...state.clips, shapeClip]
    }));
  });
  return shapeClip;
}

const clipById = (id: string) =>
  useTimelineStore.getState().clips.find((c) => c.id === id);

async function openSection(
  user: ReturnType<typeof userEvent.setup>,
  title: string
) {
  const fold = screen
    .getAllByRole("button", { name: new RegExp(title, "i") })
    .find((element) => element.getAttribute("aria-expanded") !== null);
  if (!fold) throw new Error(`No "${title}" section fold`);
  await user.click(fold);
}

async function pickOption(
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp,
  option: RegExp
) {
  await user.click(screen.getByRole("combobox", { name }));
  await user.click(screen.getByRole("option", { name: option }));
}

beforeEach(() => {
  localStorage.clear();
});

describe("followPath animation params", () => {
  it("shows the d field and orient switch", async () => {
    const user = userEvent.setup();
    renderInspector();
    seedVideoClip();

    await openSection(user, "Animate");
    await pickOption(user, /new animation role/i, /^emphasis$/i);
    await pickOption(user, /new animation preset/i, /^followPath$/i);
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    expect(
      screen.getByRole("textbox", { name: /emphasis d/i })
    ).toBeInTheDocument();
    const orientSwitch = screen.getByRole("switch", { name: /^orient$/i });
    expect(orientSwitch).toBeInTheDocument();
    expect(orientSwitch).not.toBeChecked();
  });

  it("fills d/pathX/pathY/pathWidth/pathHeight from a picked shape clip", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clip = seedVideoClip();
    addShapeClip("shape-1", {
      kind: "rect",
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.4
    });

    await openSection(user, "Animate");
    await pickOption(user, /new animation role/i, /^emphasis$/i);
    await pickOption(user, /new animation preset/i, /^followPath$/i);
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await pickOption(user, /use shape clip/i, /^shape-1$/i);

    expect(clipById(clip.id)?.animations?.[0]?.params).toEqual(
      expect.objectContaining({
        d: expect.any(String),
        pathX: 0.1,
        pathY: 0.2,
        pathWidth: 0.3,
        pathHeight: 0.4
      })
    );
  });
});

describe("easing options", () => {
  it("offers Hold alongside the other named easings", async () => {
    const user = userEvent.setup();
    renderInspector();
    seedVideoClip();

    await openSection(user, "Animate");
    // Defaults to role "in", preset "fade" — any preset animation's easing
    // select carries the same catalog.
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await user.click(
      screen.getByRole("combobox", { name: /in animation easing/i })
    );
    expect(screen.getByRole("option", { name: /^hold$/i })).toBeInTheDocument();
  });
});
