import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

// Mock MUI Button to avoid theme complexity with MUI v7 properties
jest.mock("@mui/material", () => ({
  ...jest.requireActual("@mui/material"),
  Button: ({ children, onClick, startIcon, sx, ...props }: any) => (
    <button onClick={onClick} data-testid="show-inputs-button" {...props}>
      {startIcon && <span className="icon">{startIcon}</span>}
      {children}
    </button>
  )
}));

const renderWithTheme = (component: React.ReactNode) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("ResultOverlay", () => {
  const mockOnShowInputs = jest.fn();

  beforeEach(() => {
    mockOnShowInputs.mockClear();
  });

  it("renders the result using OutputRenderer", () => {
    const result = { type: "image", url: "test.png" };
    renderWithTheme(<ResultOverlay result={result} onShowInputs={mockOnShowInputs} />);

    const outputRenderer = screen.getByTestId("output-renderer");
    expect(outputRenderer).toBeInTheDocument();
    expect(outputRenderer).toHaveTextContent(JSON.stringify(result));
  });

  it("displays a button to show inputs", () => {
    const result = { data: "test" };
    renderWithTheme(<ResultOverlay result={result} onShowInputs={mockOnShowInputs} />);

    const button = screen.getByRole("button", { name: /show inputs/i });
    expect(button).toBeInTheDocument();
  });

  it("calls onShowInputs when the button is clicked", async () => {
    const user = userEvent.setup();
    const result = { data: "test" };
    renderWithTheme(<ResultOverlay result={result} onShowInputs={mockOnShowInputs} />);

    const button = screen.getByRole("button", { name: /show inputs/i });
    await user.click(button);

    expect(mockOnShowInputs).toHaveBeenCalledTimes(1);
  });

  it("renders with different result types", () => {
    const stringResult = "test string";
    const { rerender } = renderWithTheme(
      <ResultOverlay result={stringResult} onShowInputs={mockOnShowInputs} />
    );

    expect(screen.getByTestId("output-renderer")).toHaveTextContent(
      JSON.stringify(stringResult)
    );

    const objectResult = { key: "value", nested: { data: 123 } };
    rerender(
      <ThemeProvider theme={mockTheme}>
        <ResultOverlay result={objectResult} onShowInputs={mockOnShowInputs} />
      </ThemeProvider>
    );

    expect(screen.getByTestId("output-renderer")).toHaveTextContent(
      JSON.stringify(objectResult)
    );
  });
});
