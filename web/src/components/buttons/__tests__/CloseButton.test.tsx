import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { CloseButton } from "../../ui_primitives";
import mockTheme from "../../../__mocks__/themeMock";

// Mock MUI IconButton to avoid reliance on theme.vars internals in tests
jest.mock("@mui/material/IconButton", () => ({
  __esModule: true,
  default: ({ children, ...rest }: any) => <button {...rest}>{children}</button>
}));

// Mock Tooltip to avoid wrapper complexity
jest.mock("@mui/material/Tooltip", () => ({
  __esModule: true,
  default: ({ children }: any) => <>{children}</>
}));

// Mock icon to a simple element
jest.mock("@mui/icons-material/Close", () => ({
  __esModule: true,
  default: () => <span data-testid="close-icon" />
}));

describe("CloseButton", () => {
  it("renders correctly", () => {
    const mockOnClick = jest.fn();

    render(
      <ThemeProvider theme={mockTheme}>
        <CloseButton onClick={mockOnClick} />
      </ThemeProvider>
    );

    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass("close-button");
  });

  it("applies custom className when provided", () => {
    const mockOnClick = jest.fn();
    const customClass = "custom-class";

    render(
      <ThemeProvider theme={mockTheme}>
        <CloseButton className={customClass} onClick={mockOnClick} />
      </ThemeProvider>
    );

    const button = screen.getByRole("button");
    expect(button).toHaveClass("custom-class");
    expect(button).toHaveClass("close-button");
  });

  it("calls onClick when clicked", () => {
    const mockOnClick = jest.fn();

    render(
      <ThemeProvider theme={mockTheme}>
        <CloseButton onClick={mockOnClick} />
      </ThemeProvider>
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });
});
