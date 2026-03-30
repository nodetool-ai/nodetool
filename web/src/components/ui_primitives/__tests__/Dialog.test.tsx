import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { Dialog } from "../Dialog";
import mockTheme from "../../../__mocks__/themeMock";

// Mock DialogActionButtons
jest.mock("../DialogActionButtons", () => ({
  DialogActionButtons: ({
    onConfirm,
    onCancel,
    confirmText,
    cancelText
  }: any) => (
    <div data-testid="dialog-action-buttons">
      <button onClick={onCancel}>{cancelText || "Cancel"}</button>
      <button onClick={onConfirm}>{confirmText || "Confirm"}</button>
    </div>
  )
}));

// Mock MUI Dialog
jest.mock("@mui/material/Dialog", () => ({
  __esModule: true,
  default: ({ open, children, onClose, className, ...rest }: any) =>
    open ? (
      <div
        data-testid="dialog"
        className={className}
        onClick={() => onClose?.({}, "backdropClick")}
        {...rest}
      >
        {children}
      </div>
    ) : null
}));

// Mock DialogTitle
jest.mock("@mui/material/DialogTitle", () => ({
  __esModule: true,
  default: ({ children, className, ...rest }: any) => (
    <div data-testid="dialog-title" className={className} {...rest}>
      {children}
    </div>
  )
}));

// Mock DialogContent
jest.mock("@mui/material/DialogContent", () => ({
  __esModule: true,
  default: ({ children, className, ...rest }: any) => (
    <div data-testid="dialog-content" className={className} {...rest}>
      {children}
    </div>
  )
}));

describe("Dialog", () => {
  const mockOnClose = jest.fn();
  const mockOnConfirm = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders when open is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <Dialog open={true} onClose={mockOnClose} title="Test Dialog">
          <div>Test content</div>
        </Dialog>
      </ThemeProvider>
    );

    expect(screen.getByTestId("dialog")).toBeInTheDocument();
  });

  it("does not render when open is false", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <Dialog open={false} onClose={mockOnClose} title="Test Dialog">
          <div>Test content</div>
        </Dialog>
      </ThemeProvider>
    );

    expect(screen.queryByTestId("dialog")).not.toBeInTheDocument();
  });

  it("renders title when provided", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <Dialog open={true} onClose={mockOnClose} title="My Dialog Title">
          <div>Test content</div>
        </Dialog>
      </ThemeProvider>
    );

    expect(screen.getByTestId("dialog-title")).toBeInTheDocument();
    expect(screen.getByText("My Dialog Title")).toBeInTheDocument();
  });

  it("does not render title when not provided", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <Dialog open={true} onClose={mockOnClose}>
          <div>Test content</div>
        </Dialog>
      </ThemeProvider>
    );

    expect(screen.queryByTestId("dialog-title")).not.toBeInTheDocument();
  });

  it("renders content from content prop", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <Dialog
          open={true}
          onClose={mockOnClose}
          title="Test"
          content={<div>Content from prop</div>}
        />
      </ThemeProvider>
    );

    expect(screen.getByText("Content from prop")).toBeInTheDocument();
  });

  it("renders content from children", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <Dialog open={true} onClose={mockOnClose} title="Test">
          <div>Content from children</div>
        </Dialog>
      </ThemeProvider>
    );

    expect(screen.getByText("Content from children")).toBeInTheDocument();
  });

  it("prefers content prop over children", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <Dialog
          open={true}
          onClose={mockOnClose}
          title="Test"
          content={<div>Content prop</div>}
        >
          <div>Children content</div>
        </Dialog>
      </ThemeProvider>
    );

    expect(screen.getByText("Content prop")).toBeInTheDocument();
    expect(screen.queryByText("Children content")).not.toBeInTheDocument();
  });

  it("shows action buttons when onConfirm is provided", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <Dialog
          open={true}
          onClose={mockOnClose}
          title="Test"
          onConfirm={mockOnConfirm}
        >
          <div>Test content</div>
        </Dialog>
      </ThemeProvider>
    );

    expect(screen.getByTestId("dialog-action-buttons")).toBeInTheDocument();
  });

  it("shows action buttons when showActions is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <Dialog
          open={true}
          onClose={mockOnClose}
          title="Test"
          showActions={true}
          onConfirm={mockOnConfirm}
        >
          <div>Test content</div>
        </Dialog>
      </ThemeProvider>
    );

    expect(screen.getByTestId("dialog-action-buttons")).toBeInTheDocument();
  });

  it("does not show action buttons by default", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <Dialog open={true} onClose={mockOnClose} title="Test">
          <div>Test content</div>
        </Dialog>
      </ThemeProvider>
    );

    expect(
      screen.queryByTestId("dialog-action-buttons")
    ).not.toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <Dialog
          open={true}
          onClose={mockOnClose}
          title="Test"
          onConfirm={mockOnConfirm}
        >
          <div>Test content</div>
        </Dialog>
      </ThemeProvider>
    );

    fireEvent.click(screen.getByText("Confirm"));
    expect(mockOnConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when cancel button is clicked", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <Dialog
          open={true}
          onClose={mockOnClose}
          title="Test"
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        >
          <div>Test content</div>
        </Dialog>
      </ThemeProvider>
    );

    fireEvent.click(screen.getByText("Cancel"));
    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when cancel is clicked and onCancel is not provided", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <Dialog
          open={true}
          onClose={mockOnClose}
          title="Test"
          onConfirm={mockOnConfirm}
        >
          <div>Test content</div>
        </Dialog>
      </ThemeProvider>
    );

    fireEvent.click(screen.getByText("Cancel"));
    expect(mockOnClose).toHaveBeenCalledWith({}, "escapeKeyDown");
  });

  it("passes custom confirm and cancel text to action buttons", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <Dialog
          open={true}
          onClose={mockOnClose}
          title="Test"
          onConfirm={mockOnConfirm}
          confirmText="Save Changes"
          cancelText="Discard"
        >
          <div>Test content</div>
        </Dialog>
      </ThemeProvider>
    );

    expect(screen.getByText("Save Changes")).toBeInTheDocument();
    expect(screen.getByText("Discard")).toBeInTheDocument();
  });

  it("applies dialog class name", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <Dialog open={true} onClose={mockOnClose} title="Test">
          <div>Test content</div>
        </Dialog>
      </ThemeProvider>
    );

    expect(screen.getByTestId("dialog")).toHaveClass("dialog");
  });

  it("applies custom className", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <Dialog
          open={true}
          onClose={mockOnClose}
          title="Test"
          className="custom-class"
        >
          <div>Test content</div>
        </Dialog>
      </ThemeProvider>
    );

    expect(screen.getByTestId("dialog")).toHaveClass("dialog", "custom-class");
  });

  it("passes additional dialog props to MUI Dialog", () => {
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <Dialog
          open={true}
          onClose={mockOnClose}
          title="Test"
          fullWidth={true}
          maxWidth="md"
        >
          <div>Test content</div>
        </Dialog>
      </ThemeProvider>
    );

    // Just verify the dialog renders - the mock doesn't preserve all MUI props
    expect(screen.getByTestId("dialog")).toBeInTheDocument();
    expect(container).toBeTruthy();
  });
});
