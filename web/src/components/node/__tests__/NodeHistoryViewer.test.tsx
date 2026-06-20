import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import "@testing-library/jest-dom";

import type { Generation } from "../../../utils/nodeGenerations";
import { groupByRun, getCurrentRun } from "../../../utils/nodeGenerations";

const mockUseNodeResultHistory = jest.fn();
const mockUseWebsocketRunner = jest.fn();
const mockUseNodeGenerations = jest.fn();

jest.mock("../../../hooks/nodes/useNodeResultHistory", () => {
  const actual = jest.requireActual("../../../hooks/nodes/useNodeResultHistory");
  return {
    ...actual,
    useNodeResultHistory: (...args: unknown[]) =>
      mockUseNodeResultHistory(...args)
  };
});

jest.mock("../../../hooks/nodes/useNodeGenerations", () => ({
  useNodeGenerations: (...args: unknown[]) => mockUseNodeGenerations(...args)
}));

jest.mock("../../../stores/WorkflowRunner", () => ({
  useWebsocketRunner: (selector: (s: unknown) => unknown) =>
    selector(mockUseWebsocketRunner())
}));

jest.mock("../../assets/AssetViewer", () => ({
  __esModule: true,
  default: ({
    open,
    asset,
    sortedAssets
  }: {
    open: boolean;
    asset?: { id?: string };
    sortedAssets?: { id?: string }[];
  }) =>
    open ? (
      <div
        data-testid="asset-viewer-open"
        data-current-asset={asset?.id ?? ""}
        data-gallery-ids={(sortedAssets ?? []).map((a) => a.id).join(",")}
      />
    ) : null
}));

import NodeHistoryViewer from "../NodeHistoryViewer";

const renderSingle = (value: unknown) => (
  <div data-testid="single-body">{JSON.stringify(value)}</div>
);

const renderWithProviders = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

const makeAsset = (
  id: string,
  contentType = "image/png",
  extras: Record<string, unknown> = {}
) => ({
  id,
  user_id: "u1",
  parent_id: null,
  name: `${id}.png`,
  content_type: contentType,
  size: 1234,
  duration: null,
  metadata: { width: 1024, height: 1024 },
  workflow_id: "wf1",
  node_id: "node-a",
  job_id: "job-a",
  created_at: "2026-05-01T00:00:00Z",
  get_url: `https://example.com/${id}.png`,
  thumb_url: `https://example.com/${id}-thumb.png`,
  etag: null,
  ...extras
});

/** A media generation backed by a persisted asset id; all share one jobId so
 *  they group into a single run (N variants). */
const makeGen = (id: string, createdAt: number): Generation => ({
  id,
  jobId: "job-a",
  createdAt,
  outputs: { output: { type: "image", uri: `https://example.com/${id}.png` } },
  status: "completed",
  assetId: id
});

/** A media generation with an explicit jobId — distinct jobIds group into
 *  distinct runs (one variant each). */
const makeRunGen = (
  id: string,
  jobId: string,
  createdAt: number
): Generation => ({
  id,
  jobId,
  createdAt,
  outputs: { output: { type: "image", uri: `https://example.com/${id}.png` } },
  status: "completed",
  assetId: id
});

const setGenerations = (generations: Generation[], selectedId?: string) => {
  const current =
    (selectedId
      ? generations.find((g) => g.id === selectedId)
      : undefined) ?? generations[generations.length - 1];
  const select = jest.fn();
  const runs = groupByRun(generations);
  const currentRun = getCurrentRun(runs, selectedId);
  mockUseNodeGenerations.mockReturnValue({
    generations,
    current,
    select,
    runs,
    currentRun
  });
  return select;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseNodeResultHistory.mockReturnValue({
    assetHistory: [],
    historyCount: 0,
    lastJobAssets: [],
    lastJobId: null,
    isLoading: false,
    refresh: jest.fn(),
    workflowId: "wf1"
  });
  mockUseWebsocketRunner.mockReturnValue({ state: "idle" });
  mockUseNodeGenerations.mockReturnValue({
    generations: [],
    current: undefined,
    select: jest.fn(),
    runs: [],
    currentRun: undefined
  });
});

describe("NodeHistoryViewer", () => {
  it("delegates to renderSingle when history is empty and there is no live result", () => {
    renderWithProviders(
      <NodeHistoryViewer
        workflowId="wf1"
        nodeId="node-a"
        liveResult={null}
        renderSingle={renderSingle}
      />
    );
    expect(screen.getByTestId("single-body")).toHaveTextContent("null");
    expect(screen.queryByLabelText("Toggle view")).not.toBeInTheDocument();
  });

  it("renders the current (latest) variant in single view with a 1/N counter (one run)", () => {
    // All three share one jobId → one run, three variants. With renderSingle
    // selected to a single variant the navigator stays in single view (the
    // default variants grid only applies when no variant is selected); here we
    // assert the variant-scoped pager.
    setGenerations(
      [makeGen("a1", 1), makeGen("a2", 2), makeGen("a3", 3)],
      "a3"
    );

    renderWithProviders(
      <NodeHistoryViewer
        workflowId="wf1"
        nodeId="node-a"
        liveResult={null}
        renderSingle={renderSingle}
      />
    );

    // Default view is the variants grid (>1 variant in the current run). The
    // toggle cycles variants → runs → single, so two clicks reach single view
    // and the variant pager.
    fireEvent.click(screen.getByLabelText("Toggle view"));
    fireEvent.click(screen.getByLabelText("Toggle view"));
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(screen.getByTestId("single-body")).toHaveTextContent("a3.png");
  });

  it("steps variants within a run when Next/Previous are clicked", () => {
    const select = setGenerations(
      [makeGen("a1", 1), makeGen("a2", 2), makeGen("a3", 3)],
      "a1"
    );

    renderWithProviders(
      <NodeHistoryViewer
        workflowId="wf1"
        nodeId="node-a"
        liveResult={null}
        renderSingle={renderSingle}
      />
    );

    // Switch to single view to expose the variant pager (default is the
    // variants grid; toggle cycles variants → runs → single).
    fireEvent.click(screen.getByLabelText("Toggle view"));
    fireEvent.click(screen.getByLabelText("Toggle view"));
    // current is variant a1 (index 0); Next moves to a2.
    fireEvent.click(screen.getByLabelText("Next output"));
    expect(select).toHaveBeenCalledWith("a2");
    // Previous wraps to the last variant a3.
    fireEvent.click(screen.getByLabelText("Previous output"));
    expect(select).toHaveBeenCalledWith("a3");
  });

  it("steps runs when each generation is its own run", () => {
    // Distinct jobIds → three runs, one variant each. Pager is run-scoped.
    const select = setGenerations(
      [makeRunGen("a1", "j1", 1), makeRunGen("a2", "j2", 2), makeRunGen("a3", "j3", 3)],
      "a1"
    );

    renderWithProviders(
      <NodeHistoryViewer
        workflowId="wf1"
        nodeId="node-a"
        liveResult={null}
        renderSingle={renderSingle}
      />
    );

    // Single run-per-generation → default single view, run-scoped pager.
    fireEvent.click(screen.getByLabelText("Next output"));
    expect(select).toHaveBeenCalledWith("a2");
    fireEvent.click(screen.getByLabelText("Previous output"));
    // Previous from run a1 wraps to the last run a3.
    expect(select).toHaveBeenCalledWith("a3");
  });

  it("hides pagination when only one generation exists", () => {
    setGenerations([makeGen("a1", 1)]);

    renderWithProviders(
      <NodeHistoryViewer
        workflowId="wf1"
        nodeId="node-a"
        liveResult={null}
        renderSingle={renderSingle}
      />
    );

    expect(screen.queryByLabelText("Previous output")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Next output")).not.toBeInTheDocument();
  });

  it("shows the live result instead of history while a single-variant run is in progress", () => {
    // One variant in the current run → the in-flight single preview is shown
    // (the normal single-image streaming case).
    setGenerations([makeGen("a1", 1)]);
    mockUseWebsocketRunner.mockReturnValue({ state: "running" });

    const liveResult = { type: "image", uri: "live-preview.png" };
    renderWithProviders(
      <NodeHistoryViewer
        workflowId="wf1"
        nodeId="node-a"
        liveResult={liveResult}
        renderSingle={renderSingle}
      />
    );

    expect(screen.getByTestId("single-body")).toHaveTextContent(
      "live-preview.png"
    );
    expect(screen.queryByLabelText("Previous output")).not.toBeInTheDocument();
  });

  it("renders the variants grid mid-run when the current run has >1 live variant", () => {
    // A multi-execution run: variants pop in live under one jobId. Even while
    // showingLive (run in progress + non-null liveResult), the grid must show
    // the N tiles rather than freezing on the single in-flight preview. With no
    // renderVariants supplied the viewer falls back to its own `.thumb` grid
    // labeled "Output history".
    setGenerations([
      makeGen("a1", 1),
      makeGen("a2", 2),
      makeGen("a3", 3)
    ]);
    mockUseWebsocketRunner.mockReturnValue({ state: "running" });

    const liveResult = { type: "image", uri: "live-preview.png" };
    renderWithProviders(
      <NodeHistoryViewer
        workflowId="wf1"
        nodeId="node-a"
        liveResult={liveResult}
        renderSingle={renderSingle}
      />
    );

    expect(
      screen.getByRole("list", { name: "Output history" })
    ).toBeInTheDocument();
    // The single in-flight preview is NOT rendered — the grid supersedes it.
    expect(screen.queryByTestId("single-body")).not.toBeInTheDocument();
  });

  it("invokes renderVariants mid-run for a multi-variant run when supplied", () => {
    // When the caller supplies renderVariants (image variants), the grid path
    // uses it directly — proving the live multi-variant run reaches the
    // renderVariants branch (NodeHistoryViewer.tsx:482), not the single preview.
    setGenerations([
      makeGen("a1", 1),
      makeGen("a2", 2),
      makeGen("a3", 3)
    ]);
    mockUseWebsocketRunner.mockReturnValue({ state: "running" });

    const renderVariants = jest.fn((values: unknown[]) => (
      <div data-testid="variants-grid" data-count={values.length} />
    ));

    renderWithProviders(
      <NodeHistoryViewer
        workflowId="wf1"
        nodeId="node-a"
        liveResult={{ type: "image", uri: "live-preview.png" }}
        renderSingle={renderSingle}
        renderVariants={renderVariants}
      />
    );

    expect(renderVariants).toHaveBeenCalled();
    const grid = screen.getByTestId("variants-grid");
    expect(grid).toHaveAttribute("data-count", "3");
    expect(screen.queryByTestId("single-body")).not.toBeInTheDocument();
  });

  it("defaults to the variants grid for a multi-variant run", () => {
    // One run with 3 variants → default view is the variants grid. With no
    // renderVariants supplied the viewer falls back to its own `.thumb` grid
    // labeled "Output history".
    setGenerations([makeGen("a1", 1), makeGen("a2", 2), makeGen("a3", 3)]);

    renderWithProviders(
      <NodeHistoryViewer
        workflowId="wf1"
        nodeId="node-a"
        liveResult={null}
        renderSingle={renderSingle}
      />
    );

    expect(
      screen.getByRole("list", { name: "Output history" })
    ).toBeInTheDocument();
    expect(screen.queryByTestId("single-body")).not.toBeInTheDocument();
  });

  it("auto-switches to the variants grid as a streaming run grows under one jobId", () => {
    // The core streaming scenario: the card is already mounted and the run grows
    // from 1 variant to N under a CONSTANT jobId. The default must re-evaluate
    // as variants accrue — not just on a jobId change — so the variants grid
    // appears once the run settles, without a manual toggle.
    setGenerations([makeGen("a1", 1)]);
    const { rerender } = renderWithProviders(
      <NodeHistoryViewer
        workflowId="wf1"
        nodeId="node-a"
        liveResult={null}
        renderSingle={renderSingle}
      />
    );
    // One variant → single view.
    expect(screen.getByTestId("single-body")).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Output history" })
    ).not.toBeInTheDocument();

    // Two more variants stream in under the SAME jobId (job-a). In the real app
    // the hook's store subscription re-renders the component; here the mocked
    // hook can't, so a fresh renderSingle identity forces the memo through to
    // re-read the updated generations (the view derivation itself is plain
    // computation, so it re-evaluates on any re-render — no effect to miss it).
    setGenerations([makeGen("a1", 1), makeGen("a2", 2), makeGen("a3", 3)]);
    rerender(
      <ThemeProvider theme={mockTheme}>
        <NodeHistoryViewer
          workflowId="wf1"
          nodeId="node-a"
          liveResult={null}
          renderSingle={(value) => (
            <div data-testid="single-body">{JSON.stringify(value)}</div>
          )}
        />
      </ThemeProvider>
    );

    // The grid now defaults on, no toggle required.
    expect(
      screen.getByRole("list", { name: "Output history" })
    ).toBeInTheDocument();
    expect(screen.queryByTestId("single-body")).not.toBeInTheDocument();
  });

  it("toggles variants → runs → single", () => {
    // Two runs (j1 ×1 variant, j2 ×2 variants); current run is j2 → defaults to
    // the variants grid. Toggling cycles variants → runs → single.
    setGenerations([
      makeRunGen("a1", "j1", 1),
      makeRunGen("a2", "j2", 2),
      makeRunGen("a3", "j2", 3)
    ]);

    renderWithProviders(
      <NodeHistoryViewer
        workflowId="wf1"
        nodeId="node-a"
        liveResult={null}
        renderSingle={renderSingle}
      />
    );

    // Default: variants grid (current run j2 has 2 variants).
    expect(
      screen.getByRole("list", { name: "Output history" })
    ).toBeInTheDocument();
    // → runs grid.
    fireEvent.click(screen.getByLabelText("Toggle view"));
    expect(screen.getByRole("list", { name: "Runs" })).toBeInTheDocument();
    // → single.
    fireEvent.click(screen.getByLabelText("Toggle view"));
    expect(screen.getByTestId("single-body")).toBeInTheDocument();
  });

  it("renders one runs-grid tile per run with an xN badge for multi-variant runs", () => {
    setGenerations([
      makeRunGen("a1", "j1", 1),
      makeRunGen("a2", "j2", 2),
      makeRunGen("a3", "j2", 3)
    ]);

    renderWithProviders(
      <NodeHistoryViewer
        workflowId="wf1"
        nodeId="node-a"
        liveResult={null}
        renderSingle={renderSingle}
      />
    );

    // From the default variants grid, toggle to the runs grid.
    fireEvent.click(screen.getByLabelText("Toggle view"));
    const tiles = screen.getAllByRole("listitem");
    // Two runs → two tiles. The j2 run (2 variants) shows an "x2" badge.
    expect(tiles).toHaveLength(2);
    expect(screen.getByText("x2")).toBeInTheDocument();
  });

  it("selecting a runs-grid tile selects its cover and opens that run", () => {
    // Single-variant runs so the tile click drops straight to single view.
    const select = setGenerations([
      makeRunGen("a1", "j1", 1),
      makeRunGen("a2", "j2", 2),
      makeRunGen("a3", "j3", 3)
    ]);

    renderWithProviders(
      <NodeHistoryViewer
        workflowId="wf1"
        nodeId="node-a"
        liveResult={null}
        renderSingle={renderSingle}
      />
    );

    // Three single-variant runs → default single view; toggle to the runs grid.
    fireEvent.click(screen.getByLabelText("Toggle view"));
    const tiles = screen.getAllByRole("listitem");
    fireEvent.click(tiles[0]);
    expect(select).toHaveBeenCalledWith("a1");
    expect(screen.getByTestId("single-body")).toBeInTheDocument();
  });

  it("opens the AssetViewer for the current generation's asset", () => {
    setGenerations([makeGen("a1", 1)]);
    mockUseNodeResultHistory.mockReturnValue({
      assetHistory: [makeAsset("a1")],
      historyCount: 1,
      lastJobAssets: [makeAsset("a1")],
      lastJobId: "job-a",
      isLoading: false,
      refresh: jest.fn(),
      workflowId: "wf1"
    });

    renderWithProviders(
      <NodeHistoryViewer
        workflowId="wf1"
        nodeId="node-a"
        liveResult={null}
        renderSingle={renderSingle}
      />
    );

    expect(screen.queryByTestId("asset-viewer-open")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Open in viewer"));
    expect(screen.getByTestId("asset-viewer-open")).toBeInTheDocument();
  });

  it("opens the viewer on the selected generation with the full asset gallery", () => {
    const assets = [makeAsset("a1"), makeAsset("a2"), makeAsset("a3")];
    setGenerations(
      [makeGen("a1", 1), makeGen("a2", 2), makeGen("a3", 3)],
      "a2"
    );
    mockUseNodeResultHistory.mockReturnValue({
      assetHistory: assets,
      historyCount: 3,
      lastJobAssets: assets,
      lastJobId: "job-a",
      isLoading: false,
      refresh: jest.fn(),
      workflowId: "wf1"
    });

    renderWithProviders(
      <NodeHistoryViewer
        workflowId="wf1"
        nodeId="node-a"
        liveResult={null}
        renderSingle={renderSingle}
      />
    );

    fireEvent.click(screen.getByLabelText("Open in viewer"));

    const viewer = screen.getByTestId("asset-viewer-open");
    expect(viewer).toHaveAttribute("data-gallery-ids", "a1,a2,a3");
    // Viewer opens on the currently-selected generation's asset.
    expect(viewer).toHaveAttribute("data-current-asset", "a2");
  });
});

describe("NodeHistoryViewer — auto-focus latest run", () => {
  const setMock = (
    generations: Generation[],
    selectedId: string | undefined,
    select: jest.Mock
  ) => {
    const current =
      (selectedId
        ? generations.find((g) => g.id === selectedId)
        : undefined) ?? generations[generations.length - 1];
    const runs = groupByRun(generations);
    const currentRun = getCurrentRun(runs, selectedId);
    mockUseNodeGenerations.mockReturnValue({
      generations,
      current,
      select,
      runs,
      currentRun
    });
  };

  // Fresh renderSingle identity per render so the memo-wrapped component
  // actually re-renders on rerender (the real app re-renders via the Zustand
  // subscription; the mocked hook is static).
  const wrap = () => (
    <ThemeProvider theme={mockTheme}>
      <NodeHistoryViewer
        workflowId="wf1"
        nodeId="node-a"
        liveResult={null}
        renderSingle={(v) => renderSingle(v)}
      />
    </ThemeProvider>
  );

  it("advances focus to a new run when its jobId appears (stale selection in an older run)", () => {
    const select = jest.fn();
    setMock([makeRunGen("a1", "j1", 1)], "a1", select);
    const { rerender } = render(wrap());
    // Mount must not auto-advance (preserve a restored selection).
    expect(select).not.toHaveBeenCalled();

    // A new run j2 appears while the selection still pins a1 (run j1).
    setMock([makeRunGen("a1", "j1", 1), makeRunGen("a2", "j2", 2)], "a1", select);
    rerender(wrap());
    // Focus follows the latest run (its cover = a2).
    expect(select).toHaveBeenCalledWith("a2");
  });

  it("does not auto-advance on the initial render", () => {
    const select = jest.fn();
    setMock([makeRunGen("a1", "j1", 1), makeRunGen("a2", "j2", 2)], "a1", select);
    render(wrap());
    expect(select).not.toHaveBeenCalled();
  });

  it("does not advance while a run grows in place (same jobId — within-run pin survives)", () => {
    const select = jest.fn();
    setMock([makeRunGen("a1", "j1", 1)], "a1", select);
    const { rerender } = render(wrap());
    // Same job j1 gains a second variant — not a new run.
    setMock([makeRunGen("a1", "j1", 1), makeRunGen("a2", "j1", 2)], "a1", select);
    rerender(wrap());
    expect(select).not.toHaveBeenCalled();
  });
});
