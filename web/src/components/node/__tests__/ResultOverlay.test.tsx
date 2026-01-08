import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import ResultOverlay from "../ResultOverlay";
import mockTheme from "../../../__mocks__/themeMock";
import "@testing-library/jest-dom";

// Mock MUI Button to avoid reliance on theme.vars internals in tests
jest.mock("@mui/material/Button", () => ({
  __esModule: true,
  default: ({ children, ...rest }: any) => <button {...rest}>{children}</button>
}));

// Mock OutputRenderer
jest.mock("../OutputRenderer", () => ({
  __esModule: true,
  default: ({ value }: { value: any }) => (
    <div data-testid="output-renderer">{JSON.stringify(value)}</div>
  )
}));

const renderWithProviders = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("ResultOverlay", () => {
  const mockOnShowInputs = jest.fn();

  beforeEach(() => {
    mockOnShowInputs.mockClear();
  });

  it("renders the result using OutputRenderer", () => {
    const result = { type: "image", url: "test.png" };
    renderWithProviders(<ResultOverlay result={result} onShowInputs={mockOnShowInputs} />);

    const outputRenderer = screen.getByTestId("output-renderer");
    expect(outputRenderer).toBeInTheDocument();
    expect(outputRenderer).toHaveTextContent(JSON.stringify(result));
  });

  it("displays a button to show inputs", () => {
    const result = { data: "test" };
    renderWithProviders(<ResultOverlay result={result} onShowInputs={mockOnShowInputs} />);

    const button = screen.getByRole("button", { name: /show inputs/i });
    expect(button).toBeInTheDocument();
  });

  it("calls onShowInputs when the button is clicked", async () => {
    const user = userEvent.setup();
    const result = { data: "test" };
    renderWithProviders(<ResultOverlay result={result} onShowInputs={mockOnShowInputs} />);

    const button = screen.getByRole("button", { name: /show inputs/i });
    await user.click(button);

    expect(mockOnShowInputs).toHaveBeenCalledTimes(1);
  });

  it("renders with string result", () => {
    const stringResult = "test string";
    renderWithProviders(<ResultOverlay result={stringResult} onShowInputs={mockOnShowInputs} />);

    expect(screen.getByTestId("output-renderer")).toHaveTextContent(
      JSON.stringify(stringResult)
    );
  });

  it("renders with object result", () => {
    const objectResult = { key: "value", nested: { data: 123 } };
    renderWithProviders(<ResultOverlay result={objectResult} onShowInputs={mockOnShowInputs} />);

    expect(screen.getByTestId("output-renderer")).toHaveTextContent(
      JSON.stringify(objectResult)
    );
  });
});
