/**
 * The selection footer after P4: the selected shot's description, four actions
 * (`Edit`, `Iterate`, `Regenerate`, `Delete`), and cross-document chips. Every
 * editable field is asserted in `ShotEditDialog.test.tsx`.
 */
import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { Entity, Shot } from "@nodetool-ai/protocol";
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

let mockEntities: Entity[] = [];
jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: mockEntities })
}));

const removeShotMock = jest.fn();
/** Script the board links, if any — set per test before rendering. */
let linkedScriptId: string | null = null;
/** Assembled cut the board links, if any — set per test before rendering. */
let linkedTimelineId: string | null = null;
let boardEntityIds: string[] = [];
jest.mock("../../../stores/storyboard/StoryboardStore", () => {
  const actual = jest.requireActual(
    "../../../stores/storyboard/StoryboardStore"
  );
  return {
    ...actual,
    useStoryboardStore: <T,>(selector: (s: unknown) => T) =>
      selector({
        removeShot: removeShotMock,
        boards: {
          "board-1": {
            entityIds: boardEntityIds,
            timelineId: linkedTimelineId,
            screenplay: linkedScriptId ? { script_id: linkedScriptId } : null
          }
        }
      })
  };
});

/** The linked script: one line, so the script chip has a position to name. */
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
                            currentTakeId: null,
                            takes: []
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

// The dialog has its own suite and reaches much further into the board.
jest.mock("../ShotEditDialog", () => ({
  __esModule: true,
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="shot-edit-dialog" /> : null
}));

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

beforeEach(() => {
  removeShotMock.mockClear();
  generateKeyframeMock.mockClear();
  generateRevisedClipMock.mockClear();
  linkedScriptId = null;
  linkedTimelineId = null;
  boardEntityIds = [];
  mockEntities = [];
  useWorkspaceTabsStore.setState({ tabs: [], activeTabId: null });
  useDocumentFocusStore.setState({ pending: null });
});

describe("ShotInspector selection footer (PRD § 7.5)", () => {
  it("names the selected shot", () => {
    renderInspector(makeShot({ index: 4 }));
    expect(screen.getByText("SH 05 selected")).toBeInTheDocument();
  });

  it("shows the selected shot description", () => {
    renderInspector(makeShot({ action: "A lighthouse at dusk" }));
    expect(screen.getByText("A lighthouse at dusk")).toBeInTheDocument();
  });

  it("marks a named board entity in the selected shot description", () => {
    mockEntities = [
      {
        type: "entity",
        id: "entity-marta",
        kind: "character",
        name: "Marta",
        descriptor: "a keeper in an oilskin coat"
      }
    ];
    boardEntityIds = ["entity-marta"];

    renderInspector(makeShot({ action: "Marta climbs the lighthouse stair" }));

    expect(screen.getByTestId("shot-entity-chip")).toHaveTextContent("Marta");
    expect(screen.getByText(/climbs the lighthouse stair/)).toBeInTheDocument();
  });

  it("offers exactly the four actions P4 leaves here", () => {
    renderInspector(
      makeShot({ clip: { type: "video", uri: "http://example.com/clip.mp4" } })
    );
    for (const name of ["Edit", "Iterate", "Regenerate", "Delete"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    // The field editors moved into the dialog; none of them is here.
    expect(screen.queryByLabelText("Shot description")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Framing")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Clip length in seconds")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Move shot up" })
    ).not.toBeInTheDocument();
  });

  it("opens the Edit dialog from Edit", async () => {
    renderInspector(makeShot());
    expect(screen.queryByTestId("shot-edit-dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByTestId("shot-edit-dialog")).toBeInTheDocument();
  });

  it("renders a new still from Regenerate", async () => {
    const shot = makeShot();
    renderInspector(shot);
    await userEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(generateKeyframeMock).toHaveBeenCalledWith("board-1", shot);
  });

  it("collects an iterate instruction, and only with a clip", async () => {
    const { unmount } = renderInspector(makeShot({ status: "keyframe_ready" }));
    expect(screen.getByRole("button", { name: "Iterate" })).toBeDisabled();
    unmount();

    const shot = makeShot({
      status: "rendered",
      clip: { type: "video", uri: "http://example.com/clip.mp4" }
    });
    renderInspector(shot);
    await userEvent.click(screen.getByRole("button", { name: "Iterate" }));

    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Iterate" });
    expect(confirm).toBeDisabled();

    await userEvent.type(
      within(dialog).getByRole("textbox"),
      "make it darker, add rain"
    );
    await userEvent.click(confirm);

    expect(generateRevisedClipMock).toHaveBeenCalledWith(
      "board-1",
      shot,
      "make it darker, add rain"
    );
  });

  it("deletes a shot only after confirming", async () => {
    renderInspector(makeShot());
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(removeShotMock).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" })
    );
    expect(removeShotMock).toHaveBeenCalledWith("board-1", "shot-1");
  });

  it("hides every action in read-only mode", () => {
    renderInspector(makeShot(), { readOnly: true });
    for (const name of ["Edit", "Iterate", "Regenerate", "Delete"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });
});

describe("ShotInspector cross-document links", () => {
  it("says nothing appears elsewhere for an unlinked shot", () => {
    renderInspector(makeShot());
    expect(screen.getByText("nothing yet")).toBeInTheDocument();
  });

  it("links to the script line the shot covers, and opens it there", async () => {
    linkedScriptId = "script-1";
    renderInspector(makeShot({ script_line_ids: ["line-1"] }));

    await userEvent.click(screen.getByText("Script · line 1"));

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

    expect(useDocumentFocusStore.getState().pending).toEqual({
      type: "timeline",
      ref: "timeline-1",
      clipId: "clip-shot-1"
    });
  });
});
