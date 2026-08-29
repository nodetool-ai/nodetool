/**
 * The cut's half of the board ↔ cut link: a clip that came from a shot names
 * it and jumps back with that shot selected.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { TimelineClip } from "@nodetool-ai/timeline";
import mockTheme from "../../../../__mocks__/themeMock";

/** Board served over trpc, i.e. one that is not open in a tab. */
jest.mock("../../../../trpc/client", () => ({
  trpc: {
    storyboards: {
      get: {
        useQuery: (_input: { id: string }, options?: { enabled?: boolean }) =>
          options?.enabled
            ? {
                data: {
                  id: "board-1",
                  name: "Aurora board",
                  document: {
                    shots: [
                      {
                        type: "shot",
                        id: "shot-1",
                        index: 2,
                        slug: "Doorway",
                        action: "A closed door",
                        status: "rendered"
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

import ClipStoryboardLink from "../ClipStoryboardLink";
import { useStoryboardStore } from "../../../../stores/storyboard/StoryboardStore";
import { useWorkspaceTabsStore } from "../../../../stores/WorkspaceTabsStore";
import { useDocumentFocusStore } from "../../../../stores/DocumentFocusStore";

const clip = (overrides: Partial<TimelineClip> = {}): TimelineClip =>
  ({
    id: "clip-1",
    trackId: "track-1",
    name: "Doorway",
    startMs: 12_000,
    durationMs: 4000,
    mediaType: "video",
    sourceType: "imported",
    status: "generated",
    locked: false,
    versions: [],
    ...overrides
  }) as TimelineClip;

const renderLink = (c: TimelineClip) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ClipStoryboardLink clip={c} />
    </ThemeProvider>
  );

describe("ClipStoryboardLink", () => {
  beforeEach(() => {
    useWorkspaceTabsStore.setState({ tabs: [], activeTabId: null });
    useStoryboardStore.setState({ boards: {} });
    useDocumentFocusStore.setState({ pending: null });
  });

  it("shows nothing for a clip that came from no shot", () => {
    const { container } = renderLink(clip());
    expect(container).toBeEmptyDOMElement();
  });

  it("names the shot and opens the board on it", async () => {
    renderLink(
      clip({ storyboardBoardId: "board-1", storyboardShotId: "shot-1" })
    );

    await userEvent.click(screen.getByText("from Board · SH 03"));

    const tabs = useWorkspaceTabsStore.getState().tabs;
    expect(
      tabs.some((t) => t.type === "storyboard" && t.ref === "board-1")
    ).toBe(true);
    // The board is not open yet, so the shot rides along as a focus request
    // the board applies once it has loaded.
    expect(useDocumentFocusStore.getState().pending).toEqual({
      type: "storyboard",
      ref: "board-1",
      shotId: "shot-1"
    });
  });

  it("shows nothing while the board carries no such shot", () => {
    const { container } = renderLink(
      clip({ storyboardBoardId: "board-1", storyboardShotId: "shot-gone" })
    );
    expect(container).toBeEmptyDOMElement();
  });
});
