import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { Shot } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";

const generateKeyframeMock = jest.fn(async () => undefined);
const generateClipMock = jest.fn(async () => undefined);
const generateRevisedClipMock = jest.fn(async () => undefined);
jest.mock("../../../hooks/storyboard/useGenerateShot", () => ({
  useGenerateShot: () => ({
    generateKeyframe: generateKeyframeMock,
    generateClip: generateClipMock,
    generateRevisedClip: generateRevisedClipMock
  })
}));

const moveShotMock = jest.fn();
const removeShotMock = jest.fn();
const updateShotMock = jest.fn();
const removeKeyframeVersionMock = jest.fn();
const removeClipVersionMock = jest.fn();
/** Script the board links, if any — set per test before rendering. */
let linkedScriptId: string | null = null;
/** Assembled cut the board links, if any — set per test before rendering. */
let linkedTimelineId: string | null = null;
jest.mock("../../../stores/storyboard/StoryboardStore", () => {
  const actual = jest.requireActual(
    "../../../stores/storyboard/StoryboardStore"
  );
  return {
    ...actual,
    // Serve the actions the inspector reads via selectors; keep sameMediaRef
    // and the other real exports.
    useStoryboardStore: <T,>(selector: (s: unknown) => T) =>
      selector({
        toggleShotEntity: jest.fn(),
        moveShot: moveShotMock,
        removeShot: removeShotMock,
        updateShot: updateShotMock,
        removeKeyframeVersion: removeKeyframeVersionMock,
        removeClipVersion: removeClipVersionMock,
        boards: {
          "board-1": {
            entityIds: [],
            timelineId: linkedTimelineId,
            screenplay: linkedScriptId ? { script_id: linkedScriptId } : null
          }
        }
      })
  };
});

/** The linked script: one line, voiced with a 3.4 s take plus 250 ms silence. */
let lineIsVoiced = true;
jest.mock("../../../trpc/client", () => ({
  trpc: {
    scripts: {
      get: {
        useQuery: (_input: { id: string }, options?: { enabled?: boolean }) =>
          options?.enabled
            ? {
                data: {
                  document: {
                    cast: [],
                    sections: [
                      {
                        id: "sec1",
                        lines: [
                          {
                            id: "line-1",
                            text: "We are closed.",
                            pauseAfterMs: 250,
                            currentTakeId: lineIsVoiced ? "take-1" : null,
                            takes: lineIsVoiced
                              ? [
                                  {
                                    id: "take-1",
                                    assetId: "audio-1",
                                    durationMs: 3400,
                                    words: [],
                                    textSnapshot: "We are closed.",
                                    voiceSnapshot: null,
                                    createdAt: "2026-01-01T00:00:00.000Z"
                                  }
                                ]
                              : []
                          }
                        ]
                      }
                    ]
                  }
                }
              }
            : { data: undefined }
      }
    },
    timeline: {
      get: {
        useQuery: (_input: { id: string }, options?: { enabled?: boolean }) =>
          options?.enabled
            ? {
                data: {
                  id: "timeline-1",
                  name: "Aurora cut",
                  clips: [
                    {
                      id: "clip-shot-1",
                      mediaType: "video",
                      startMs: 12_000,
                      storyboardBoardId: "board-1",
                      storyboardShotId: "shot-1"
                    },
                    // The shot's audio twin and the voiceover clip covering it
                    // carry the same shot keys; neither is the shot's clip.
                    {
                      id: "clip-shot-1-audio",
                      mediaType: "audio",
                      startMs: 12_000,
                      storyboardBoardId: "board-1",
                      storyboardShotId: "shot-1"
                    },
                    {
                      id: "clip-vo-1",
                      mediaType: "video",
                      startMs: 12_500,
                      storyboardBoardId: "board-1",
                      storyboardShotId: "shot-1",
                      scriptLineId: "line-1"
                    }
                  ]
                }
              }
            : { data: undefined }
      }
    }
  },
  trpcClient: {}
}));

// The entity chips resolve the library through React Query; an empty library
// keeps them out of these tests.
jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: [] })
}));

// Both have their own suites and reach further into the script store than
// this one needs.
const stub = (name: string) => ({
  __esModule: true,
  default: () => <div data-testid={name} />
});
jest.mock("../ShotTakesGallery", () => stub("takes-gallery"));
jest.mock("../ShotScriptPanel", () => stub("script-panel"));

import ShotInspector from "../ShotInspector";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";
import { useDocumentFocusStore } from "../../../stores/DocumentFocusStore";

const makeShot = (overrides: Partial<Shot> = {}): Shot => ({
  type: "shot",
  id: "shot-1",
  index: 0,
  slug: "Opening",
  action: "A lighthouse at dusk",
  status: "planned",
  ...overrides
});

const renderInspector = (
  shot: Shot,
  props: Partial<React.ComponentProps<typeof ShotInspector>> = {}
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ShotInspector boardId="board-1" shot={shot} {...props} />
    </ThemeProvider>
  );

describe("ShotInspector", () => {
  beforeEach(() => {
    moveShotMock.mockClear();
    removeShotMock.mockClear();
    updateShotMock.mockClear();
    removeKeyframeVersionMock.mockClear();
    removeClipVersionMock.mockClear();
    generateClipMock.mockClear();
    linkedScriptId = null;
    lineIsVoiced = true;
  });

  it("names the selected shot and shows its status", () => {
    renderInspector(makeShot({ index: 4 }));
    expect(screen.getByText("SH 05 selected")).toBeInTheDocument();
    expect(screen.getByText("5.")).toBeInTheDocument();
    expect(screen.getByLabelText("Shot title")).toHaveValue("Opening");
    expect(screen.getByText("Planned")).toBeInTheDocument();
    expect(screen.getByLabelText("Shot description")).toHaveValue(
      "A lighthouse at dusk"
    );
  });

  it("drops an uncommitted draft when the caller keys the inspector by shot id", async () => {
    // Regression for F13: StoryboardBoard renders the inspector with
    // `key={activeShot.id}`, forcing a fresh mount rather than reusing
    // `useShotTextField`'s draft state across a shot swap.
    const shotA = makeShot({ id: "shot-a", action: "Shot A action" });
    const shotB = makeShot({ id: "shot-b", action: "Shot B action" });
    const { rerender } = render(
      <ThemeProvider theme={mockTheme}>
        <ShotInspector key={shotA.id} boardId="board-1" shot={shotA} />
      </ThemeProvider>
    );

    const field = screen.getByLabelText("Shot description");
    await userEvent.clear(field);
    await userEvent.type(field, "Uncommitted draft");
    expect(field).toHaveValue("Uncommitted draft");

    updateShotMock.mockClear();
    rerender(
      <ThemeProvider theme={mockTheme}>
        <ShotInspector key={shotB.id} boardId="board-1" shot={shotB} />
      </ThemeProvider>
    );

    // A fresh mount shows shot B's own value, not shot A's leaked draft, and
    // the swap must not have silently committed the draft onto shot B.
    expect(screen.getByLabelText("Shot description")).toHaveValue(
      "Shot B action"
    );
    expect(updateShotMock).not.toHaveBeenCalled();
  });

  it("treats the legacy approved status as a ready still", () => {
    renderInspector(
      makeShot({
        status: "approved",
        keyframe: { type: "image", uri: "http://example.com/still.png" }
      })
    );
    expect(screen.getByText("Still ready")).toBeInTheDocument();
  });

  it("gates the clip render until the shot has a still", () => {
    const { unmount } = renderInspector(makeShot());
    expect(screen.getByRole("button", { name: "Render clip" })).toBeDisabled();
    unmount();

    renderInspector(
      makeShot({
        status: "keyframe_ready",
        keyframe: { type: "image", uri: "http://example.com/still.png" }
      })
    );
    expect(screen.getByRole("button", { name: "Render clip" })).toBeEnabled();
  });

  it("re-renders the clip from the selection footer", async () => {
    const shot = makeShot({
      status: "rendered",
      keyframe: { type: "image", uri: "http://example.com/still.png" },
      clip: { type: "video", uri: "http://example.com/clip.mp4" }
    });
    renderInspector(shot);

    await userEvent.click(
      screen.getByRole("button", { name: "Re-render clip" })
    );
    expect(generateClipMock).toHaveBeenCalledWith("board-1", shot);
  });

  it("offers another still once one exists", () => {
    renderInspector(
      makeShot({
        status: "keyframe_ready",
        keyframe: { type: "image", uri: "http://example.com/still.png" }
      })
    );
    expect(screen.getByRole("button", { name: "New still" })).toBeEnabled();
  });

  it("collects a revise instruction in a dialog, and only with a clip", async () => {
    generateRevisedClipMock.mockClear();
    const { unmount } = renderInspector(makeShot({ status: "keyframe_ready" }));
    expect(screen.getByRole("button", { name: "Revise take" })).toBeDisabled();
    unmount();

    const shot = makeShot({
      status: "rendered",
      clip: { type: "video", uri: "http://example.com/clip.mp4" }
    });
    renderInspector(shot);
    await userEvent.click(screen.getByRole("button", { name: "Revise take" }));

    // The dialog opens; confirm is gated until an instruction is typed.
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Revise" });
    expect(confirm).toBeDisabled();

    await userEvent.type(
      within(dialog).getByRole("textbox"),
      "make it darker, add rain"
    );
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);

    expect(generateRevisedClipMock).toHaveBeenCalledWith(
      "board-1",
      shot,
      "make it darker, add rain"
    );
  });

  it("reorders a shot with the move controls", async () => {
    renderInspector(makeShot(), { isFirst: false, isLast: false });
    await userEvent.click(screen.getByRole("button", { name: "Move shot up" }));
    expect(moveShotMock).toHaveBeenCalledWith("board-1", "shot-1", "up");
    await userEvent.click(
      screen.getByRole("button", { name: "Move shot down" })
    );
    expect(moveShotMock).toHaveBeenCalledWith("board-1", "shot-1", "down");
  });

  it("disables move-up on the first shot and move-down on the last", () => {
    renderInspector(makeShot(), { isFirst: true, isLast: true });
    expect(screen.getByRole("button", { name: "Move shot up" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Move shot down" })
    ).toBeDisabled();
  });

  it("deletes a shot only after confirming", async () => {
    renderInspector(makeShot());
    await userEvent.click(screen.getByRole("button", { name: "Delete shot" }));
    // Nothing removed until the confirmation is accepted.
    expect(removeShotMock).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" })
    );
    expect(removeShotMock).toHaveBeenCalledWith("board-1", "shot-1");
  });

  it("keeps the destructive take actions in the overflow menu", async () => {
    renderInspector(
      makeShot({
        status: "rendered",
        keyframe: { type: "image", uri: "http://example.com/still.png" },
        clip: { type: "video", uri: "http://example.com/clip.mp4" }
      })
    );

    // The action row stays short: removals live behind the overflow.
    expect(
      screen.queryByRole("menuitem", { name: "Remove still" })
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "More shot actions" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Remove still" })
    );
    expect(removeKeyframeVersionMock).toHaveBeenCalledWith(
      "board-1",
      "shot-1",
      0
    );

    await userEvent.click(
      screen.getByRole("button", { name: "More shot actions" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Remove clip" })
    );
    expect(removeClipVersionMock).toHaveBeenCalledWith("board-1", "shot-1", 0);
  });

  it("offers no overflow menu before a shot has any media", () => {
    renderInspector(makeShot());
    expect(
      screen.queryByRole("button", { name: "More shot actions" })
    ).not.toBeInTheDocument();
  });

  it("hides the management controls in read-only mode", () => {
    renderInspector(makeShot(), { readOnly: true });
    expect(
      screen.queryByRole("button", { name: "Move shot up" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete shot" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Re-render clip" })
    ).not.toBeInTheDocument();
  });
});

describe("ShotInspector cross-document links", () => {
  beforeEach(() => {
    linkedScriptId = null;
    linkedTimelineId = null;
    lineIsVoiced = true;
    useWorkspaceTabsStore.setState({ tabs: [], activeTabId: null });
    useDocumentFocusStore.setState({ pending: null });
  });

  it("says nothing appears elsewhere for an unlinked shot", () => {
    renderInspector(makeShot());
    expect(screen.getByText("nothing yet")).toBeInTheDocument();
  });

  it("links to the script line the shot covers, and opens it there", async () => {
    linkedScriptId = "script-1";
    renderInspector(makeShot({ script_line_ids: ["line-1"] }));

    const chip = screen.getByText("Script · line 1");
    await userEvent.click(chip);

    const tabs = useWorkspaceTabsStore.getState().tabs;
    expect(tabs.some((t) => t.type === "script" && t.ref === "script-1")).toBe(
      true
    );
    expect(useDocumentFocusStore.getState().pending).toEqual({
      type: "script",
      ref: "script-1",
      lineId: "line-1"
    });
  });

  it("links to the clip the shot owns in the cut, at its timecode", async () => {
    linkedTimelineId = "timeline-1";
    renderInspector(makeShot());

    await userEvent.click(screen.getByText("Aurora cut at 00:12"));

    const tabs = useWorkspaceTabsStore.getState().tabs;
    expect(
      tabs.some((t) => t.type === "timeline" && t.ref === "timeline-1")
    ).toBe(true);
    // The shot's own clip — not its audio twin, not a voiceover clip covering
    // it — is the one the cut is opened on.
    expect(useDocumentFocusStore.getState().pending).toEqual({
      type: "timeline",
      ref: "timeline-1",
      clipId: "clip-shot-1"
    });
  });

  it("omits the cut chip while the board carries no shot clip there", () => {
    linkedTimelineId = "timeline-1";
    renderInspector(makeShot({ id: "shot-2" }));
    expect(screen.queryByText(/Aurora cut at/)).not.toBeInTheDocument();
    expect(screen.getByText("nothing yet")).toBeInTheDocument();
  });
});

describe("ShotInspector duration source", () => {
  const linkedShot = (overrides: Partial<Shot> = {}): Shot =>
    makeShot({
      duration_seconds: 8,
      script_line_ids: ["line-1"],
      ...overrides
    });

  beforeEach(() => {
    updateShotMock.mockClear();
    linkedScriptId = "script-1";
    lineIsVoiced = true;
  });

  it("shows the audio-derived length for a linked, voiced shot", () => {
    renderInspector(linkedShot());
    expect(screen.getByText("from takes")).toBeInTheDocument();
    // 3400 ms + 250 ms of silence, rounded up to whole seconds.
    expect(screen.getByLabelText("Clip length in seconds")).toHaveAttribute(
      "placeholder",
      "4"
    );
  });

  it("shows the shot's own length when it is pinned to manual", () => {
    renderInspector(linkedShot({ duration_source: "manual" }));
    expect(screen.getByText("pinned")).toBeInTheDocument();
    expect(screen.getByLabelText("Clip length in seconds")).toHaveValue(8);
  });

  it("falls back to the shot's own length while the line is unvoiced", () => {
    lineIsVoiced = false;
    renderInspector(linkedShot());
    expect(screen.getByText("pinned")).toBeInTheDocument();
  });

  it("shows nothing for a shot that covers no script lines", () => {
    linkedScriptId = null;
    renderInspector(makeShot({ duration_seconds: 8 }));
    expect(screen.queryByText(/from takes|pinned/)).not.toBeInTheDocument();
  });

  it("toggles the source through the store", async () => {
    renderInspector(linkedShot());
    await userEvent.click(screen.getByText("from takes"));
    expect(updateShotMock).toHaveBeenCalledWith("board-1", "shot-1", {
      duration_source: "manual"
    });
  });

  it("offers no toggle in read-only mode", () => {
    renderInspector(linkedShot(), { readOnly: true });
    expect(screen.getByText("4s · from takes")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Clip length in seconds")
    ).not.toBeInTheDocument();
  });
});

describe("ShotInspector clip length", () => {
  beforeEach(() => {
    updateShotMock.mockClear();
    linkedScriptId = null;
    lineIsVoiced = true;
  });

  const lengthField = () => screen.getByLabelText("Clip length in seconds");

  it("writes a typed length to the shot", async () => {
    renderInspector(makeShot({ duration_seconds: 4 }));
    const field = lengthField();
    await userEvent.clear(field);
    await userEvent.type(field, "9");
    await userEvent.tab();

    expect(updateShotMock).toHaveBeenLastCalledWith("board-1", "shot-1", {
      duration_seconds: 9
    });
  });

  it("clears the length back to the model default", async () => {
    renderInspector(makeShot({ duration_seconds: 4 }));
    await userEvent.clear(lengthField());
    await userEvent.tab();

    expect(updateShotMock).toHaveBeenLastCalledWith("board-1", "shot-1", {
      duration_seconds: undefined,
      duration_source: "audio"
    });
  });

  it("un-pins a linked shot when its length is cleared, so it derives from takes again", async () => {
    linkedScriptId = "script-1";
    renderInspector(
      makeShot({
        duration_seconds: 6,
        duration_source: "manual",
        script_line_ids: ["line-1"]
      })
    );
    await userEvent.clear(lengthField());
    await userEvent.tab();

    expect(updateShotMock).toHaveBeenLastCalledWith("board-1", "shot-1", {
      duration_seconds: undefined,
      duration_source: "audio"
    });
  });

  it("pins a linked shot to its own length when one is typed", async () => {
    linkedScriptId = "script-1";
    renderInspector(
      makeShot({ duration_seconds: 4, script_line_ids: ["line-1"] })
    );
    const field = lengthField();
    await userEvent.clear(field);
    await userEvent.type(field, "6");
    await userEvent.tab();

    expect(updateShotMock).toHaveBeenLastCalledWith("board-1", "shot-1", {
      duration_seconds: 6,
      duration_source: "manual"
    });
  });

  it("rejects a length that is not a positive number", async () => {
    renderInspector(makeShot({ duration_seconds: 4 }));
    const field = lengthField();
    await userEvent.clear(field);
    await userEvent.type(field, "-2");
    await userEvent.tab();

    expect(updateShotMock).not.toHaveBeenCalled();
  });

  it("shows the length as text in read-only mode", () => {
    renderInspector(makeShot({ duration_seconds: 4 }), { readOnly: true });
    expect(
      screen.queryByLabelText("Clip length in seconds")
    ).not.toBeInTheDocument();
    expect(screen.getByText("4s · manual")).toBeInTheDocument();
  });
});

describe("ShotInspector shot text", () => {
  beforeEach(() => {
    updateShotMock.mockClear();
    linkedScriptId = null;
  });

  it("writes a renamed title on blur", async () => {
    renderInspector(makeShot({ slug: "Opening" }));
    const title = screen.getByLabelText("Shot title");
    await userEvent.clear(title);
    await userEvent.type(title, "Lighthouse at dusk");
    await userEvent.tab();

    expect(updateShotMock).toHaveBeenLastCalledWith("board-1", "shot-1", {
      slug: "Lighthouse at dusk"
    });
  });

  it("writes an edited description on blur", async () => {
    renderInspector(makeShot());
    const action = screen.getByLabelText("Shot description");
    await userEvent.clear(action);
    await userEvent.type(action, "Waves break on the rocks");
    await userEvent.tab();

    expect(updateShotMock).toHaveBeenLastCalledWith("board-1", "shot-1", {
      action: "Waves break on the rocks"
    });
  });

  it("keeps the stored description when it is emptied", async () => {
    renderInspector(makeShot());
    await userEvent.clear(screen.getByLabelText("Shot description"));
    await userEvent.tab();

    expect(updateShotMock).not.toHaveBeenCalled();
  });

  it("drops an edit on Escape", async () => {
    renderInspector(makeShot({ slug: "Opening" }));
    const title = screen.getByLabelText("Shot title");
    await userEvent.type(title, " night");
    await userEvent.keyboard("{Escape}");
    await userEvent.tab();

    expect(updateShotMock).not.toHaveBeenCalled();
    expect(title).toHaveValue("Opening");
  });

  it("shows the title and description as text in read-only mode", () => {
    renderInspector(makeShot({ index: 4 }), { readOnly: true });
    expect(screen.getByText("5. Opening")).toBeInTheDocument();
    expect(screen.getByText("A lighthouse at dusk")).toBeInTheDocument();
    expect(screen.queryByLabelText("Shot title")).not.toBeInTheDocument();
  });
});

describe("ShotInspector camera selects", () => {
  beforeEach(() => {
    updateShotMock.mockClear();
    linkedScriptId = null;
  });

  it("picks a framing and keeps the shot's other camera parts", async () => {
    renderInspector(makeShot({ camera: { framing: "wide", lens: "28mm" } }));
    await userEvent.click(screen.getByLabelText("Framing"));
    await userEvent.click(screen.getByRole("option", { name: "close-up" }));

    expect(updateShotMock).toHaveBeenCalledWith("board-1", "shot-1", {
      camera: { framing: "close-up", lens: "28mm" }
    });
  });

  it("clears one camera part without touching the rest", async () => {
    renderInspector(
      makeShot({ camera: { framing: "wide", movement: "static" } })
    );
    await userEvent.click(screen.getByLabelText("Movement"));
    await userEvent.click(screen.getByRole("option", { name: "—" }));

    expect(updateShotMock).toHaveBeenCalledWith("board-1", "shot-1", {
      camera: { framing: "wide" }
    });
  });

  it("keeps a value the vocabulary does not carry", async () => {
    renderInspector(makeShot({ camera: { movement: "static then subtle" } }));
    await userEvent.click(screen.getByLabelText("Movement"));
    expect(
      screen.getByRole("option", { name: "static then subtle" })
    ).toBeInTheDocument();
  });

  it("reads the camera line as text in read-only mode", () => {
    renderInspector(makeShot({ camera: { framing: "wide", lens: "28mm" } }), {
      readOnly: true
    });
    expect(screen.getByText("wide · 28mm")).toBeInTheDocument();
    expect(screen.queryByLabelText("Framing")).not.toBeInTheDocument();
  });
});
