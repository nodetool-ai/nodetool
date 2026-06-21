import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { ExtractVideoFrameBody } from "../ExtractVideoFrameBody";
import mockTheme from "../../../../__mocks__/themeMock";
import "@testing-library/jest-dom";

const mockSetProperty = jest.fn();
const mockSetPropertyComplete = jest.fn();

jest.mock("../../../../hooks/nodes/useBespokePropertyWriter", () => ({
  useBespokePropertyWriter: jest.fn(() => ({
    setProperty: mockSetProperty,
    setProperties: jest.fn(),
    setPropertyComplete: mockSetPropertyComplete
  }))
}));

let mockUpstreamValue: unknown = undefined;
jest.mock("../../../../hooks/nodes/useNodeIO", () => ({
  __esModule: true,
  useUpstreamValue: () => mockUpstreamValue,
  useNodeOutput: () => undefined
}));

let mockSrc = "";
jest.mock("../../../../hooks/nodes/useMediaSrc", () => ({
  __esModule: true,
  useMediaSrc: () => mockSrc
}));

jest.mock("../../../node/HandleColumn", () => ({
  __esModule: true,
  default: ({ id }: { id: string }) => (
    <div data-testid="handle-column">{id}</div>
  )
}));

jest.mock("../../../inputs/NumberInput", () => ({
  __esModule: true,
  default: ({ value }: { value: number }) => (
    <div data-testid="frame-input">{value}</div>
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

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

const makeProps = (overrides: Record<string, unknown> = {}) => ({
  id: "node-1",
  nodeType: "nodetool.video.ExtractFrame",
  nodeMetadata: {
    node_type: "nodetool.video.ExtractFrame",
    properties: [{ name: "video", type: "video" }],
    outputs: [{ name: "output", type: "image" }],
    is_streaming_output: false
  } as unknown as Parameters<typeof ExtractVideoFrameBody>[0]["nodeMetadata"],
  data: { properties: {} } as unknown as Parameters<
    typeof ExtractVideoFrameBody
  >[0]["data"],
  workflowId: "wf-1",
  isOutputNode: false,
  ...overrides
});

describe("ExtractVideoFrameBody", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpstreamValue = undefined;
    mockSrc = "";
  });

  it("shows the dropzone when no video is connected", () => {
    renderWithTheme(<ExtractVideoFrameBody {...makeProps()} />);
    expect(screen.getByText("Connect a video")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Video frame preview")
    ).not.toBeInTheDocument();
  });

  it("renders the video preview when a source resolves", () => {
    mockSrc = "blob:video";
    mockUpstreamValue = { type: "video", uri: "video.mp4" };
    renderWithTheme(<ExtractVideoFrameBody {...makeProps()} />);
    expect(screen.getByLabelText("Video frame preview")).toBeInTheDocument();
    expect(screen.queryByText("Connect a video")).not.toBeInTheDocument();
  });

  it("renders transport controls and the frame / timecode footer", () => {
    mockSrc = "blob:video";
    renderWithTheme(<ExtractVideoFrameBody {...makeProps()} />);
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Previous frame" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Next frame" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mute" })).toBeInTheDocument();
    expect(screen.getByTestId("frame-input")).toBeInTheDocument();
    expect(screen.getByText("Frame")).toBeInTheDocument();
    expect(screen.getByText("Timecode")).toBeInTheDocument();
  });

  it("commits the extraction time when stepping a frame", () => {
    mockSrc = "blob:video";
    renderWithTheme(<ExtractVideoFrameBody {...makeProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Next frame" }));
    expect(mockSetProperty).toHaveBeenCalledWith("time", expect.any(Number));
    expect(mockSetPropertyComplete).toHaveBeenCalled();
  });

  it("seeds the frame number from the stored time property", () => {
    mockSrc = "blob:video";
    renderWithTheme(
      <ExtractVideoFrameBody
        {...makeProps({ data: { properties: { time: 2 } } })}
      />
    );
    // 2s at the default 30fps estimate → frame 60.
    expect(screen.getByTestId("frame-input")).toHaveTextContent("60");
  });
});
