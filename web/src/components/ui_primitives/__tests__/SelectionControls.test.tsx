import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { SelectionControls } from "../SelectionControls";
import mockTheme from "../../../__mocks__/themeMock";

// Mock MUI Button
jest.mock("@mui/material/Button", () => ({
  __esModule: true,
  default: ({ children, disabled, onClick, startIcon, ...rest }: any) => (
    <button disabled={disabled} onClick={onClick} {...rest}>
      {startIcon}
      {children}
    </button>
  )
}));

// Mock Tooltip to just render children
jest.mock("@mui/material/Tooltip", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

describe("SelectionControls", () => {
  const mockOnSelectAll = jest.fn();
  const mockOnClear = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders select all and clear buttons", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <SelectionControls
          selectedCount={0}
          totalCount={10}
          onSelectAll={mockOnSelectAll}
          onClear={mockOnClear}
        />
      </ThemeProvider>
    );

    expect(screen.getByText("Select All")).toBeInTheDocument();
    expect(screen.getByText("Clear")).toBeInTheDocument();
  });

  it("calls onSelectAll when Select All is clicked", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <SelectionControls
          selectedCount={0}
          totalCount={10}
          onSelectAll={mockOnSelectAll}
          onClear={mockOnClear}
        />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByText("Select All"));
    expect(mockOnSelectAll).toHaveBeenCalledTimes(1);
  });

  it("calls onClear when Clear is clicked", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <SelectionControls
          selectedCount={5}
          totalCount={10}
          onSelectAll={mockOnSelectAll}
          onClear={mockOnClear}
        />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByText("Clear"));
    expect(mockOnClear).toHaveBeenCalledTimes(1);
  });

  it("disables Select All when all items are selected", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <SelectionControls
          selectedCount={10}
          totalCount={10}
          onSelectAll={mockOnSelectAll}
          onClear={mockOnClear}
        />
      </ThemeProvider>
    );

    expect(screen.getByText("Select All").closest("button")).toBeDisabled();
  });

  it("disables Clear when no items are selected", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <SelectionControls
          selectedCount={0}
          totalCount={10}
          onSelectAll={mockOnSelectAll}
          onClear={mockOnClear}
        />
      </ThemeProvider>
    );

    expect(screen.getByText("Clear").closest("button")).toBeDisabled();
  });

  it("shows selected count when items are selected", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <SelectionControls
          selectedCount={5}
          totalCount={10}
          onSelectAll={mockOnSelectAll}
          onClear={mockOnClear}
        />
      </ThemeProvider>
    );

    expect(screen.getByText("5 selected")).toBeInTheDocument();
  });

  it("hides count when showCount is false", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <SelectionControls
          selectedCount={5}
          totalCount={10}
          onSelectAll={mockOnSelectAll}
          onClear={mockOnClear}
          showCount={false}
        />
      </ThemeProvider>
    );

    expect(screen.queryByText("5 selected")).not.toBeInTheDocument();
  });

  it("renders custom labels", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <SelectionControls
          selectedCount={0}
          totalCount={10}
          onSelectAll={mockOnSelectAll}
          onClear={mockOnClear}
          selectAllLabel="Choose All"
          clearLabel="Deselect"
        />
      </ThemeProvider>
    );

    expect(screen.getByText("Choose All")).toBeInTheDocument();
    expect(screen.getByText("Deselect")).toBeInTheDocument();
  });

  it("disables both buttons when totalCount is 0", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <SelectionControls
          selectedCount={0}
          totalCount={0}
          onSelectAll={mockOnSelectAll}
          onClear={mockOnClear}
        />
      </ThemeProvider>
    );

    expect(screen.getByText("Select All").closest("button")).toBeDisabled();
    expect(screen.getByText("Clear").closest("button")).toBeDisabled();
  });
});
