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

// Fresh renderSingle identity per render so the memo-wrapped component actually
// re-renders on rerender (the real app re-renders via the Zustand subscription;
// the mocked hook is static).
const viewer = () => (
  <ThemeProvider theme={mockTheme}>
    <NodeHistoryViewer
      workflowId="wf1"
      nodeId="node-a"
      liveResult={null}
      renderSingle={(v) => renderSingle(v)}
    />
  </ThemeProvider>
);

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

  it("renders the current (latest) generation in single view with a global i/N counter", () => {
    // Three generations (one run). The default view is single — no auto-default
    // to a grid — so the latest generation shows immediately with the GLOBAL
    // pager counter (3 / 3), without any toggle.
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

    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(screen.getByTestId("single-body")).toHaveTextContent("a3.png");
  });

  it("steps the flat timeline linearly within a run (Next/Previous wrap)", () => {
    // Three variants of one run. The pager steps the flat list, not a
    // run-scoped sub-list — one predictable behavior.
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

    // current is a1 (index 0); Next → a2.
    fireEvent.click(screen.getByLabelText("Next output"));
    expect(select).toHaveBeenCalledWith("a2");
    // Previous from a1 wraps to the last generation a3.
    fireEvent.click(screen.getByLabelText("Previous output"));
    expect(select).toHaveBeenCalledWith("a3");
  });

  it("steps the flat timeline linearly across runs (Next/Previous wrap)", () => {
    // Distinct jobIds → three runs, one variant each. The SAME linear pager
    // crosses run boundaries — no more context-dependent stepping.
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

    fireEvent.click(screen.getByLabelText("Next output"));
    expect(select).toHaveBeenCalledWith("a2");
    fireEvent.click(screen.getByLabelText("Previous output"));
    // Previous from a1 wraps to the last generation a3.
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

  it("shows the live in-flight preview during a multi-variant batch, not the grid", () => {
    // A multi-execution batch streams variants in under one jobId. While the run
    // is in progress the single in-flight preview is shown; the grid only opens
    // once the batch FINISHES (see the auto-open-grid test).
    setGenerations([makeGen("a1", 1), makeGen("a2", 2), makeGen("a3", 3)]);
    mockUseWebsocketRunner.mockReturnValue({ state: "running" });

    renderWithProviders(
      <NodeHistoryViewer
        workflowId="wf1"
        nodeId="node-a"
        liveResult={{ type: "image", uri: "live-preview.png" }}
        renderSingle={renderSingle}
      />
    );

    expect(screen.getByTestId("single-body")).toHaveTextContent(
      "live-preview.png"
    );
    expect(
      screen.queryByRole("list", { name: "Generations" })
    ).not.toBeInTheDocument();
  });

  it("defaults a multi-variant run to single view on mount (no surprise grid)", () => {
    // On a fresh mount (e.g. a reload) a finished batch stays in single view —
    // the restored selection is preserved; the grid auto-opens only on a live
    // batch FINISH during the session, never on mount.
    setGenerations([makeGen("a1", 1), makeGen("a2", 2), makeGen("a3", 3)]);

    renderWithProviders(
      <NodeHistoryViewer
        workflowId="wf1"
        nodeId="node-a"
        liveResult={null}
        renderSingle={renderSingle}
      />
    );

    expect(screen.getByTestId("single-body")).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Generations" })
    ).not.toBeInTheDocument();
  });

  it("auto-opens the grid when a multi-variant run finishes", () => {
    // Mount with a single generation (single view), then a batch finishes under
    // one jobId: the grid auto-opens to show all variants at once.
    setGenerations([makeGen("a1", 1)]);
    const { rerender } = render(viewer());
    expect(screen.getByTestId("single-body")).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Generations" })
    ).not.toBeInTheDocument();

    // Two more variants land under the SAME jobId (job-a), run completed.
    setGenerations([makeGen("a1", 1), makeGen("a2", 2), makeGen("a3", 3)]);
    rerender(viewer());

    expect(
      screen.getByRole("list", { name: "Generations" })
    ).toBeInTheDocument();
    expect(screen.queryByTestId("single-body")).not.toBeInTheDocument();
  });

  it("stays in single view when a single-variant run finishes", () => {
    // A new single-variant run is not a batch → the grid does not auto-open.
    setGenerations([makeRunGen("a1", "j1", 1)]);
    const { rerender } = render(viewer());

    setGenerations([makeRunGen("a1", "j1", 1), makeRunGen("a2", "j2", 2)]);
    rerender(viewer());

    expect(screen.getByTestId("single-body")).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Generations" })
    ).not.toBeInTheDocument();
  });

  it("toggles between grid and single with one button", () => {
    setGenerations([makeGen("a1", 1), makeGen("a2", 2), makeGen("a3", 3)]);

    renderWithProviders(
      <NodeHistoryViewer
        workflowId="wf1"
        nodeId="node-a"
        liveResult={null}
        renderSingle={renderSingle}
      />
    );

    // Default single → grid.
    expect(screen.getByTestId("single-body")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Toggle view"));
    expect(
      screen.getByRole("list", { name: "Generations" })
    ).toBeInTheDocument();
    // grid → single.
    fireEvent.click(screen.getByLabelText("Toggle view"));
    expect(screen.getByTestId("single-body")).toBeInTheDocument();
  });

  it("groups the grid into a section per run with an xN count for multi-variant runs", () => {
    // Two runs: j1 (1 variant) and j2 (2 variants). The grid renders one tile
    // per generation (3 total) grouped under run headers; the j2 section shows
    // an "×2" count badge.
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

    fireEvent.click(screen.getByLabelText("Toggle view"));
    // One tile per generation across all runs.
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("×2")).toBeInTheDocument();
  });

  it("selecting a grid tile selects that generation and drops to single", () => {
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
