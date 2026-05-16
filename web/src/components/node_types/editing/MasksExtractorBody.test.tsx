import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MasksExtractorBody } from "./MasksExtractorBody";

jest.mock("../../../stores/ResultsStore", () => ({
  __esModule: true,
  default: jest.fn()
}));

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: jest.fn()
}));

jest.mock("../../../hooks/nodes/useRunSingleNode", () => ({
  useRunSingleNode: jest.fn()
}));

jest.mock("../../node/HandleColumn", () => ({
  __esModule: true,
  default: () => <div data-testid="handle-column" />
}));

jest.mock("../../node/ImageView", () => ({
  __esModule: true,
  default: ({ source }: { source?: string | Uint8Array }) => (
    <img data-testid="image-view" data-source={source} alt="preview" />
  )
}));

jest.mock("../../node/NodeOutputs", () => ({
  NodeOutputs: () => <div data-testid="node-outputs" />
}));

jest.mock("../../node/NodeProgress", () => ({
  __esModule: true,
  default: () => <div data-testid="node-progress" />
}));

jest.mock("../../ui_primitives", () => ({
  CheckerDropzone: ({ message }: { message: string }) => (
    <div data-testid="checker-dropzone">{message}</div>
  ),
  FlexColumn: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  FlexRow: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  RunModelButton: ({
    label,
    isRunning,
    onClick
  }: {
    label: string;
    isRunning: boolean;
    onClick: () => void;
  }) => (
    <button data-testid="run-model-button" disabled={isRunning} onClick={onClick}>
      {label}
    </button>
  ),
  ToggleGroup: ({
    children,
    value,
    onChange
  }: {
    children: React.ReactNode;
    value: string;
    onChange: (_: unknown, next: string) => void;
  }) => (
    <div data-testid="toggle-group" data-value={value}>
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement, {
              onClick: () => onChange(null, (child as React.ReactElement).props.value)
            })
          : child
      )}
    </div>
  ),
  ToggleOption: ({
    children,
    value,
    ...props
  }: {
    children: React.ReactNode;
    value: string;
    [key: string]: unknown;
  }) => (
    <button data-testid={`toggle-option-${value}`} {...props}>
      {children}
    </button>
  )
}));

jest.mock("@mui/material/styles", () => ({
  useTheme: () => ({
    spacing: (n: number) => `${n * 8}px`,
    vars: { palette: { grey: { 900: "#000" }, divider: "#ccc", common: { white: "#fff" }, text: { secondary: "#999", primary: "#fff" }, action: { hover: "#333" } } },
    fontSizeSmaller: "0.75rem",
    fontFamily2: "sans-serif"
  })
}));

import useResultsStore from "../../../stores/ResultsStore";
import { useNodes } from "../../../contexts/NodeContext";
import { useRunSingleNode } from "../../../hooks/nodes/useRunSingleNode";

const mockUseResultsStore = useResultsStore as unknown as jest.Mock;
const mockUseNodes = useNodes as unknown as jest.Mock;
const mockUseRunSingleNode = useRunSingleNode as unknown as jest.Mock;

describe("MasksExtractorBody", () => {
  const defaultProps = {
    id: "node-1",
    nodeType: "replicate.image.background.Bria_RemoveBackground",
    nodeMetadata: {
      node_type: "replicate.image.background.Bria_RemoveBackground",
      properties: [{ name: "image", type: "image" }],
      outputs: []
    },
    data: { properties: {} },
    workflowId: "wf-1",
    status: "idle",
    isOutputNode: false
  };

  const mockRunSingleNode = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseNodes.mockReturnValue(undefined);
    mockUseResultsStore.mockReturnValue(undefined);
    mockUseRunSingleNode.mockReturnValue({
      runSingleNode: mockRunSingleNode,
      isWorkflowRunning: false
    });
  });

  it("renders the Image tab by default", () => {
    render(
      <MasksExtractorBody
        {...defaultProps}
        data={{ properties: { image: { uri: "test.jpg" } } }}
      />
    );
    expect(screen.getByTestId("image-view")).toBeInTheDocument();
  });

  it("switches to Mask tab on toggle click", () => {
    render(<MasksExtractorBody {...defaultProps} />);

    const maskToggle = screen.getByTestId("toggle-option-mask");
    fireEvent.click(maskToggle);

    expect(screen.queryByTestId("image-view")).not.toBeInTheDocument();
    expect(screen.getByTestId("checker-dropzone")).toHaveTextContent(
      "Run the node to extract a mask"
    );
  });

  it("shows upstream image in Image tab when edge is connected", () => {
    mockUseNodes.mockReturnValue({
      id: "edge-1",
      source: "upstream-node",
      target: "node-1",
      sourceHandle: "output",
      targetHandle: "image"
    });

    mockUseResultsStore.mockImplementation((selector: (state: unknown) => unknown) => {
      if (typeof selector === "function") {
        const state = {
          getResult: (_wf: string, nodeId: string) => {
            if (nodeId === "upstream-node") {
              return { output: { uri: "upstream.jpg" } };
            }
            return undefined;
          }
        };
        return selector(state);
      }
      return undefined;
    });

    render(<MasksExtractorBody {...defaultProps} />);

    const img = screen.getByTestId("image-view");
    expect(img).toHaveAttribute("data-source", "upstream.jpg");
  });

  it("shows own result in Mask tab", () => {
    mockUseResultsStore.mockImplementation((selector: (state: unknown) => unknown) => {
      if (typeof selector === "function") {
        const state = {
          getResult: (_wf: string, nodeId: string) => {
            if (nodeId === "node-1") {
              return { output: { uri: "mask.png" } };
            }
            return undefined;
          }
        };
        return selector(state);
      }
      return undefined;
    });

    render(<MasksExtractorBody {...defaultProps} />);

    const maskToggle = screen.getByTestId("toggle-option-mask");
    fireEvent.click(maskToggle);

    const img = screen.getByTestId("image-view");
    expect(img).toHaveAttribute("data-source", "mask.png");
  });

  it("disables run button and shows progress when running", () => {
    render(<MasksExtractorBody {...defaultProps} status="running" />);

    expect(screen.getByTestId("run-model-button")).toBeDisabled();
    expect(screen.getByTestId("node-progress")).toBeInTheDocument();
  });

  it("calls runSingleNode when Recalculate button is clicked", () => {
    render(<MasksExtractorBody {...defaultProps} />);

    const button = screen.getByTestId("run-model-button");
    fireEvent.click(button);

    expect(mockRunSingleNode).toHaveBeenCalledTimes(1);
  });
});
