import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { ToolbarIconButton } from "../ToolbarIconButton";
import mockTheme from "../../../__mocks__/themeMock";

// Mock icon
jest.mock("@mui/icons-material/Save", () => ({
  __esModule: true,
  default: () => <span data-testid="save-icon" />
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

import SaveIcon from "@mui/icons-material/Save";

describe("ToolbarIconButton", () => {
  const mockOnClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders with icon and tooltip", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ToolbarIconButton
          icon={<SaveIcon />}
          tooltip="Save"
          onClick={mockOnClick}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("save-icon")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("calls onClick when clicked", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ToolbarIconButton
          icon={<SaveIcon />}
          tooltip="Save"
          onClick={mockOnClick}
        />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button"));
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it("applies nodrag class by default", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ToolbarIconButton
          icon={<SaveIcon />}
          tooltip="Save"
          onClick={mockOnClick}
        />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toHaveClass("nodrag");
  });

  it("does not apply nodrag class when nodrag is false", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ToolbarIconButton
          icon={<SaveIcon />}
          tooltip="Save"
          onClick={mockOnClick}
          nodrag={false}
        />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).not.toHaveClass("nodrag");
  });

  it("applies active class when active is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ToolbarIconButton
          icon={<SaveIcon />}
          tooltip="Save"
          onClick={mockOnClick}
          active={true}
        />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toHaveClass("active");
  });

  it("is disabled when disabled prop is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ToolbarIconButton
          icon={<SaveIcon />}
          tooltip="Save"
          onClick={mockOnClick}
          disabled={true}
        />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("applies custom className", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ToolbarIconButton
          icon={<SaveIcon />}
          tooltip="Save"
          onClick={mockOnClick}
          className="custom-class"
        />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toHaveClass("custom-class");
  });
});
