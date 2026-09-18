/**
 * Reopening a timeline that is still mid-Video-flow.
 *
 * The `+ New` menu creates the sequence at stage `idea` and opens its tab
 * straight onto the flow; a refresh or a close loses nothing because the
 * stage on the document is the only thing read here. Anything but `done`
 * mounts the setup host, `done` (or no `setup` at all, for sequences saved
 * before the flow existed) mounts the editor, and view mode stays the
 * read-only player either way.
 */
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../../timeline/TimelineEditor", () => ({
  __esModule: true,
  default: () => <div data-testid="timeline-editor" />
}));
jest.mock("../../timeline/TimelinePlayer", () => ({
  __esModule: true,
  default: () => <div data-testid="timeline-player" />
}));
jest.mock("../../setup/video/VideoSetupHost", () => ({
  __esModule: true,
  default: () => <div data-testid="video-setup" />
}));

/** What `trpc.timeline.get.useQuery` reports. Set per test. */
const mockTimelineQuery: {
  value:
    | { isPending: true }
    | { isPending: false; isError: true }
    | { isPending: false; isError: false; stage: string | null };
} = { value: { isPending: false, isError: false, stage: "idea" } };

jest.mock("../../../trpc/client", () => ({
  trpc: {
    timeline: {
      get: {
        useQuery: () => {
          const state = mockTimelineQuery.value;
          if (state.isPending) {
            return { isPending: true, isError: false, data: undefined };
          }
          if (state.isError) {
            return { isPending: false, isError: true, data: undefined };
          }
          return {
            isPending: false,
            isError: false,
            data:
              state.stage === null
                ? { id: "seq-1" }
                : { id: "seq-1", setup: { stage: state.stage } }
          };
        }
      }
    }
  }
}));

import TimelineSurface from "../TimelineSurface";

const renderSurface = (mode: "view" | "edit" = "edit") =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineSurface refId="seq-1" mode={mode} active />
    </ThemeProvider>
  );

describe("TimelineSurface setup resume", () => {
  it("renders the flow for a sequence still in setup", () => {
    mockTimelineQuery.value = {
      isPending: false,
      isError: false,
      stage: "idea"
    };
    renderSurface();

    expect(screen.getByTestId("video-setup")).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-editor")).not.toBeInTheDocument();
  });

  it("renders the editor once the flow is done", () => {
    mockTimelineQuery.value = {
      isPending: false,
      isError: false,
      stage: "done"
    };
    renderSurface();

    expect(screen.getByTestId("timeline-editor")).toBeInTheDocument();
    expect(screen.queryByTestId("video-setup")).not.toBeInTheDocument();
  });

  it("renders the editor for a sequence saved before the flow existed", () => {
    mockTimelineQuery.value = {
      isPending: false,
      isError: false,
      stage: null
    };
    renderSurface();

    expect(screen.getByTestId("timeline-editor")).toBeInTheDocument();
  });

  it("keeps view mode on the player even mid-flow", () => {
    mockTimelineQuery.value = {
      isPending: false,
      isError: false,
      stage: "idea"
    };
    renderSurface("view");

    expect(screen.getByTestId("timeline-player")).toBeInTheDocument();
    expect(screen.queryByTestId("video-setup")).not.toBeInTheDocument();
  });

  it("renders neither surface while the sequence is loading", () => {
    mockTimelineQuery.value = { isPending: true };
    renderSurface();

    expect(screen.queryByTestId("video-setup")).not.toBeInTheDocument();
    expect(screen.queryByTestId("timeline-editor")).not.toBeInTheDocument();
  });
});
