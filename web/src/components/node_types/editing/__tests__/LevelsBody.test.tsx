import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import LevelsBody from "../LevelsBody";
import mockTheme from "../../../../__mocks__/themeMock";

const mockSetProperty = jest.fn();
const mockSetProperties = jest.fn();
const mockSetPropertyComplete = jest.fn();

jest.mock("../../../../hooks/nodes/useBespokePropertyWriter", () => ({
  useBespokePropertyWriter: jest.fn(() => ({
    setProperty: mockSetProperty,
    setProperties: mockSetProperties,
    setPropertyComplete: mockSetPropertyComplete
  }))
}));

jest.mock("../../../../stores/ResultsStore", () => ({
  __esModule: true,
  default: jest.fn((selector: any) =>
    selector({
      getOutputResult: () => undefined,
      getResult: () => undefined,
      getPreview: () => undefined
    })
  )
}));

jest.mock("../../../../utils/histogram/histogramAsync", () => ({
  computeHistogramAsync: jest.fn(() =>
    Promise.resolve({
      r: new Uint32Array(256),
      g: new Uint32Array(256),
      b: new Uint32Array(256),
      luminance: new Uint32Array(256),
      pixelCount: 0
    })
  )
}));

const defaultProps = {
  id: "node-1",
  nodeType: "nodetool.image.Levels",
  nodeMetadata: {
    node_type: "nodetool.image.Levels",
    properties: [
      { name: "image", type: { type: "image", type_args: [] } }
    ],
    outputs: [{ name: "output", type: { type: "image", type_args: [] } }],
    is_streaming_output: false
  } as unknown as import("../../../../stores/ApiTypes").NodeMetadata,
  data: { properties: {} } as import("../../../../stores/NodeData").NodeData,
  workflowId: "wf-1",
  status: "completed",
  isOutputNode: false
};

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

describe("LevelsBody", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders dropzone when no image is connected", () => {
    renderWithTheme(<LevelsBody {...defaultProps} />);
    expect(screen.getByText(/Connect an image/i)).toBeInTheDocument();
  });

  it("renders with an image result", () => {
    const mockGetResult = jest.fn(() => ({
      output: { uri: "http://example.com/image.png" }
    }));
    require("../../../../stores/ResultsStore").default.mockImplementation(
      (selector: any) =>
        selector({
          getOutputResult: () => undefined,
          getPreview: () => undefined,
          getResult: mockGetResult
        })
    );

    renderWithTheme(<LevelsBody {...defaultProps} />);
    expect(document.querySelector(".levels-body")).toBeInTheDocument();
  });

  it("switches channel when toggle buttons are clicked", () => {
    renderWithTheme(<LevelsBody {...defaultProps} />);
    const gButton = screen.getByRole("button", { name: /G/i });
    fireEvent.click(gButton);
    expect(gButton).toHaveAttribute("aria-pressed", "true");
  });

  it("calls setProperty when a slider changes", () => {
    renderWithTheme(<LevelsBody {...defaultProps} />);
    const sliders = screen.getAllByRole("slider");
    expect(sliders.length).toBeGreaterThanOrEqual(3);

    fireEvent.change(sliders[0], { target: { value: "50" } });
    expect(mockSetProperty).toHaveBeenCalledWith("r_black", 50);
  });

  it("calls setProperties with defaults on reset", () => {
    renderWithTheme(<LevelsBody {...defaultProps} />);
    const resetButton = screen.getByRole("button", { name: /Reset levels/i });
    fireEvent.click(resetButton);
    expect(mockSetProperties).toHaveBeenCalledWith({
      r_black: 0,
      r_gamma: 1,
      r_white: 255,
      g_black: 0,
      g_gamma: 1,
      g_white: 255,
      b_black: 0,
      b_gamma: 1,
      b_white: 255
    });
    expect(mockSetPropertyComplete).toHaveBeenCalled();
  });
});
