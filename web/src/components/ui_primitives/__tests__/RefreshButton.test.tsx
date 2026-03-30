import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { RefreshButton } from "../RefreshButton";
import mockTheme from "../../../__mocks__/themeMock";

// Mock icons
jest.mock("@mui/icons-material/Refresh", () => ({
  __esModule: true,
  default: () => <span data-testid="refresh-icon" />
}));

jest.mock("@mui/icons-material/RestartAlt", () => ({
  __esModule: true,
  default: () => <span data-testid="restart-icon" />
}));

// Mock CircularProgress
jest.mock("@mui/material/CircularProgress", () => ({
  __esModule: true,
  default: () => <span data-testid="loading-spinner" />
}));

// Mock MUI IconButton
jest.mock("@mui/material/IconButton", () => ({
  __esModule: true,
  default: ({ children, disabled, onClick, className, ...rest }: any) => (
    <button disabled={disabled} onClick={onClick} className={className} {...rest}>
      {children}
    </button>
  )
}));

// Mock Tooltip to just render children
jest.mock("@mui/material/Tooltip", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

describe("RefreshButton", () => {
  const mockOnClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders with refresh icon by default", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <RefreshButton onClick={mockOnClick} />
      </ThemeProvider>
    );

    expect(screen.getByTestId("refresh-icon")).toBeInTheDocument();
  });

  it("renders with restart icon when iconVariant is reset", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <RefreshButton onClick={mockOnClick} iconVariant="reset" />
      </ThemeProvider>
    );

    expect(screen.getByTestId("restart-icon")).toBeInTheDocument();
  });

  it("calls onClick when clicked", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <RefreshButton onClick={mockOnClick} />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button"));
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it("shows loading spinner when isLoading is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <RefreshButton onClick={mockOnClick} isLoading={true} />
      </ThemeProvider>
    );

    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
    expect(screen.queryByTestId("refresh-icon")).not.toBeInTheDocument();
  });

  it("is disabled when isLoading is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <RefreshButton onClick={mockOnClick} isLoading={true} />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("is disabled when disabled prop is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <RefreshButton onClick={mockOnClick} disabled={true} />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("applies nodrag class by default", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <RefreshButton onClick={mockOnClick} />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toHaveClass("nodrag");
  });

  it("applies loading class when isLoading is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <RefreshButton onClick={mockOnClick} isLoading={true} />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toHaveClass("loading");
  });

  it("is keyboard accessible (tabIndex=0) by default", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <RefreshButton onClick={mockOnClick} />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toHaveAttribute("tabIndex", "0");
  });

  it("accepts custom tabIndex", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <RefreshButton onClick={mockOnClick} tabIndex={-1} />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toHaveAttribute("tabIndex", "-1");
  });

  it("has accessible label from tooltip", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <RefreshButton onClick={mockOnClick} tooltip="Refresh Data" />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toHaveAttribute("aria-label", "Refresh Data");
  });
});
