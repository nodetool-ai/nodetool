import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import ResultOverlay from "../ResultOverlay";
import "@testing-library/jest-dom";

// Mock OutputRenderer
jest.mock("../OutputRenderer", () => ({
  __esModule: true,
  default: ({ value }: { value: any }) => (
    <div data-testid="output-renderer">{JSON.stringify(value)}</div>
  )
}));

// Mock NodeHistoryPanel
jest.mock("../NodeHistoryPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="node-history-panel" />
}));

// Mock NodeResultHistoryStore
jest.mock("../../../stores/NodeResultHistoryStore", () => ({
  useNodeResultHistoryStore: (selector: any) => {
    const mockState = {
      getHistory: () => []
    };
    return selector ? selector(mockState) : mockState;
  }
}));

const renderWithProviders = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("ResultOverlay", () => {
  it("renders the result using OutputRenderer", () => {
    const result = { type: "image", url: "test.png" };
    renderWithProviders(<ResultOverlay result={result} />);

    const outputRenderer = screen.getByTestId("output-renderer");
    expect(outputRenderer).toBeInTheDocument();
    expect(outputRenderer).toHaveTextContent(JSON.stringify(result));
  });

  it("renders with string result", () => {
    const stringResult = "test string";
    renderWithProviders(<ResultOverlay result={stringResult} />);

    expect(screen.getByTestId("output-renderer")).toHaveTextContent(
      JSON.stringify(stringResult)
    );
  });

  it("renders with object result", () => {
    const objectResult = { key: "value", nested: { data: 123 } };
    renderWithProviders(<ResultOverlay result={objectResult} />);

    expect(screen.getByTestId("output-renderer")).toHaveTextContent(
      JSON.stringify(objectResult)
    );
  });

  it("renders without nodeId and workflowId", () => {
    const result = { test: "data" };
    renderWithProviders(<ResultOverlay result={result} />);

    expect(screen.getByTestId("output-renderer")).toBeInTheDocument();
    // Should not show session results header when no nodeId/workflowId
    expect(screen.queryByText(/Session Results/)).not.toBeInTheDocument();
  });
});
