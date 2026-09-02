/**
 * The motion-graphics inspector sections (T31): transition, mask, matte,
 * effects, text style, shape, custom animation curves, and the group action.
 *
 * Each case drives one control the way a user does and asserts the change
 * landed in the store, since every control writes through `patchClip`.
 */

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import type { TimelineClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { TimelineInspector } from "../TimelineInspector";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";

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

const clipById = (id: string) =>
  useTimelineStore.getState().clips.find((c) => c.id === id);

/**
 * Open a collapsed inspector section by its fold header. A section whose title
 * carries an activation checkbox has that control's name in its own accessible
 * name too, so the fold is found by `aria-expanded` rather than by an exact
 * name match.
 */
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

/** Type into a pill/text field and blur, which is when it commits. */
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

beforeEach(() => {
  localStorage.clear();
});

describe("Transition section", () => {
  it("writes a wipe transition with its direction and easing", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clip = seedVideoClip();

    await openSection(user, "Transition");
    await pickOption(user, /transition type/i, /^wipe$/i);

    expect(clipById(clip.id)?.transitionIn).toEqual(
      expect.objectContaining({ type: "wipe", durationMs: 500 })
    );

    await pickOption(user, /transition direction/i, /^right$/i);
    expect(clipById(clip.id)?.transitionIn).toEqual(
      expect.objectContaining({ direction: "right" })
    );

    await commitField(user, /transition easing/i, "cubic-bezier(.2,0,.1,1)");
    expect(clipById(clip.id)?.transitionIn?.easing).toBe(
      "cubic-bezier(.2,0,.1,1)"
    );
  });

  it("clears the transition when the type goes back to auto", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clip = seedVideoClip({
      transitionIn: { type: "crossfade", durationMs: 400 }
    });

    await openSection(user, "Transition");
    await pickOption(user, /transition type/i, /^auto$/i);

    expect(clipById(clip.id)?.transitionIn).toBeUndefined();
  });
});

describe("Mask section", () => {
  it("adds a mask from the header checkbox and edits its fields", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clip = seedVideoClip();

    await user.click(screen.getByRole("checkbox", { name: /mask enabled/i }));
    expect(clipById(clip.id)?.mask).toEqual(
      expect.objectContaining({ kind: "rect", width: 1 })
    );

    await openSection(user, "Mask");
    await pickOption(user, /mask shape/i, /^ellipse$/i);
    expect(clipById(clip.id)?.mask?.kind).toBe("ellipse");

    await commitField(user, /mask feather/i, "12");
    expect(clipById(clip.id)?.mask?.featherPx).toBe(12);

    await user.click(screen.getByRole("switch", { name: /^invert$/i }));
    expect(clipById(clip.id)?.mask?.invert).toBe(true);
  });
});

describe("Matte section", () => {
  it("points the clip at another clip as its matte source", async () => {
    const user = userEvent.setup();
    renderInspector();
    const target = makeClip({
      name: "target",
      sourceType: "imported",
      mediaType: "video",
      durationMs: 2000
    });
    const source = makeClip({
      name: "matte-source",
      sourceType: "imported",
      mediaType: "shape",
      durationMs: 2000
    });
    seed([target, source], [target.id]);

    await openSection(user, "Matte");
    await pickOption(user, /matte source clip/i, /^matte-source$/i);

    expect(clipById(target.id)?.matte).toEqual({
      sourceClipId: source.id,
      mode: "alpha",
      invert: undefined
    });

    await pickOption(user, /matte mode/i, /^luma$/i);
    expect(clipById(target.id)?.matte?.mode).toBe("luma");
  });
});

describe("Effects section", () => {
  it("adds an effect, edits a field, and removes it", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clip = seedVideoClip();

    await openSection(user, "Effects");
    await pickOption(user, /new effect type/i, /^drop shadow$/i);
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    expect(clipById(clip.id)?.effects).toEqual([
      expect.objectContaining({ type: "dropShadow", enabled: true, blur: 12 })
    ]);

    await commitField(user, /drop shadow blur/i, "30");
    expect(clipById(clip.id)?.effects?.[0]).toEqual(
      expect.objectContaining({ blur: 30 })
    );

    await user.click(
      screen.getByRole("button", { name: /remove drop shadow effect/i })
    );
    expect(clipById(clip.id)?.effects).toEqual([]);
  });

  it("reorders the chain with the move buttons", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clip = seedVideoClip({
      effects: [
        { id: "a", type: "vignette", enabled: true, amount: 0.4, softness: 0.5 },
        { id: "b", type: "sharpen", enabled: true, amount: 0.5 }
      ]
    });

    await openSection(user, "Effects");
    await user.click(screen.getByRole("button", { name: /move sharpen up/i }));

    expect(clipById(clip.id)?.effects?.map((e) => e.id)).toEqual(["b", "a"]);
  });
});

describe("Text section", () => {
  it("edits the new text-style fields", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clip = seedVideoClip({
      mediaType: "text",
      textStyle: {
        text: "Title",
        fontSizePx: 72,
        color: "#ffffff",
        align: "center"
      }
    });

    await openSection(user, "Text");
    await commitField(user, /text letter spacing/i, "4");
    expect(clipById(clip.id)?.textStyle?.letterSpacingPx).toBe(4);

    await pickOption(user, /text vertical alignment/i, /^top$/i);
    expect(clipById(clip.id)?.textStyle?.verticalAlign).toBe("top");

    await user.click(screen.getByRole("switch", { name: /^stroke$/i }));
    expect(clipById(clip.id)?.textStyle?.stroke).toEqual({
      color: "#000000",
      widthPx: 2
    });

    await pickOption(user, /text fill type/i, /^linear gradient$/i);
    expect(clipById(clip.id)?.textStyle?.fill).toEqual(
      expect.objectContaining({ type: "linear", angle: 0 })
    );
  });
});

describe("Shape section", () => {
  it("edits the geometry and stroke of a shape clip", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clip = seedVideoClip({
      mediaType: "shape",
      shapeStyle: { kind: "rect", fill: "#ff0000", x: 0, y: 0, width: 1, height: 1 }
    });

    await openSection(user, "Shape");
    await pickOption(user, /shape kind/i, /^star$/i);
    expect(clipById(clip.id)?.shapeStyle?.kind).toBe("star");

    await commitField(user, /shape point count/i, "6");
    expect(clipById(clip.id)?.shapeStyle?.sides).toBe(6);

    await commitField(user, /shape dash pattern/i, "0.02, 0.01");
    expect(clipById(clip.id)?.shapeStyle?.dash).toEqual([0.02, 0.01]);
  });
});

describe("Custom animation curves", () => {
  it("adds a keyframe animation and edits a keyframe", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clip = seedVideoClip();

    await openSection(user, "Animate");
    await pickOption(user, /new animation preset/i, /custom \(keyframes\)/i);
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    expect(clipById(clip.id)?.animations?.[0]).toEqual(
      expect.objectContaining({
        preset: "custom",
        custom: {
          curves: [
            {
              property: "opacity",
              keyframes: [
                { t: 0, value: 0 },
                { t: 1, value: 1 }
              ]
            }
          ]
        }
      })
    );

    await pickOption(user, /in curve 1 property/i, /^rotation$/i);
    expect(clipById(clip.id)?.animations?.[0].custom?.curves[0].property).toBe(
      "rotation"
    );

    await commitField(user, /in curve 1 keyframe 2 value/i, "3.14");
    expect(
      clipById(clip.id)?.animations?.[0].custom?.curves[0].keyframes[1].value
    ).toBe(3.14);

    await commitField(user, /in curve 1 keyframe 2 easing/i, "spring(180,12,1)");
    expect(
      clipById(clip.id)?.animations?.[0].custom?.curves[0].keyframes[1].easing
    ).toBe("spring(180,12,1)");
  });
});

describe("Group selected clips", () => {
  it("creates a group clip and parents the selection to it", async () => {
    const user = userEvent.setup();
    renderInspector();
    const first = makeClip({
      name: "a",
      sourceType: "imported",
      mediaType: "video",
      startMs: 500,
      durationMs: 1000
    });
    const second = makeClip({
      name: "b",
      sourceType: "imported",
      mediaType: "video",
      startMs: 2000,
      durationMs: 1000
    });
    seed([first, second], [first.id, second.id]);

    await user.click(
      screen.getByRole("button", { name: /group selected clips/i })
    );

    const group = useTimelineStore
      .getState()
      .clips.find((c) => c.mediaType === "group");
    expect(group).toEqual(
      expect.objectContaining({ startMs: 500, durationMs: 2500 })
    );
    expect(clipById(first.id)?.parentId).toBe(group?.id);
    expect(clipById(second.id)?.parentId).toBe(group?.id);
  });
});
