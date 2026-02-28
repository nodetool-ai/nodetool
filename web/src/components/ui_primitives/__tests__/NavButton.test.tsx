import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { NavButton } from "../NavButton";
import mockTheme from "../../../__mocks__/themeMock";

// Mock icon
const MockIcon = () => <span data-testid="mock-icon" />;

// Mock MUI IconButton
jest.mock("@mui/material/IconButton", () => ({
  __esModule: true,
  default: ({ children, disabled, onClick, className, "aria-label": ariaLabel, ...rest }: any) => (
    <button
      disabled={disabled}
      onClick={onClick}
      className={className}
      aria-label={ariaLabel}
      {...rest}
    >
      {children}
    </button>
  )
}));

// Mock MUI Button
jest.mock("@mui/material/Button", () => ({
  __esModule: true,
  default: ({ children, disabled, onClick, className, startIcon, ...rest }: any) => (
    <button
      disabled={disabled}
      onClick={onClick}
      className={className}
      {...rest}
    >
      {startIcon}
      {children}
    </button>
  )
}));

// Mock Tooltip
jest.mock("@mui/material/Tooltip", () => ({
  __esModule: true,
  default: ({ children, title }: { children: React.ReactNode; title?: React.ReactNode }) => (
    <div data-tooltip={typeof title === "string" ? title : "tooltip"}>
      {children}
    </div>
  )
}));

describe("NavButton", () => {
  const mockOnClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const defaultProps = {
    icon: <MockIcon />,
    onClick: mockOnClick
  };

  it("renders with icon only", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NavButton {...defaultProps} />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders with label", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NavButton {...defaultProps} label="Back to Dashboard" />
      </ThemeProvider>
    );
    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("Back to Dashboard");
  });

  it("renders as IconButton when no label is provided", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NavButton {...defaultProps} />
      </ThemeProvider>
    );
    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
    expect(screen.getByTestId("mock-icon")).toBeInTheDocument();
  });

  it("has aria-label for accessibility when rendered as IconButton (no label)", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NavButton {...defaultProps} tooltip="Go Back" />
      </ThemeProvider>
    );
    // When rendered as IconButton (no label), aria-label is present
    expect(screen.getByRole("button")).toHaveAttribute("aria-label", "Go Back");
  });

  it("has aria-label matching tooltip prop for IconButton variant", () => {
    const tooltipText = "Navigate to Home";
    render(
      <ThemeProvider theme={mockTheme}>
        <NavButton {...defaultProps} tooltip={tooltipText} />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-label", tooltipText);
  });

  it("uses label as visible text for Button variant (no aria-label needed)", () => {
    const labelText = "Go to Dashboard";
    render(
      <ThemeProvider theme={mockTheme}>
        <NavButton {...defaultProps} label={labelText} />
      </ThemeProvider>
    );
    const button = screen.getByRole("button");
    // Button with visible text doesn't need aria-label
    // The visible text serves as the accessible name
    expect(button).toHaveTextContent(labelText);
    expect(button.getAttribute("aria-label")).toBeNull();
  });

  it("uses tooltip as aria-label for IconButton variant (when no label provided)", () => {
    const tooltipText = "Navigate Home";
    render(
      <ThemeProvider theme={mockTheme}>
        <NavButton {...defaultProps} tooltip={tooltipText} />
      </ThemeProvider>
    );
    // Only IconButton variant gets aria-label
    expect(screen.getByRole("button")).toHaveAttribute("aria-label", tooltipText);
  });

  it("calls onClick handler when clicked", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NavButton {...defaultProps} />
      </ThemeProvider>
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it("is disabled when disabled prop is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NavButton {...defaultProps} disabled={true} />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("does not call onClick when disabled", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NavButton {...defaultProps} disabled={true} />
      </ThemeProvider>
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(mockOnClick).not.toHaveBeenCalled();
  });

  it("renders with active state", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NavButton {...defaultProps} active={true} />
      </ThemeProvider>
    );
    const button = screen.getByRole("button");
    expect(button).toHaveClass("active");
  });

  it("renders with different nav sizes", () => {
    const { rerender } = render(
      <ThemeProvider theme={mockTheme}>
        <NavButton {...defaultProps} navSize="small" />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={mockTheme}>
        <NavButton {...defaultProps} navSize="medium" />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={mockTheme}>
        <NavButton {...defaultProps} navSize="large" />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NavButton {...defaultProps} className="custom-class" />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toHaveClass("custom-class");
  });

  it("applies nodrag class by default", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NavButton {...defaultProps} />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toHaveClass("nodrag");
  });

  it("does not apply nodrag class when nodrag is false", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NavButton {...defaultProps} nodrag={false} />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).not.toHaveClass("nodrag");
  });

  it("renders with custom color prop", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NavButton {...defaultProps} color="primary" />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders with different tooltip placements", () => {
    const { rerender } = render(
      <ThemeProvider theme={mockTheme}>
        <NavButton {...defaultProps} tooltipPlacement="top" />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={mockTheme}>
        <NavButton {...defaultProps} tooltipPlacement="bottom" />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={mockTheme}>
        <NavButton {...defaultProps} tooltipPlacement="left" />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={mockTheme}>
        <NavButton {...defaultProps} tooltipPlacement="right" />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});
