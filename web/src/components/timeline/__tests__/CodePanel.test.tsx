/**
 * CodePanel — the timeline editor's "Code" tab.
 *
 * Covers what the panel owns: the empty state for a timeline with no code,
 * showing code + scene divergence badges, the rebake button posting the
 * edited text and refetching, and conflict rows driving the right
 * force/detach procedures.
 */

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";

import mockTheme from "../../../__mocks__/themeMock";
import { useDocumentDraftStore } from "../../../stores/DocumentDraftStore";
import { CodePanel } from "../CodePanel";
import { TimelineProvider } from "../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import {
  mockTimelineCodeGet,
  mockTimelineCodeSet,
  mockTimelineCodeRebake,
  mockTimelineCodeDetach
} from "../../../__mocks__/trpcClientMock";

// Stub Monaco with a textarea so the editor can be driven without the real
// bundle — same shim `CodeProperty.test.tsx` uses.
jest.mock("../../../hooks/editor/useMonacoEditor", () => ({
  useMonacoEditor: () => ({
    MonacoEditor: ({
      value,
      onChange
    }: {
      value: string;
      onChange?: (val?: string) => void;
    }) => (
      <textarea
        data-testid="monaco"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
      />
    ),
    monacoLoadError: null,
    isMonacoLoading: false,
    loadMonacoIfNeeded: jest.fn().mockResolvedValue(undefined)
  })
}));

const SEQUENCE_ID = "tl-1";

/** Exposes the current clip selection so a test can assert on it without
 *  calling the instance-scoped store hook outside of a render. */
function SelectionProbe() {
  const selected = useTimelineUIStore((s) =>
    Array.from(s.selectedClipIds).join(",")
  );
  return <div data-testid="selection">{selected}</div>;
}

function renderPanel() {
  const utils = render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ThemeProvider theme={mockTheme}>
        <TimelineProvider>
          <CodePanel />
          <SelectionProbe />
        </TimelineProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
  const track = makeTrack({ type: "video", name: "V1" });
  const clip = makeClip({ id: "group-1", trackId: track.id, startMs: 0 });
  act(() => {
    useTimelineStore.setState({
      sequenceId: SEQUENCE_ID,
      tracks: [track],
      clips: [clip]
    });
  });
  return utils;
}

beforeEach(() => {
  jest.clearAllMocks();
  useDocumentDraftStore.setState({ dirtyTabs: {}, codeDrafts: {} });
  mockTimelineCodeGet.mockResolvedValue({
    code: "",
    bakedAt: null,
    scenes: []
  });
  mockTimelineCodeSet.mockResolvedValue({
    timeline_id: SEQUENCE_ID,
    errors: [],
    warnings: [],
    conflicts: [],
    scenes: []
  });
  mockTimelineCodeRebake.mockResolvedValue({
    timeline_id: SEQUENCE_ID,
    errors: [],
    warnings: [],
    conflicts: [],
    scenes: []
  });
  mockTimelineCodeDetach.mockResolvedValue({
    scenes: []
  });
});

describe("CodePanel", () => {
  it("restores unsaved code after its panel is dismissed and recreated", async () => {
    mockTimelineCodeGet.mockResolvedValue({
      code: "baseline",
      bakedAt: null,
      scenes: []
    });
    const first = renderPanel();
    await waitFor(() =>
      expect(screen.getByTestId("monaco")).toHaveValue("baseline")
    );
    fireEvent.change(screen.getByTestId("monaco"), {
      target: { value: "unsaved exact text" }
    });
    first.unmount();
    renderPanel();
    await waitFor(() =>
      expect(screen.getByTestId("monaco")).toHaveValue("unsaved exact text")
    );
    expect(screen.getByRole("button", { name: "Rebake" })).toBeEnabled();
  });

  it("shows the empty state for a timeline with no code", async () => {
    renderPanel();

    expect(await screen.findByText("No code")).toBeInTheDocument();
    expect(screen.queryByTestId("monaco")).not.toBeInTheDocument();
  });

  it("shows the code and a divergence badge for an edited scene", async () => {
    mockTimelineCodeGet.mockResolvedValue({
      code: "scene('group-1')",
      bakedAt: "2026-01-01T00:00:00.000Z",
      scenes: [
        { name: "Intro", groupId: "group-1", edited: true },
        { name: "Outro", groupId: "group-2", edited: false }
      ]
    });

    renderPanel();

    await waitFor(() =>
      expect(screen.getByTestId("monaco")).toHaveValue("scene('group-1')")
    );
    expect(screen.getByText("Intro")).toBeInTheDocument();
    expect(screen.getByText("Outro")).toBeInTheDocument();
    expect(screen.getByText("Edited")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Intro"));
    expect(screen.getByTestId("selection")).toHaveTextContent("group-1");
  });

  it("rebakes edited code and refetches the baked document", async () => {
    // `set`'s success invalidates the code query, so `get` refetches too —
    // matched here to the post-bake state a real backend would return.
    const bakedScenes = [{ name: "Intro", groupId: "group-1", edited: false }];
    mockTimelineCodeGet.mockResolvedValue({
      code: "old code",
      bakedAt: "2026-01-01T00:00:00.000Z",
      scenes: bakedScenes
    });
    mockTimelineCodeSet.mockResolvedValue({
      timeline_id: SEQUENCE_ID,
      errors: [],
      warnings: [],
      conflicts: [],
      scenes: bakedScenes
    });

    renderPanel();

    await waitFor(() =>
      expect(screen.getByTestId("monaco")).toHaveValue("old code")
    );
    fireEvent.change(screen.getByTestId("monaco"), {
      target: { value: "new code" }
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Rebake" })).toBeEnabled()
    );
    await userEvent.click(screen.getByRole("button", { name: "Rebake" }));

    await waitFor(() =>
      expect(mockTimelineCodeSet).toHaveBeenCalledWith({
        id: SEQUENCE_ID,
        code: "new code"
      })
    );
    expect(await screen.findByText("Intro")).toBeInTheDocument();
  });

  it("keeps the draft when the bake returns errors", async () => {
    mockTimelineCodeGet.mockResolvedValue({
      code: "old code",
      bakedAt: "2026-01-01T00:00:00.000Z",
      scenes: []
    });
    mockTimelineCodeSet.mockResolvedValue({
      timeline_id: SEQUENCE_ID,
      errors: ["SyntaxError: unexpected token"],
      warnings: [],
      conflicts: [],
      scenes: []
    });

    renderPanel();

    await waitFor(() =>
      expect(screen.getByTestId("monaco")).toHaveValue("old code")
    );
    fireEvent.change(screen.getByTestId("monaco"), {
      target: { value: "new code with a typo" }
    });
    await userEvent.click(screen.getByRole("button", { name: "Rebake" }));

    expect(
      await screen.findByText("SyntaxError: unexpected token")
    ).toBeInTheDocument();
    expect(screen.getByTestId("monaco")).toHaveValue("new code with a typo");
    expect(screen.getByRole("button", { name: "Rebake" })).toBeEnabled();
  });

  async function rebakeIntoConflict() {
    mockTimelineCodeGet.mockResolvedValue({
      code: "scene('group-1')",
      bakedAt: "2026-01-01T00:00:00.000Z",
      scenes: [{ name: "Intro", groupId: "group-1", edited: true }]
    });
    mockTimelineCodeSet.mockResolvedValue({
      timeline_id: SEQUENCE_ID,
      errors: [],
      warnings: [],
      conflicts: [{ scene: "Intro", reason: "edited on the timeline" }],
      scenes: [{ name: "Intro", groupId: "group-1", edited: true }]
    });

    renderPanel();

    await waitFor(() =>
      expect(screen.getByTestId("monaco")).toHaveValue("scene('group-1')")
    );
    fireEvent.change(screen.getByTestId("monaco"), {
      target: { value: "scene('group-1')x" }
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Rebake" })).toBeEnabled()
    );
    await userEvent.click(screen.getByRole("button", { name: "Rebake" }));

    expect(
      await screen.findByText(
        'Scene "Intro" was edited in the editor since the last bake — kept. (edited on the timeline)'
      )
    ).toBeInTheDocument();
  }

  it("overwrites a conflicted scene from code on request", async () => {
    await rebakeIntoConflict();

    await userEvent.click(
      screen.getByRole("button", { name: "Overwrite with code" })
    );
    await waitFor(() =>
      expect(mockTimelineCodeRebake).toHaveBeenCalledWith({
        id: SEQUENCE_ID,
        force: ["Intro"]
      })
    );
  });

  it("detaches a conflicted scene from code on request", async () => {
    await rebakeIntoConflict();

    await userEvent.click(screen.getByRole("button", { name: "Detach" }));
    await waitFor(() =>
      expect(mockTimelineCodeDetach).toHaveBeenCalledWith({
        id: SEQUENCE_ID,
        scenes: ["Intro"]
      })
    );
  });
});
