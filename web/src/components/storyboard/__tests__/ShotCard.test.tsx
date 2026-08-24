import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { Shot, ShotStatus } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";

// Keep the card's generation hook and image ladder out of the render — this test
// only asserts the card's presentation and button gating, not generation.
const generateRevisedClipMock = jest.fn(async () => undefined);
// Media sources resolve through TanStack Query; these suites render no
// QueryClientProvider, so use the manual mock (resolution itself is covered
// by hooks/__tests__/useResolvedMediaUri.test.tsx).
jest.mock("../../../hooks/useResolvedMediaUri");

// The fullscreen viewer is the asset explorer's, which pulls in routing and
// server state; stub it and assert what the card hands it.
jest.mock("../../assets/AssetViewer", () => ({
  __esModule: true,
  default: ({ url, contentType }: { url: string; contentType: string }) => (
    <div data-testid="asset-viewer">{`${contentType}:${url}`}</div>
  )
}));

jest.mock("../../../hooks/storyboard/useGenerateShot", () => ({
  useGenerateShot: () => ({
    generateKeyframe: jest.fn(async () => undefined),
    generateClip: jest.fn(async () => undefined),
    generateRevisedClip: generateRevisedClipMock
  })
}));

const moveShotMock = jest.fn();
const removeShotMock = jest.fn();
const updateShotMock = jest.fn();
/** Script the board links, if any — set per test before rendering. */
let linkedScriptId: string | null = null;
jest.mock("../../../stores/storyboard/StoryboardStore", () => {
  const actual = jest.requireActual(
    "../../../stores/storyboard/StoryboardStore"
  );
  return {
    ...actual,
    // Serve the actions the card reads via selectors; keep sameMediaRef and the
    // other real exports (the nested takes gallery uses them).
    useStoryboardStore: <T,>(selector: (s: unknown) => T) =>
      selector({
        toggleShotEntity: jest.fn(),
        moveShot: moveShotMock,
        removeShot: removeShotMock,
        updateShot: updateShotMock,
        selectKeyframeVersion: jest.fn(),
        selectClipVersion: jest.fn(),
        boards: {
          "board-1": {
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
    }
  },
  trpcClient: {}
}));

jest.mock("../../node/ImageRefPreview", () => ({
  __esModule: true,
  default: ({ placeholder }: { placeholder?: React.ReactNode }) => (
    <div data-testid="image-preview">{placeholder}</div>
  )
}));

// The entity chips resolve the library through React Query; an empty library
// keeps them out of these presentation tests.
jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: [] })
}));

import ShotCard from "../ShotCard";
import { useStoryboardGenerationStore } from "../../../stores/storyboard/StoryboardGenerationStore";

const makeShot = (overrides: Partial<Shot> = {}): Shot => ({
  type: "shot",
  id: "shot-1",
  index: 0,
  slug: "Opening",
  action: "A lighthouse at dusk",
  status: "planned",
  ...overrides
});

const renderCard = (shot: Shot, props: Partial<React.ComponentProps<typeof ShotCard>> = {}) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ShotCard boardId="board-1" shot={shot} {...props} />
    </ThemeProvider>
  );

describe("ShotCard", () => {
  beforeEach(() => {
    moveShotMock.mockClear();
    removeShotMock.mockClear();
    updateShotMock.mockClear();
    linkedScriptId = null;
    lineIsVoiced = true;
  });

  it("shows why the last render failed", () => {
    // Seed the job state directly: this suite mocks the storyboard store, so
    // the action that would write it has nothing to write to.
    useStoryboardGenerationStore.setState({
      shotJobs: {
        "shot-1": {
          shotId: "shot-1",
          boardId: "board-1",
          jobId: "job-1",
          workflowId: "wf",
          kind: "keyframe",
          status: "failed",
          errorMessage: "Out of credits"
        }
      }
    });
    renderCard(makeShot({ status: "failed" }));
    expect(screen.getByTestId("shot-render-error")).toHaveTextContent(
      "Out of credits"
    );
    useStoryboardGenerationStore.setState({ shotJobs: {} });
  });

  it("falls back to a generic reason when the job state is gone", () => {
    renderCard(makeShot({ status: "failed" }));
    expect(screen.getByTestId("shot-render-error")).toHaveTextContent(
      "The render failed. Try again."
    );
  });

  it("renders the shot action and status label", () => {
    renderCard(makeShot());
    expect(screen.getByText("A lighthouse at dusk")).toBeInTheDocument();
    expect(screen.getByText("Planned")).toBeInTheDocument();
    expect(screen.getByText("1. Opening")).toBeInTheDocument();
  });

  it("gates buttons for a planned shot with no keyframe", () => {
    renderCard(makeShot({ status: "planned" }));
    expect(
      screen.getByRole("button", { name: "Generate still" })
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Generate clip" })
    ).toBeDisabled();
  });

  it("enables Generate clip as soon as a still is ready", () => {
    const shot = makeShot({
      status: "keyframe_ready",
      keyframe: { type: "image", uri: "http://example.com/still.png" }
    });
    renderCard(shot);
    // With a keyframe present, the still button offers another take.
    expect(screen.getByRole("button", { name: "New still" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Generate clip" })).toBeEnabled();
  });

  it("treats the legacy approved status as a ready still", () => {
    const shot = makeShot({
      status: "approved",
      keyframe: { type: "image", uri: "http://example.com/still.png" }
    });
    renderCard(shot);
    expect(screen.getByText("Still ready")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate clip" })).toBeEnabled();
  });

  it("shows Revise clip only once a clip exists and collects an instruction in a dialog", async () => {
    generateRevisedClipMock.mockClear();
    // No clip yet: the revise affordance is absent.
    const { unmount } = renderCard(makeShot({ status: "keyframe_ready" }));
    expect(
      screen.queryByRole("button", { name: "Revise clip" })
    ).not.toBeInTheDocument();
    unmount();

    const shot = makeShot({
      status: "rendered",
      clip: { type: "video", uri: "http://example.com/clip.mp4" }
    });
    renderCard(shot);
    await userEvent.click(screen.getByRole("button", { name: "Revise clip" }));

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
    renderCard(makeShot(), { isFirst: false, isLast: false });
    await userEvent.click(screen.getByRole("button", { name: "Move shot up" }));
    expect(moveShotMock).toHaveBeenCalledWith("board-1", "shot-1", "up");
    await userEvent.click(
      screen.getByRole("button", { name: "Move shot down" })
    );
    expect(moveShotMock).toHaveBeenCalledWith("board-1", "shot-1", "down");
  });

  it("disables move-up on the first shot and move-down on the last", () => {
    renderCard(makeShot(), { isFirst: true, isLast: true });
    expect(screen.getByRole("button", { name: "Move shot up" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Move shot down" })
    ).toBeDisabled();
  });

  it("deletes a shot only after confirming", async () => {
    renderCard(makeShot());
    await userEvent.click(screen.getByRole("button", { name: "Delete shot" }));
    // Nothing removed until the confirmation is accepted.
    expect(removeShotMock).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(removeShotMock).toHaveBeenCalledWith("board-1", "shot-1");
  });

  it("opens the still fullscreen from the preview", async () => {
    renderCard(
      makeShot({
        status: "keyframe_ready",
        keyframe: { type: "image", uri: "asset://img-9", asset_id: "img-9" }
      })
    );

    await userEvent.click(
      screen.getByRole("button", { name: "View still fullscreen" })
    );

    expect(screen.getByTestId("asset-viewer")).toHaveTextContent(
      "image/*:https://assets.test/img-9"
    );
  });

  it("opens the clip fullscreen once the shot is rendered", async () => {
    renderCard(
      makeShot({
        status: "rendered",
        keyframe: { type: "image", uri: "asset://img-9", asset_id: "img-9" },
        clip: { type: "video", uri: "asset://vid-9", asset_id: "vid-9" }
      })
    );

    await userEvent.click(
      screen.getByRole("button", { name: "View clip fullscreen" })
    );

    expect(screen.getByTestId("asset-viewer")).toHaveTextContent(
      "video/*:https://assets.test/vid-9"
    );
  });

  it("offers no fullscreen viewer for a shot with no media", () => {
    renderCard(makeShot());
    expect(
      screen.queryByRole("button", { name: /fullscreen/i })
    ).not.toBeInTheDocument();
  });

  it("hides the management controls in read-only mode", () => {
    renderCard(makeShot(), { readOnly: true });
    expect(
      screen.queryByRole("button", { name: "Move shot up" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete shot" })
    ).not.toBeInTheDocument();
  });

  it("disables the still button while generating", () => {
    const statuses: ShotStatus[] = ["keyframe_generating", "clip_generating"];
    for (const status of statuses) {
      const { unmount } = renderCard(makeShot({ status }));
      expect(
        screen.getByRole("button", { name: /Generate still|New still/ })
      ).toBeDisabled();
      unmount();
    }
  });
});

describe("ShotCard duration source", () => {
  const linkedShot = (overrides: Partial<Shot> = {}): Shot =>
    makeShot({ duration_seconds: 8, script_line_ids: ["line-1"], ...overrides });

  beforeEach(() => {
    updateShotMock.mockClear();
    linkedScriptId = "script-1";
    lineIsVoiced = true;
  });

  it("shows the audio-derived length for a linked, voiced shot", () => {
    renderCard(linkedShot());
    // 3400 ms + 250 ms of silence, rounded up to whole seconds.
    expect(screen.getByText("4s · from takes")).toBeInTheDocument();
  });

  it("shows the shot's own length when it is pinned to manual", () => {
    renderCard(linkedShot({ duration_source: "manual" }));
    expect(screen.getByText("8s · manual")).toBeInTheDocument();
  });

  it("falls back to the shot's own length while the line is unvoiced", () => {
    lineIsVoiced = false;
    renderCard(linkedShot());
    expect(screen.getByText("8s · manual")).toBeInTheDocument();
  });

  it("shows nothing for a shot that covers no script lines", () => {
    renderCard(makeShot({ duration_seconds: 8 }));
    expect(screen.queryByText(/from takes|manual/)).not.toBeInTheDocument();
  });

  it("toggles the source through the store", async () => {
    renderCard(linkedShot());
    await userEvent.click(screen.getByText("4s · from takes"));
    expect(updateShotMock).toHaveBeenCalledWith("board-1", "shot-1", {
      duration_source: "manual"
    });
  });

  it("does not toggle in read-only mode", async () => {
    renderCard(linkedShot(), { readOnly: true });
    await userEvent.click(screen.getByText("4s · from takes"));
    expect(updateShotMock).not.toHaveBeenCalled();
  });
});
