import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { DialogActionButtons } from "../DialogActionButtons";
import mockTheme from "../../../__mocks__/themeMock";

// Mock CircularProgress to avoid MUI internal issues
jest.mock("@mui/material/CircularProgress", () => ({
  __esModule: true,
  default: () => <span data-testid="loading-spinner" />
}));

// Mock MUI Button
jest.mock("@mui/material/Button", () => ({
  __esModule: true,
  default: ({ children, disabled, onClick, className, ...rest }: any) => (
    <button disabled={disabled} onClick={onClick} className={className} {...rest}>
      {children}
    </button>
  )
}));

describe("DialogActionButtons", () => {
  const mockOnConfirm = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders confirm and cancel buttons with default text", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <DialogActionButtons
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      </ThemeProvider>
    );

    expect(screen.getByText("Confirm")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("renders with custom button text", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <DialogActionButtons
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
          confirmText="Save"
          cancelText="Discard"
        />
      </ThemeProvider>
    );

    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByText("Discard")).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <DialogActionButtons
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByText("Confirm"));
    expect(mockOnConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when cancel button is clicked", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <DialogActionButtons
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByText("Cancel"));
    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it("shows loading spinner when isLoading is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <DialogActionButtons
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
          isLoading={true}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
    expect(screen.queryByText("Confirm")).not.toBeInTheDocument();
  });

  it("disables buttons when isLoading is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <DialogActionButtons
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
          isLoading={true}
        />
      </ThemeProvider>
    );

    const cancelButton = screen.getByText("Cancel");
    expect(cancelButton.closest("button")).toBeDisabled();
  });

  it("disables confirm button when confirmDisabled is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <DialogActionButtons
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
          confirmDisabled={true}
        />
      </ThemeProvider>
    );

    const confirmButton = screen.getByText("Confirm");
    expect(confirmButton.closest("button")).toBeDisabled();
  });

  it("applies destructive styling when destructive prop is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <DialogActionButtons
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
          destructive={true}
          confirmText="Delete"
        />
      </ThemeProvider>
    );

    const confirmButton = screen.getByText("Delete");
    expect(confirmButton.closest("button")).toHaveClass("button-confirm");
  });
});
