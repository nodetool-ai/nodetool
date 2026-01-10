// Mock all MUI components used by KeyboardShortcutsDialog BEFORE any imports
jest.mock("@mui/material/Dialog", () => ({
  __esModule: true,
  default: ({ children, open, onClose, ...rest }: any) => (
    <div data-testid="dialog" data-open={open} {...rest}>
      {open && (
        <div role="dialog" aria-modal="true">
          <button onClick={onClose} data-testid="close-button">Close</button>
          {children}
        </div>
      )}
    </div>
  )
}));

jest.mock("@mui/material/DialogContent", () => ({
  __esModule: true,
  default: ({ children }: any) => <div data-testid="dialog-content">{children}</div>
}));

jest.mock("@mui/material/TextField", () => ({
  __esModule: true,
  default: ({ placeholder, value, onChange }: any) => (
    <input placeholder={placeholder} value={value} onChange={onChange} data-testid="text-field" />
  )
}));

jest.mock("@mui/material/InputAdornment", () => ({
  __esModule: true,
  default: ({ children }: any) => <div data-testid="input-adornment">{children}</div>
}));

jest.mock("@mui/material/Tabs", () => ({
  __esModule: true,
  default: ({ children, value, onChange }: any) => (
    <div data-testid="tabs" data-value={value} onChange={onChange}>
      {children}
    </div>
  )
}));

jest.mock("@mui/material/Tab", () => ({
  __esModule: true,
  default: ({ label, "data-testid": testId }: any) => (
    <button data-testid={testId || "tab"}>{label}</button>
  )
}));

jest.mock("@mui/material/Box", () => ({
  __esModule: true,
  default: ({ children, sx, role }: any) => (
    <div data-testid="box" style={sx} role={role}>{children}</div>
  )
}));

jest.mock("@mui/material/Typography", () => ({
  __esModule: true,
  default: ({ children, variant, component, className }: any) => (
    <span data-testid="typography" data-variant={variant} className={className} data-component={component}>
      {children}
    </span>
  )
}));

jest.mock("../../buttons/CloseButton", () => ({
  __esModule: true,
  default: ({ onClick }: { onClick: () => void }) => (
    <button onClick={onClick} data-testid="close">Close</button>
  )
}));

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import KeyboardShortcutsDialog from "../KeyboardShortcutsDialog";

// Add rounded property to mock theme
(mockTheme as any).vars.rounded = {
  dialog: 8
};
(mockTheme as any).rounded = {
  dialog: 8
};

describe("KeyboardShortcutsDialog", () => {
  const defaultProps = {
    open: true,
    onClose: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders dialog when open", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <KeyboardShortcutsDialog {...defaultProps} />
      </ThemeProvider>
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
  });

  it("does not render dialog when closed", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <KeyboardShortcutsDialog {...defaultProps} open={false} onClose={jest.fn()} />
      </ThemeProvider>
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <KeyboardShortcutsDialog {...defaultProps} />
      </ThemeProvider>
    );

    const closeButton = screen.getByTestId("close");
    fireEvent.click(closeButton);

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it("shows search input field", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <KeyboardShortcutsDialog {...defaultProps} />
      </ThemeProvider>
    );

    expect(screen.getByPlaceholderText("Search shortcuts...")).toBeInTheDocument();
  });

  it("displays keyboard shortcuts", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <KeyboardShortcutsDialog {...defaultProps} />
      </ThemeProvider>
    );

    expect(screen.getByText("Copy")).toBeInTheDocument();
    expect(screen.getByText("Paste")).toBeInTheDocument();
    expect(screen.getByText("Undo")).toBeInTheDocument();
  });
});
