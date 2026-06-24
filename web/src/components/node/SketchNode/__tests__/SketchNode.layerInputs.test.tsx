/**
 * SketchNode layer-input resolution via generations.
 *
 * A `layer_in_<name>` edge feeds the layer from the SOURCE node's current
 * generation. This test mocks `useNodeGenerations` so the source resolves to a
 * generation whose output is an image, and asserts the editor loads that image
 * URI into the exposed input layer (proving the node reads the generation
 * accessor, not the legacy across-runs result resolver).
 */
import React from "react";
import { waitFor } from "@testing-library/react";
import { renderWithTheme } from "../../../../test-utils/renderWithTheme";

// ─── Heavy children / chrome → inert stubs ──────────────────────────────────
jest.mock("../../NodeHeader", () => ({
  NodeHeader: () => <div data-testid="node-header" />
}));
jest.mock("../../EditableTitle", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../NodeToolButtons", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../NodeOutput", () => ({
  __esModule: true,
  default: () => <div data-testid="node-output" />
}));
jest.mock("../../NodeResizeHandle", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../NodeResizer", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../../HandleTooltip", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));
jest.mock("@xyflow/react", () => ({
  __esModule: true,
  Handle: () => <div data-testid="handle" />,
  NodeToolbar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Position: { Left: "left", Right: "right", Top: "top", Bottom: "bottom" }
}));
jest.mock("react-router-dom", () => ({
  useNavigate: () => jest.fn()
}));
// `useTheme()` resolves from the ThemeProvider in `renderWithTheme`, which is
// backed by the complete mock theme (incl. `vars.palette.common.white`). No
// partial inline theme mock — those drift from the real theme shape.

// ─── Hooks / stores ─────────────────────────────────────────────────────────
jest.mock("../../../../contexts/NodeContext", () => ({
  useNodes: jest.fn()
}));
jest.mock("../../../../hooks/nodes/useSyncEdgeSelection", () => ({
  useSyncEdgeSelection: jest.fn()
}));
jest.mock("../../../../hooks/nodes/useSelect", () => ({
  __esModule: true,
  default: () => ({ activeSelect: null })
}));
jest.mock("../../../../hooks/useDelayedVisibility", () => ({
  useDelayedVisibility: () => false
}));
jest.mock("../../../../stores/NodeFocusStore", () => ({
  useNodeFocusStore: (selector: (s: unknown) => unknown) =>
    selector({ focusedNodeId: null })
}));
jest.mock("../../../../stores/SettingsStore", () => ({
  useSettingsStore: (selector: (s: unknown) => unknown) =>
    selector({ settings: { imageEditorOpenMode: "modal" } })
}));

// ─── Sketch module: real-enough doc helpers, spy loader, inert render utils ──
const loadImageWithDimensions = jest.fn(() =>
  Promise.resolve({ data: "layer-data", naturalWidth: 10, naturalHeight: 10 })
);

const INPUT_LAYER = {
  id: "layer-1",
  name: "Input",
  exposedAsInput: true,
  exposedAsOutput: false,
  locked: false,
  data: null,
  contentBounds: null
};

const baseDoc = {
  layers: [INPUT_LAYER],
  activeLayerId: "layer-1",
  canvas: { width: 100, height: 100 },
  metadata: { updatedAt: "2026-01-01T00:00:00Z" }
};

jest.mock("../../../sketch", () => ({
  __esModule: true,
  SketchModal: () => <div data-testid="sketch-modal" />,
  useSketchStore: { getState: () => ({ setDocument: jest.fn(), document: baseDoc }) },
  createDefaultDocument: () => baseDoc,
  createDefaultLayer: (name: string) => ({ ...INPUT_LAYER, name }),
  deserializeDocument: () => baseDoc,
  serializeDocument: () => "serialized",
  flattenDocument: () => Promise.reject(new Error("no preview in test")),
  exportMask: () => Promise.resolve(null),
  exportLayer: () => Promise.resolve(null),
  canvasToDataUrl: () => "data:image/png;base64,x",
  loadImageWithDimensions
}));
jest.mock("../../../../stores/sketch/SketchInstance", () => ({
  SketchProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

import SketchNode from "../SketchNode";
import { useNodes } from "../../../../contexts/NodeContext";
import useResultsStore from "../../../../stores/ResultsStore";
import { useWorkflowAssetStore } from "../../../../stores/WorkflowAssetStore";

const mockUseNodes = useNodes as unknown as jest.Mock;

const WORKFLOW_ID = "wf-1";
const SOURCE_ID = "src-node";
const LAYER_INPUT_HANDLE = "layer_in_Input";

const edge = {
  id: "e1",
  source: SOURCE_ID,
  sourceHandle: "image",
  target: "sketch-1",
  targetHandle: LAYER_INPUT_HANDLE
};

const sourceNode = { id: SOURCE_ID, type: "nodetool.image.Scale", data: {} };

const seedSourceGeneration = (uri: string) => {
  useResultsStore.getState().upsertLiveGeneration(WORKFLOW_ID, SOURCE_ID, "j1", {
    createdAt: 1,
    status: "completed",
    outputs: { image: { type: "image", uri } }
  });
};

describe("SketchNode layer inputs via generations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useResultsStore.setState({ liveGenerations: {} } as never);
    useWorkflowAssetStore.setState({ assetsByWorkflow: {} } as never);
    loadImageWithDimensions.mockImplementation(() =>
      Promise.resolve({ data: "layer-data", naturalWidth: 10, naturalHeight: 10 })
    );

    mockUseNodes.mockImplementation((selector: (s: unknown) => unknown) =>
      selector({
        edges: [edge],
        updateNodeProperties: jest.fn(),
        updateNodeData: jest.fn(),
        updateEdgeHandle: jest.fn(),
        updateEdge: jest.fn(),
        deleteEdges: jest.fn(),
        findNode: (id: string) => (id === SOURCE_ID ? sourceNode : undefined),
        getSelectedNodeCount: () => 0
      })
    );
  });

  const props = {
    id: "sketch-1",
    type: "nodetool.constant.Sketch",
    selected: false,
    dragging: false,
    data: {
      properties: { sketch_data: "serialized" },
      dynamic_properties: {},
      dynamic_inputs: {},
      dynamic_outputs: {},
      workflow_id: WORKFLOW_ID
    }
  } as unknown as React.ComponentProps<typeof SketchNode>;

  it("loads the source's current-generation image into the exposed input layer", async () => {
    seedSourceGeneration("http://x/from-generation.png");
    renderWithTheme(<SketchNode {...props} />);

    await waitFor(() => {
      expect(loadImageWithDimensions).toHaveBeenCalledWith(
        "http://x/from-generation.png"
      );
    });
  });

  it("does not load any layer image when the source has no generation", () => {
    renderWithTheme(<SketchNode {...props} />);
    expect(loadImageWithDimensions).not.toHaveBeenCalled();
  });
});
