/**
 * The motion-graphics controls added in the A7 review: stagger unit/from, the
 * time-remap section, the font picker's unknown-family option, caption style,
 * gradient fills, keyframe removal, and the captions the panel computes during
 * render (an unparseable easing, an animation that outruns its clip).
 *
 * Each case drives the control the way a user does and asserts either the store
 * write it makes or the caption it puts on screen.
 */

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import type { ClipAnimation, TimelineClip } from "@nodetool-ai/timeline";

jest.mock("../../../../trpc/client", () => {
  const actual = jest.requireActual("../../../../trpc/client");
  return {
    ...actual,
    trpcClient: {
      ...actual.trpcClient,
      fonts: {
        list: {
          query: jest.fn().mockResolvedValue({
            fonts: [
              { name: "Inter", portable: true },
              { name: "Helvetica", portable: false }
            ]
          })
        }
      }
    }
  };
});

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

function seedClip(overrides: Partial<TimelineClip> = {}) {
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

async function commitField(
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp,
  value: string
) {
  const field = screen.getByRole("textbox", { name });
  await user.clear(field);
  await user.type(field, value);
  await user.tab();
}

async function pickOption(
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp,
  option: RegExp
) {
  await user.click(screen.getByRole("combobox", { name }));
  await user.click(screen.getByRole("option", { name: option }));
}

function textClipWithAnimation(
  animation: Partial<ClipAnimation> = {},
  clipOverrides: Partial<TimelineClip> = {}
) {
  return seedClip({
    mediaType: "text",
    textStyle: {
      text: "one two three four",
      fontSizePx: 48,
      color: "#ffffff"
    },
    animations: [
      {
        id: "anim-1",
        role: "in",
        preset: "custom",
        durationMs: 400,
        enabled: true,
        custom: {
          curves: [
            { property: "opacity", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }] }
          ]
        },
        ...animation
      } as ClipAnimation
    ],
    ...clipOverrides
  });
}

beforeEach(() => {
  localStorage.clear();
});

describe("Stagger controls", () => {
  it("writes the stagger unit and the unit it starts from", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clip = textClipWithAnimation({
      stagger: { unit: "word", offsetMs: 120 }
    });

    await openSection(user, "Animate");
    await pickOption(user, /in animation stagger unit/i, /^character$/i);
    expect(clipById(clip.id)?.animations?.[0].stagger?.unit).toBe("character");

    await pickOption(user, /in animation stagger from/i, /^center$/i);
    expect(clipById(clip.id)?.animations?.[0].stagger?.from).toBe("center");
  });

  it("captions a stagger that runs past the clip", async () => {
    const user = userEvent.setup();
    renderInspector();
    // Four words × 900ms + a 400ms window is 3100ms in a 2000ms clip.
    textClipWithAnimation({ stagger: { unit: "word", offsetMs: 900 } });

    await openSection(user, "Animate");
    expect(
      screen.getByText(/staggered over 4 words this runs 3100ms/i)
    ).toBeInTheDocument();
  });
});

describe("Animation overrun caption", () => {
  it("says when in and out together outrun the clip", async () => {
    const user = userEvent.setup();
    renderInspector();
    seedClip({
      durationMs: 1000,
      animations: [
        {
          id: "a",
          role: "in",
          preset: "fadeIn",
          durationMs: 600,
          delayMs: 200,
          enabled: true
        },
        {
          id: "b",
          role: "out",
          preset: "fadeOut",
          durationMs: 600,
          enabled: true
        }
      ] as ClipAnimation[]
    });

    await openSection(user, "Animate");
    expect(
      screen.getByText(/in and out together run 1400ms/i)
    ).toBeInTheDocument();
  });
});

describe("Time remap section", () => {
  it("adds a remap, edits a keyframe, and clears it again", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clip = seedClip();

    await user.click(
      screen.getByRole("checkbox", { name: /time remap enabled/i })
    );
    expect(clipById(clip.id)?.timeRemap?.keyframes).toEqual([
      { t: 0, sourceMs: 0 },
      { t: 1, sourceMs: 2000 }
    ]);

    await openSection(user, "Time remap");
    await commitField(user, /time remap keyframe 2 source time/i, "500");
    expect(clipById(clip.id)?.timeRemap?.keyframes[1].sourceMs).toBe(500);

    expect(
      screen.getByText(/split and trim refuse a remapped clip/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^clear$/i }));
    expect(clipById(clip.id)?.timeRemap).toBeUndefined();
  });

  it("sorts keyframes by time and refuses two at one time", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clip = seedClip({
      timeRemap: {
        keyframes: [
          { t: 0, sourceMs: 0 },
          { t: 0.5, sourceMs: 500 },
          { t: 1, sourceMs: 2000 }
        ]
      }
    });

    await openSection(user, "Time remap");
    // 0.9 sorts the edited row to the end.
    await commitField(user, /time remap keyframe 2 time/i, "0.9");
    expect(
      clipById(clip.id)?.timeRemap?.keyframes.map((k) => k.t)
    ).toEqual([0, 0.9, 1]);

    await commitField(user, /time remap keyframe 2 time/i, "1");
    expect(
      clipById(clip.id)?.timeRemap?.keyframes.map((k) => k.t)
    ).toEqual([0, 0.9, 1]);
    expect(
      screen.getByText(/another keyframe already sits at that time/i)
    ).toBeInTheDocument();
  });
});

describe("Custom curve keyframes", () => {
  it("removes one keyframe and keeps the others", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clip = textClipWithAnimation({
      custom: {
        curves: [
          {
            property: "opacity",
            keyframes: [
              { t: 0, value: 0 },
              { t: 0.5, value: 0.4 },
              { t: 1, value: 1 }
            ]
          }
        ]
      }
    });

    await openSection(user, "Animate");
    await user.click(
      screen.getByRole("button", {
        name: /remove in curve 1 keyframe 2/i
      })
    );

    const keyframes = clipById(clip.id)?.animations?.[0].custom?.curves[0]
      .keyframes;
    expect(keyframes).toEqual([
      { t: 0, value: 0 },
      { t: 1, value: 1 }
    ]);
  });

  it("captions an easing this build cannot read", async () => {
    const user = userEvent.setup();
    renderInspector();
    textClipWithAnimation({
      custom: {
        curves: [
          {
            property: "opacity",
            keyframes: [
              { t: 0, value: 0, easing: "wobble(3)" },
              { t: 1, value: 1 }
            ]
          }
        ]
      }
    });

    await openSection(user, "Animate");
    expect(
      screen.getByText(/not an easing this build reads; plays linear/i)
    ).toBeInTheDocument();
  });

  it("captions an unparseable easing on the animation's own field", async () => {
    const user = userEvent.setup();
    renderInspector();
    textClipWithAnimation({ easing: "swoosh" });

    await openSection(user, "Animate");
    expect(
      screen.getByText(/not an easing this build reads; plays linear/i)
    ).toBeInTheDocument();
  });
});

describe("Font picker", () => {
  it("offers a family this machine does not have rather than dropping it", async () => {
    const user = userEvent.setup();
    renderInspector();
    seedClip({
      mediaType: "text",
      textStyle: {
        text: "hello",
        fontSizePx: 48,
        color: "#ffffff",
        fontFamily: "Nonesuch Grotesk"
      }
    });

    await openSection(user, "Text");
    await user.click(
      screen.getByRole("combobox", { name: /text font family/i })
    );
    expect(
      screen.getByRole("option", { name: /nonesuch grotesk · not installed/i })
    ).toBeInTheDocument();
  });
});

describe("Caption style", () => {
  it("writes the caption size and adds an outline from its width", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clip = seedClip({
      caption: { words: [{ word: "hi", startMs: 0, endMs: 100 }] }
    });

    await openSection(user, "Caption");
    await commitField(
      user,
      /caption size as a percentage of frame height/i,
      "8"
    );
    expect(clipById(clip.id)?.caption?.style?.fontSizeFrac).toBeCloseTo(0.08);

    // The outline is a width; setting one adds the field with the colour the
    // renderer already defaults to.
    await commitField(user, /caption outline width/i, "3");
    expect(clipById(clip.id)?.caption?.style?.outline).toEqual({
      color: "#000000",
      widthPx: 3
    });
  });
});

describe("Gradient fill", () => {
  it("switches a text fill to a linear gradient and edits its stops", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clip = seedClip({
      mediaType: "text",
      textStyle: { text: "hello", fontSizePx: 48, color: "#ffffff" }
    });

    await openSection(user, "Text");
    await pickOption(user, /text fill type/i, /linear gradient/i);
    expect(clipById(clip.id)?.textStyle?.fill).toEqual({
      type: "linear",
      angle: 0,
      stops: [
        { offset: 0, color: "#000000" },
        { offset: 1, color: "#ffffff" }
      ]
    });

    await commitField(user, /text fill stops/i, "0:#ff0000, 1:#0000ff");
    expect(clipById(clip.id)?.textStyle?.fill).toEqual(
      expect.objectContaining({
        stops: [
          { offset: 0, color: "#ff0000" },
          { offset: 1, color: "#0000ff" }
        ]
      })
    );
  });
});

describe("Parent group", () => {
  it("re-parents to a group and never offers the clip's own subtree", async () => {
    const user = userEvent.setup();
    renderInspector();
    const group = makeClip({
      name: "Group A",
      mediaType: "group",
      sourceType: "imported",
      startMs: 0,
      durationMs: 3000
    });
    const child = makeClip({
      name: "child",
      mediaType: "video",
      sourceType: "imported",
      startMs: 0,
      durationMs: 1000
    });
    const nested = makeClip({
      name: "Nested group",
      mediaType: "group",
      sourceType: "imported",
      startMs: 0,
      durationMs: 1000,
      parentId: child.id
    });
    const placed = seed([group, child, nested], [child.id]);

    await openSection(user, "Media");
    await user.click(screen.getByRole("combobox", { name: /parent group/i }));
    // The nested group hangs off this clip, so parenting to it is a cycle.
    expect(
      screen.queryByRole("option", { name: /nested group/i })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /group a/i }));

    expect(clipById(placed[1].id)?.parentId).toBe(group.id);

    await user.click(screen.getByRole("button", { name: /^ungroup$/i }));
    expect(clipById(placed[1].id)?.parentId).toBeUndefined();
  });
});

describe("Group panel", () => {
  it("shows the group's children count and renames it", async () => {
    const user = userEvent.setup();
    renderInspector();
    const group = makeClip({
      name: "Group A",
      mediaType: "group",
      sourceType: "imported",
      startMs: 0,
      durationMs: 3000
    });
    const child = makeClip({
      name: "child",
      mediaType: "video",
      sourceType: "imported",
      startMs: 0,
      durationMs: 1000,
      parentId: group.id
    });
    seed([group, child], [group.id]);

    expect(screen.getByText(/^1$/)).toBeInTheDocument();
    await commitField(user, /group name/i, "Titles");
    expect(clipById(group.id)?.name).toBe("Titles");
  });
});

describe("Composition provenance", () => {
  it("shows the composition id and its parameters read-only", () => {
    renderInspector();
    seedClip({
      compositionId: "lower-third",
      compositionParams: { title: "Ada", holdMs: 1200 }
    });

    expect(screen.getByText("lower-third")).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("1200")).toBeInTheDocument();
  });
});
