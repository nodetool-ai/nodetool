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

/** Sequence ids of editor instances that unmounted. */
const mockUnmountedEditors: string[] = [];
jest.mock("../../timeline/TimelineEditor", () => {
  const { useEffect, useRef } =
    jest.requireActual<typeof import("react")>("react");
  const MockEditor = ({ sequenceId }: { sequenceId: string }) => {
    // Read at unmount only, so a prop change does not look like an unmount.
    const idRef = useRef(sequenceId);
    idRef.current = sequenceId;
    useEffect(
      () => () => {
        mockUnmountedEditors.push(idRef.current);
      },
      []
    );
    return <div data-testid="timeline-editor" />;
  };
  return { __esModule: true, default: MockEditor };
});
jest.mock("../../timeline/TimelinePlayer", () => ({
  __esModule: true,
  default: () => <div data-testid="timeline-player" />
}));
jest.mock("../../setup/video/VideoSetupHost", () => ({
  __esModule: true,
  default: ({ active }: { active?: boolean }) => (
    <div data-testid="video-setup" data-active={String(active)} />
  )
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

  it("passes the tab's active flag to the setup host (F30)", () => {
    mockTimelineQuery.value = {
      isPending: false,
      isError: false,
      stage: "idea"
    };
    render(
      <ThemeProvider theme={mockTheme}>
        <TimelineSurface refId="seq-1" mode="edit" active={false} />
      </ThemeProvider>
    );

    expect(screen.getByTestId("video-setup")).toHaveAttribute(
      "data-active",
      "false"
    );
  });

  it("remounts the editor when the tab switches sequence (F31)", () => {
    mockTimelineQuery.value = {
      isPending: false,
      isError: false,
      stage: "done"
    };
    mockUnmountedEditors.length = 0;
    const { rerender } = render(
      <ThemeProvider theme={mockTheme}>
        <TimelineSurface refId="seq-1" mode="edit" active />
      </ThemeProvider>
    );
    rerender(
      <ThemeProvider theme={mockTheme}>
        <TimelineSurface refId="seq-2" mode="edit" active />
      </ThemeProvider>
    );

    expect(mockUnmountedEditors).toEqual(["seq-1"]);
  });

  it("renders neither surface while the sequence is loading", () => {
    mockTimelineQuery.value = { isPending: true };
    renderSurface();

    expect(screen.queryByTestId("video-setup")).not.toBeInTheDocument();
    expect(screen.queryByTestId("timeline-editor")).not.toBeInTheDocument();
  });
});
