import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import type { Edge } from "@xyflow/react";
import type { ComponentProps } from "react";

import mockTheme from "../../../../__mocks__/themeMock";
import useMetadataStore from "../../../../stores/MetadataStore";
import useResultsStore from "../../../../stores/ResultsStore";
import type { NodeData } from "../../../../stores/NodeData";
import PreviewNode from "../PreviewNode";

let mockEdges: Edge[] = [];

jest.mock("@xyflow/react", () => ({
  Handle: () => <div data-testid="handle" />,
  Position: { Left: "left" },
  useReactFlow: () => ({
    getEdges: () => mockEdges
  })
}));

jest.mock("../../NodeHeader", () => ({
  NodeHeader: () => <div data-testid="node-header" />
}));

jest.mock("../../NodeOutputs", () => ({
  NodeOutputs: () => <div data-testid="node-outputs" />
}));

jest.mock("../../NodeResizeHandle", () => ({
  __esModule: true,
  default: () => <div data-testid="resize-handle" />
}));

jest.mock("../PreviewActions", () => ({
  __esModule: true,
  default: () => <div data-testid="preview-actions" />
}));

jest.mock("../../../../hooks/nodes/useSyncEdgeSelection", () => ({
  useSyncEdgeSelection: jest.fn()
}));

describe("PreviewNode", () => {
  const putImageData = jest.fn();

  beforeEach(() => {
    mockEdges = [];
    putImageData.mockClear();
    jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue({ putImageData } as unknown as CanvasRenderingContext2D);
    useResultsStore.setState({
      results: {},
      outputResults: {},
      progress: {},
      chunks: {},
      tasks: {},
      toolCalls: {},
      edges: {},
      planningUpdates: {},
      previews: {}
    });
    useMetadataStore.setState({
      metadata: {
        "nodetool.workflows.base_node.Preview": {
          namespace: "nodetool.workflows.base_node",
          node_type: "nodetool.workflows.base_node.Preview",
          title: "Preview",
          description: "",
          layout: "default",
          properties: [],
          outputs: [],
          recommended_models: [],
          basic_fields: [],
          required_settings: [],
          is_dynamic: false,
          is_streaming_output: false,
          expose_as_tool: false,
          supports_dynamic_outputs: false
        }
      }
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders realtime video frames from the connected source output", () => {
    const frame = {
      type: "realtime_video_frame" as const,
      data: [255, 0, 0, 255],
      width: 1,
      height: 1,
      stride: 4,
      pixel_format: "rgba8",
      timestamp_ns: 1_000,
      sequence: 1
    };
    mockEdges = [
      {
        id: "sink-to-preview",
        source: "video-sink",
        sourceHandle: "frame",
        target: "preview",
        targetHandle: "value"
      }
    ];
    useResultsStore
      .getState()
      .setOutputResult("workflow-1", "video-sink", frame);

    render(
      <ThemeProvider theme={mockTheme}>
        <PreviewNode
          {...({
            id: "preview",
            type: "nodetool.workflows.base_node.Preview",
            selected: false,
            data: {
              workflow_id: "workflow-1",
              properties: {},
              dynamic_properties: {},
              selectable: true
            } as NodeData
          } as ComponentProps<typeof PreviewNode>)}
        />
      </ThemeProvider>
    );

    expect(screen.getByLabelText("Realtime video frame")).toBeInTheDocument();
    expect(putImageData).toHaveBeenCalledTimes(1);
    const imageData = putImageData.mock.calls[0][0] as ImageData;
    expect(Array.from(imageData.data)).toEqual([255, 0, 0, 255]);
  });
});
