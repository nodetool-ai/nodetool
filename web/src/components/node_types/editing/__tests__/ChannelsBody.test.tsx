import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { ChannelsBody } from "../ChannelsBody";
import mockTheme from "../../../../__mocks__/themeMock";
import "@testing-library/jest-dom";

const mockSetProperty = jest.fn();
const mockSetPropertyComplete = jest.fn();

jest.mock("../../../../hooks/nodes/useBespokePropertyWriter", () => ({
  useBespokePropertyWriter: jest.fn(() => ({
    setProperty: mockSetProperty,
    setPropertyComplete: mockSetPropertyComplete
  }))
}));

jest.mock("../../../../stores/ResultsStore", () => ({
  __esModule: true,
  default: jest.fn()
}));

jest.mock("../../../node/HandleColumn", () => ({
  __esModule: true,
  default: ({ id }: { id: string }) => (
    <div data-testid="handle-column">{id}</div>
  )
}));

jest.mock("../../../node/ImageView", () => ({
  __esModule: true,
  default: ({ source }: { source?: string | Uint8Array }) => (
    <div data-testid="image-view">{typeof source === "string" ? source : "binary"}</div>
  )
}));

jest.mock("../../../node/NodeOutputs", () => ({
  __esModule: true,
  NodeOutputs: () => <div data-testid="node-outputs" />
}));

jest.mock("../../../node/NodeProgress", () => ({
  __esModule: true,
  default: () => <div data-testid="node-progress" />
}));

import useResultsStore from "../../../../stores/ResultsStore";

const mockedUseResultsStore = useResultsStore as unknown as jest.Mock;

const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);
};

const makeProps = (overrides: Record<string, unknown> = {}) => ({
  id: "node-1",
  nodeType: "nodetool.image.Channels",
  nodeMetadata: {
    node_type: "nodetool.image.Channels",
    properties: [{ name: "image", type: "image" }],
    outputs: [],
    is_streaming_output: false
  } as unknown as Parameters<typeof ChannelsBody>[0]["nodeMetadata"],
  data: { properties: {} } as unknown as Parameters<typeof ChannelsBody>[0]["data"],
  workflowId: "wf-1",
  isOutputNode: false,
  ...overrides
});

describe("ChannelsBody", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseResultsStore.mockImplementation((selector: any) =>
      selector({ getResult: () => null })
    );
  });

  it("shows dropzone when no result is available", () => {
    renderWithTheme(<ChannelsBody {...makeProps()} />);
    expect(screen.getByText("Connect an image, then run")).toBeInTheDocument();
    expect(screen.queryByTestId("image-view")).not.toBeInTheDocument();
  });

  it("renders ImageView when a result is present", () => {
    mockedUseResultsStore.mockImplementation((selector: any) =>
      selector({
        getResult: () => ({ output: { uri: "test-image.png" } })
      })
    );
    renderWithTheme(<ChannelsBody {...makeProps()} />);
    expect(screen.getByTestId("image-view")).toBeInTheDocument();
    expect(screen.getByText("test-image.png")).toBeInTheDocument();
  });

  it("calls setProperty with correct value when toggling a channel", () => {
    renderWithTheme(<ChannelsBody {...makeProps()} />);

    const greenButton = screen.getByRole("button", { name: "Green" });
    fireEvent.click(greenButton);

    expect(mockSetProperty).toHaveBeenCalledWith("channel", "green");
    expect(mockSetPropertyComplete).toHaveBeenCalled();
  });

  it("renders all channel toggle options", () => {
    renderWithTheme(<ChannelsBody {...makeProps()} />);

    expect(screen.getByRole("button", { name: "Red" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Green" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Blue" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Luminance" })).toBeInTheDocument();
  });
});
