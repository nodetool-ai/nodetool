import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import "@testing-library/jest-dom";

import type { Generation } from "../../../utils/nodeGenerations";

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

/** A media generation backed by a persisted asset id. */
const makeGen = (id: string, createdAt: number): Generation => ({
  id,
  jobId: "job-a",
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
  mockUseNodeGenerations.mockReturnValue({ generations, current, select });
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
    select: jest.fn()
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
    expect(screen.queryByLabelText("Toggle view mode")).not.toBeInTheDocument();
  });

  it("renders the current (latest) generation with a 1/N counter", () => {
    setGenerations([
      makeGen("a1", 1),
      makeGen("a2", 2),
      makeGen("a3", 3)
    ]);

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

  it("calls select with the next generation id when Next is clicked", () => {
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

    // current is a1 (index 0); Next moves to a2.
    fireEvent.click(screen.getByLabelText("Next output"));
    expect(select).toHaveBeenCalledWith("a2");
  });

  it("calls select with the previous generation id (wrapping) when Previous is clicked", () => {
    const select = setGenerations(
      [makeGen("a1", 1), makeGen("a2", 2)],
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

    // current is a1 (index 0); Previous wraps to the last generation a2.
    fireEvent.click(screen.getByLabelText("Previous output"));
    expect(select).toHaveBeenCalledWith("a2");
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

  it("shows the live result instead of history while a run is in progress", () => {
    setGenerations([makeGen("a1", 1), makeGen("a2", 2)]);
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

  it("switches to grid mode when the mode toggle is clicked", () => {
    setGenerations([makeGen("a1", 1), makeGen("a2", 2), makeGen("a3", 3)]);

    renderWithProviders(
      <NodeHistoryViewer
        workflowId="wf1"
        nodeId="node-a"
        liveResult={null}
        renderSingle={renderSingle}
      />
    );

    fireEvent.click(screen.getByLabelText("Toggle view mode"));
    expect(
      screen.getByRole("list", { name: "Output history" })
    ).toBeInTheDocument();
    expect(screen.queryByTestId("single-body")).not.toBeInTheDocument();
  });

  it("selecting a grid thumbnail selects that generation and returns to single mode", () => {
    const select = setGenerations([
      makeGen("a1", 1),
      makeGen("a2", 2),
      makeGen("a3", 3)
    ]);

    renderWithProviders(
      <NodeHistoryViewer
        workflowId="wf1"
        nodeId="node-a"
        liveResult={null}
        renderSingle={renderSingle}
      />
    );

    fireEvent.click(screen.getByLabelText("Toggle view mode"));
    const items = screen.getAllByRole("listitem");
    fireEvent.click(items[0]);
    expect(select).toHaveBeenCalledWith("a1");
    // Returned to single mode.
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
