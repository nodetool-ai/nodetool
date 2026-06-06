import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import "@testing-library/jest-dom";

const mockUseNodeResultHistory = jest.fn();
const mockUseWebsocketRunner = jest.fn();

jest.mock("../../../hooks/nodes/useNodeResultHistory", () => {
  const actual = jest.requireActual("../../../hooks/nodes/useNodeResultHistory");
  return {
    ...actual,
    useNodeResultHistory: (...args: unknown[]) =>
      mockUseNodeResultHistory(...args)
  };
});

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

beforeEach(() => {
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
    // No overlay should appear when there is nothing to navigate.
    expect(screen.queryByLabelText("Toggle view mode")).not.toBeInTheDocument();
  });

  it("renders the newest asset as index 1/N when history has entries", () => {
    const assets = [makeAsset("a1"), makeAsset("a2"), makeAsset("a3")];
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

    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    // renderSingle is called with the converted value of the newest asset.
    expect(screen.getByTestId("single-body")).toHaveTextContent("a1.png");
  });

  it("navigates to the next asset when the next button is clicked", () => {
    const assets = [makeAsset("a1"), makeAsset("a2"), makeAsset("a3")];
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

    fireEvent.click(screen.getByLabelText("Next output"));
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(screen.getByTestId("single-body")).toHaveTextContent("a2.png");
  });

  it("wraps from the first asset back to the last when previous is clicked", () => {
    const assets = [makeAsset("a1"), makeAsset("a2")];
    mockUseNodeResultHistory.mockReturnValue({
      assetHistory: assets,
      historyCount: 2,
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

    fireEvent.click(screen.getByLabelText("Previous output"));
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
  });

  it("hides pagination when only one asset is in history", () => {
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

    expect(screen.queryByLabelText("Previous output")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Next output")).not.toBeInTheDocument();
  });

  it("shows the live result instead of history while a run is in progress", () => {
    const assets = [makeAsset("a1"), makeAsset("a2")];
    mockUseNodeResultHistory.mockReturnValue({
      assetHistory: assets,
      historyCount: 2,
      lastJobAssets: assets,
      lastJobId: "job-a",
      isLoading: false,
      refresh: jest.fn(),
      workflowId: "wf1"
    });
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
    const assets = [makeAsset("a1"), makeAsset("a2"), makeAsset("a3")];
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

    fireEvent.click(screen.getByLabelText("Toggle view mode"));
    expect(screen.getByRole("list", { name: "Output history" })).toBeInTheDocument();
    // Single body is gone in multi mode.
    expect(screen.queryByTestId("single-body")).not.toBeInTheDocument();
  });

  it("selecting a grid thumbnail returns to single mode at that index", () => {
    const assets = [makeAsset("a1"), makeAsset("a2"), makeAsset("a3")];
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

    fireEvent.click(screen.getByLabelText("Toggle view mode"));
    const items = screen.getAllByRole("listitem");
    fireEvent.click(items[2]);
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(screen.getByTestId("single-body")).toHaveTextContent("a3.png");
  });

  it("opens the AssetViewer for the current asset when the viewer button is clicked", () => {
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

  it("opens the viewer with the node's full generation history as the gallery", () => {
    const assets = [makeAsset("a1"), makeAsset("a2"), makeAsset("a3")];
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

    // Navigate to the second generation, then open the viewer.
    fireEvent.click(screen.getByLabelText("Next output"));
    fireEvent.click(screen.getByLabelText("Open in viewer"));

    const viewer = screen.getByTestId("asset-viewer-open");
    // Gallery holds every generation from the node, newest-first.
    expect(viewer).toHaveAttribute("data-gallery-ids", "a1,a2,a3");
    // Viewer opens on the currently-selected generation.
    expect(viewer).toHaveAttribute("data-current-asset", "a2");
  });
});
