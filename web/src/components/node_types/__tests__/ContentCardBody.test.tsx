/** @jsxImportSource @emotion/react */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import useResultsStore from "../../../stores/ResultsStore";
import { useWorkflowAssetStore } from "../../../stores/WorkflowAssetStore";
import type { Asset, NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import ContentCardBody from "../ContentCardBody";

const workflowId = "workflow-1";
const nodeId = "node-1";

// `useNodeResultHistory` feeds NodeHistoryViewer's durable asset reads (the
// fullscreen viewer, grid thumbnails, info badge). The generation timeline that
// drives selection/pagination is fed via the real WorkflowAssetStore +
// ResultsStore.liveGenerations below.
let mockAssetHistory: Asset[] = [];
let mockLastJobAssets: Asset[] = [];

jest.mock("../../../hooks/nodes/useNodeResultHistory", () => {
  const actual = jest.requireActual("../../../hooks/nodes/useNodeResultHistory");
  return {
    ...actual,
    useNodeResultHistory: () => ({
      assetHistory: mockAssetHistory,
      historyCount: mockAssetHistory.length,
      lastJobAssets: mockLastJobAssets,
      lastJobId: mockLastJobAssets[0]?.job_id ?? null,
      isLoading: false,
      refresh: jest.fn(),
      workflowId: null
    })
  };
});

// The generation hook reads the node's persisted `selected_generation` via
// `findNode`; the body also calls `updateNodeData`. Provide both. No selection
// is persisted, so `findNode` returns a bare node and selection defaults to the
// latest generation.
jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: (
    selector: (state: {
      updateNodeData: () => void;
      findNode: (id: string) => unknown;
    }) => unknown
  ) =>
    selector({
      updateNodeData: jest.fn(),
      findNode: (id: string) => ({ id, data: {} })
    })
}));

jest.mock("../../node/OutputRenderer", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ value }: { value: unknown }) =>
      React.createElement(
        "pre",
        { "data-testid": "output-renderer" },
        JSON.stringify(value)
      )
  };
});

jest.mock("../../node/ImageView", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ source }: { source: unknown }) =>
      React.createElement(
        "div",
        { "data-testid": "image-view" },
        String(source)
      )
  };
});

jest.mock("../../assets/AssetViewer", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ open }: { open: boolean }) =>
      open ? React.createElement("div", { "data-testid": "asset-viewer" }) : null
  };
});

let mockRunnerState: "idle" | "running" = "idle";
jest.mock("../../../stores/WorkflowRunner", () => ({
  useWebsocketRunner: (selector: (s: { state: string }) => unknown) =>
    selector({ state: mockRunnerState })
}));

// NodeInputs renders ReactFlow Handles, which need a ReactFlow context not
// present in these unit tests. Mock it to a probe that surfaces the props
// that decide whether dynamic inputs (and thus handles) get rendered.
jest.mock("../../node/NodeInputs", () => {
  const React = require("react");
  return {
    __esModule: true,
    NodeInputs: (props: {
      properties?: unknown[];
      showDynamicInputs?: boolean;
      editableDynamicInputs?: boolean;
      defaultDynamicInputType?: { type?: string };
    }) =>
      React.createElement("div", {
        "data-testid": "node-inputs",
        "data-properties-count": String((props.properties ?? []).length),
        "data-show-dynamic": String(props.showDynamicInputs !== false),
        "data-editable-dynamic": String(!!props.editableDynamicInputs),
        "data-default-type": props.defaultDynamicInputType?.type ?? ""
      }),
    default: () => null
  };
});

const nodeData = {
  workflow_id: workflowId,
  properties: {},
  dynamic_properties: {},
  selectable: true
} as NodeData;

const metadataForOutput = (type: string): NodeMetadata =>
  ({
    node_type: "fal.text_to_image.TestModel",
    title: "Test Model",
    namespace: "fal.text_to_image",
    description: "",
    layout: "default",
    properties: [],
    outputs: [{ name: "output", type: { type } }],
    supports_dynamic_inputs: false,
    // A generator/saver: persists each run, so its card gets the gallery.
    auto_save_asset: true
  }) as unknown as NodeMetadata;

/** A pure transform: outputs media but doesn't persist — no gallery. */
const transformMetadata = (): NodeMetadata =>
  ({
    ...metadataForOutput("image"),
    node_type: "lib.image.color_grading.Curves",
    namespace: "lib.image.color_grading",
    auto_save_asset: false
  }) as unknown as NodeMetadata;

const renderContentCard = (nodeMetadata: NodeMetadata) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ContentCardBody
        id={nodeId}
        nodeType={nodeMetadata.node_type}
        nodeMetadata={nodeMetadata}
        data={nodeData}
        workflowId={workflowId}
        isOutputNode={true}
      />
    </ThemeProvider>
  );

const fakeAsset = (id: string, jobId: string = "job-current"): Asset =>
  ({
    id,
    content_type: "image/png",
    name: id,
    get_url: `http://localhost/api/storage/${id}`,
    thumb_url: `http://localhost/api/storage/${id}?thumb=1`,
    created_at: new Date().toISOString(),
    node_id: nodeId,
    job_id: jobId
  }) as unknown as Asset;

/** Seed durable generations into the asset store (drives the timeline). */
const seedAssets = (assets: Asset[]) => {
  useWorkflowAssetStore.setState({
    assetsByWorkflow: { [workflowId]: assets }
  } as never);
};

/** Seed one live generation into ResultsStore (a mid-flight or in-memory run). */
const seedLiveGeneration = (
  jobId: string,
  outputs: Record<string, unknown>,
  createdAt = Date.now()
) =>
  useResultsStore.getState().upsertLiveGeneration(workflowId, nodeId, jobId, {
    createdAt,
    status: "completed",
    outputs
  });

describe("ContentCardBody results", () => {
  beforeEach(() => {
    mockAssetHistory = [];
    mockLastJobAssets = [];
    mockRunnerState = "idle";
    useResultsStore.setState({ liveGenerations: {} } as never);
    useWorkflowAssetStore.setState({ assetsByWorkflow: {} } as never);
  });

  it("renders the current (latest) generation's output", () => {
    seedLiveGeneration("j1", { output: { type: "image", uri: "stream-1.png" } }, 1);
    seedLiveGeneration("j2", { output: { type: "image", uri: "stream-2.png" } }, 2);

    renderContentCard(metadataForOutput("image"));

    // Single-view current-generation model: the latest generation renders.
    const rendered = screen.getAllByTestId("image-view");
    expect(rendered).toHaveLength(1);
    expect(rendered[0]).toHaveTextContent("stream-2.png");
  });

  it("unwraps a per-output result record for the current generation", () => {
    seedLiveGeneration("j1", { output: { type: "image", uri: "wrapped-1.png" } });

    renderContentCard(metadataForOutput("image"));

    const rendered = screen.getAllByTestId("image-view");
    expect(rendered).toHaveLength(1);
    expect(rendered[0]).toHaveTextContent("wrapped-1.png");
  });

  it("shows pagination controls when the timeline has multiple generations", async () => {
    const assets = [
      fakeAsset("history-asset-1", "job-1"),
      fakeAsset("history-asset-2", "job-2"),
      fakeAsset("history-asset-3", "job-3")
    ];
    seedAssets(assets);
    mockAssetHistory = assets;

    renderContentCard(metadataForOutput("image"));

    // Defaults to the latest (3rd) generation.
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Next output")).toBeInTheDocument();
    expect(screen.getByLabelText("Previous output")).toBeInTheDocument();
  });

  it("switches to grid mode and shows every generation as a thumbnail", async () => {
    const assets = [fakeAsset("first", "job-99"), fakeAsset("second", "job-99")];
    seedAssets(assets);
    mockAssetHistory = assets;
    mockLastJobAssets = assets;

    renderContentCard(metadataForOutput("image"));

    await userEvent.click(screen.getByLabelText("Toggle view mode"));
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
  });

  it("renders a pure transform's output without the gallery navigator", () => {
    seedLiveGeneration("job-x", {
      output: { type: "image", uri: "transformed.png" }
    });

    renderContentCard(transformMetadata());

    // The transformed image renders directly...
    const rendered = screen.getAllByTestId("image-view");
    expect(rendered[0]).toHaveTextContent("transformed.png");
    // ...but a non-auto-saving transform has no gallery to browse, so none of
    // the history-navigator controls are present.
    expect(screen.queryByLabelText("Toggle view mode")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Next output")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Previous output")).not.toBeInTheDocument();
  });

  it("shows the live streaming result during a run, even when prior history exists", () => {
    // DB still holds the previous run, but a new run is mid-flight.
    const old = [fakeAsset("old-run", "job-1")];
    seedAssets(old);
    mockLastJobAssets = old;
    mockAssetHistory = old;
    mockRunnerState = "running";
    seedLiveGeneration("job-current", {
      output: { type: "image", uri: "live-run.png" }
    });

    renderContentCard(metadataForOutput("image"));

    const rendered = screen.getAllByTestId("image-view");
    expect(rendered[0]).toHaveTextContent("live-run.png");
  });

  it("renders the current generation's text in a text content card", () => {
    seedLiveGeneration("j1", { output: "first second" });

    renderContentCard(metadataForOutput("str"));

    const container = screen.getByLabelText("Generated text");
    expect(container).toHaveTextContent("first second");
  });

  it("opens the full text in a popup from the generations navigator", async () => {
    const user = userEvent.setup();
    seedLiveGeneration("j1", { output: "first second" });

    renderContentCard(metadataForOutput("str"));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // The "Open full text" control lives in the generations navigator overlay.
    await user.click(
      screen.getByRole("button", { name: /open full text/i })
    );

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("first second");
  });

  it("shows a history navigator over persisted text generations", () => {
    const textAsset = (
      id: string,
      jobId: string,
      text: string,
      createdAt: string
    ): Asset =>
      ({
        id,
        content_type: "text/plain",
        name: id,
        get_url: `http://localhost/api/storage/${id}.txt`,
        metadata: { text },
        created_at: createdAt,
        node_id: nodeId,
        job_id: jobId
      }) as unknown as Asset;
    const assets = [
      textAsset("t1", "job-1", "first gen", "2026-01-01T00:00:00Z"),
      textAsset("t2", "job-2", "second gen", "2026-01-02T00:00:00Z")
    ];
    seedAssets(assets);
    mockAssetHistory = assets;

    renderContentCard(metadataForOutput("str"));

    // The text card now gets the same navigator as media: pagination over the
    // persisted generations, defaulting to the latest, rendering its inline text.
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Generated text")).toHaveTextContent(
      "second gen"
    );
  });
});

describe("ContentCardBody dynamic inputs", () => {
  const dynamicMetadata = (): NodeMetadata =>
    ({
      ...metadataForOutput("str"),
      node_type: "nodetool.text.Concat",
      title: "Concatenate Text",
      inline_fields: [],
      input_fields: [],
      supports_dynamic_inputs: true
    }) as unknown as NodeMetadata;

  const renderDynamicCard = (dynamicProperties: Record<string, unknown>) =>
    render(
      <ThemeProvider theme={mockTheme}>
        <ContentCardBody
          id={nodeId}
          nodeType="nodetool.text.Concat"
          nodeMetadata={dynamicMetadata()}
          data={
            {
              ...nodeData,
              dynamic_properties: dynamicProperties
            } as NodeData
          }
          workflowId={workflowId}
          isOutputNode={true}
        />
      </ThemeProvider>
    );

  it("renders a handle-bearing input row for each user-added dynamic input", () => {
    const { container } = renderDynamicCard({ input_1: "" });

    const dynamicBlock = container.querySelector(".dynamic-inputs");
    expect(dynamicBlock).not.toBeNull();
    const nodeInputs = dynamicBlock!.querySelector(
      '[data-testid="node-inputs"]'
    );
    // Dynamic inputs render (so each gets a handle) and are editable so the
    // user can rename/delete them.
    expect(nodeInputs).toHaveAttribute("data-show-dynamic", "true");
    expect(nodeInputs).toHaveAttribute("data-editable-dynamic", "true");
    // Unconnected inputs fall back to the node's primary-output type (str
    // here) so they get a real editor instead of the uneditable `any`.
    expect(nodeInputs).toHaveAttribute("data-default-type", "str");
  });

  it("omits the dynamic input block when nothing has been added", () => {
    const { container } = renderDynamicCard({});
    expect(container.querySelector(".dynamic-inputs")).toBeNull();
  });
});

describe("ContentCardBody dynamic inputs", () => {
  const dynamicMetadata = (): NodeMetadata =>
    ({
      ...metadataForOutput("str"),
      node_type: "nodetool.text.Concat",
      title: "Concatenate Text",
      inline_fields: [],
      input_fields: [],
      supports_dynamic_inputs: true
    }) as unknown as NodeMetadata;

  const renderDynamicCard = (dynamicProperties: Record<string, unknown>) =>
    render(
      <ThemeProvider theme={mockTheme}>
        <ContentCardBody
          id={nodeId}
          nodeType="nodetool.text.Concat"
          nodeMetadata={dynamicMetadata()}
          data={
            {
              ...nodeData,
              dynamic_properties: dynamicProperties
            } as NodeData
          }
          workflowId={workflowId}
          isOutputNode={true}
        />
      </ThemeProvider>
    );

  it("renders a handle-bearing input row for each user-added dynamic input", () => {
    const { container } = renderDynamicCard({ input_1: "" });

    const dynamicBlock = container.querySelector(".dynamic-inputs");
    expect(dynamicBlock).not.toBeNull();
    const nodeInputs = dynamicBlock!.querySelector(
      '[data-testid="node-inputs"]'
    );
    // Dynamic inputs render (so each gets a handle) and are editable so the
    // user can rename/delete them.
    expect(nodeInputs).toHaveAttribute("data-show-dynamic", "true");
    expect(nodeInputs).toHaveAttribute("data-editable-dynamic", "true");
    // Unconnected inputs fall back to the node's primary-output type (str
    // here) so they get a real editor instead of the uneditable `any`.
    expect(nodeInputs).toHaveAttribute("data-default-type", "str");
  });

  it("omits the dynamic input block when nothing has been added", () => {
    const { container } = renderDynamicCard({});
    expect(container.querySelector(".dynamic-inputs")).toBeNull();
  });
});
