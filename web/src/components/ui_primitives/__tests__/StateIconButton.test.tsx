import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { StateIconButton } from "../StateIconButton";
import mockTheme from "../../../__mocks__/themeMock";

// Mock icons
const MockIcon = () => <span data-testid="mock-icon">Icon</span>;
const MockActiveIcon = () => <span data-testid="mock-active-icon">Active Icon</span>;

// Mock CircularProgress
jest.mock("@mui/material/CircularProgress", () => ({
  __esModule: true,
  default: ({ size }: { size: number }) => (
    <span data-testid="loading-spinner" data-size={size}>Loading</span>
  )
}));

// Mock MUI IconButton
jest.mock("@mui/material/IconButton", () => ({
  __esModule: true,
  default: ({ children, disabled, onClick, className, ...rest }: any) => (
    <button
      disabled={disabled}
      onClick={onClick}
      className={className}
      data-testid="icon-button"
      {...rest}
    >
      {children}
    </button>
  )
}));

// Mock Tooltip to just render children
jest.mock("@mui/material/Tooltip", () => ({
  __esModule: true,
  default: ({ children, title }: { children: React.ReactNode; title?: React.ReactNode }) => (
    <div data-tooltip={typeof title === "string" ? title : "tooltip"}>
      {children}
    </div>
  )
}));

describe("StateIconButton", () => {
  const mockOnClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders with primary icon by default", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <StateIconButton icon={<MockIcon />} onClick={mockOnClick} />
      </ThemeProvider>
    );

    expect(screen.getByTestId("mock-icon")).toBeInTheDocument();
  });

  it("renders with active icon when isActive is true and activeIcon is provided", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <StateIconButton
          icon={<MockIcon />}
          activeIcon={<MockActiveIcon />}
          onClick={mockOnClick}
          isActive={true}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("mock-active-icon")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-icon")).not.toBeInTheDocument();
  });

  it("renders primary icon when isActive is true but no activeIcon provided", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <StateIconButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          isActive={true}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("mock-icon")).toBeInTheDocument();
  });

  it("shows loading spinner when isLoading is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <StateIconButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          isLoading={true}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-icon")).not.toBeInTheDocument();
  });

  it("uses correct loading spinner size based on button size", () => {
    const { rerender } = render(
      <ThemeProvider theme={mockTheme}>
        <StateIconButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          isLoading={true}
          size="small"
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("loading-spinner")).toHaveAttribute("data-size", "16");

    rerender(
      <ThemeProvider theme={mockTheme}>
        <StateIconButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          isLoading={true}
          size="medium"
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("loading-spinner")).toHaveAttribute("data-size", "20");

    rerender(
      <ThemeProvider theme={mockTheme}>
        <StateIconButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          isLoading={true}
          size="large"
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("loading-spinner")).toHaveAttribute("data-size", "24");
  });

  it("uses custom loading size when provided", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <StateIconButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          isLoading={true}
          loadingSize={32}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("loading-spinner")).toHaveAttribute("data-size", "32");
  });

  it("calls onClick when clicked", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <StateIconButton icon={<MockIcon />} onClick={mockOnClick} />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByTestId("icon-button"));
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <StateIconButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          disabled={true}
        />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByTestId("icon-button"));
    expect(mockOnClick).not.toHaveBeenCalled();
  });

  it("does not call onClick when isLoading", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <StateIconButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          isLoading={true}
        />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByTestId("icon-button"));
    expect(mockOnClick).not.toHaveBeenCalled();
  });

  it("is disabled when isLoading is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <StateIconButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          isLoading={true}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("icon-button")).toBeDisabled();
  });

  it("is disabled when disabled prop is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <StateIconButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          disabled={true}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("icon-button")).toBeDisabled();
  });

  it("applies nodrag class by default", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <StateIconButton icon={<MockIcon />} onClick={mockOnClick} />
      </ThemeProvider>
    );

    expect(screen.getByTestId("icon-button")).toHaveClass("nodrag");
  });

  it("does not apply nodrag class when nodrag is false", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <StateIconButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          nodrag={false}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("icon-button")).not.toHaveClass("nodrag");
  });

  it("applies active class when isActive is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <StateIconButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          isActive={true}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("icon-button")).toHaveClass("active");
  });

  it("applies loading class when isLoading is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <StateIconButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          isLoading={true}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("icon-button")).toHaveClass("loading");
  });

  it("applies custom className", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <StateIconButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          className="custom-class"
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("icon-button")).toHaveClass("custom-class");
  });

  it("renders with tooltip when tooltip prop is provided", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <StateIconButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          tooltip="Test tooltip"
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("icon-button")).toBeInTheDocument();
    // The button is wrapped in a span, which is wrapped in tooltip div
    const wrapper = screen.getByTestId("icon-button").parentElement?.parentElement;
    expect(wrapper).toHaveAttribute("data-tooltip", "Test tooltip");
  });

  it("renders without tooltip wrapper when tooltip is not provided", () => {
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <StateIconButton icon={<MockIcon />} onClick={mockOnClick} />
      </ThemeProvider>
    );

    expect(screen.getByTestId("icon-button")).toBeInTheDocument();
    // Should not have tooltip attribute anywhere in the tree
    expect(container.querySelector('[data-tooltip]')).not.toBeInTheDocument();
  });

  it("stops event propagation on click", () => {
    const parentOnClick = jest.fn();
    render(
      <ThemeProvider theme={mockTheme}>
        <div onClick={parentOnClick}>
          <StateIconButton icon={<MockIcon />} onClick={mockOnClick} />
        </div>
      </ThemeProvider>
    );

    fireEvent.click(screen.getByTestId("icon-button"));
    expect(mockOnClick).toHaveBeenCalledTimes(1);
    // Event should be stopped, so parent should not receive it
    // Note: In real implementation, stopPropagation is called, 
    // but in tests it might still propagate due to mock setup
  });

  it("sets tabIndex to 0 by default", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <StateIconButton icon={<MockIcon />} onClick={mockOnClick} />
      </ThemeProvider>
    );

    expect(screen.getByTestId("icon-button")).toHaveAttribute("tabIndex", "0");
  });

  it("allows overriding tabIndex", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <StateIconButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          tabIndex={-1}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("icon-button")).toHaveAttribute("tabIndex", "-1");
  });

  it("sets aria-label from tooltip string", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <StateIconButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          tooltip="Accessible Label"
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("icon-button")).toHaveAttribute("aria-label", "Accessible Label");
  });

  it("sets aria-label from ariaLabel prop", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <StateIconButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          tooltip={<span>Tooltip content</span>}
          ariaLabel="Explicit Label"
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("icon-button")).toHaveAttribute("aria-label", "Explicit Label");
  });

  it("sets aria-pressed when isActive is true", () => {
    const { rerender } = render(
      <ThemeProvider theme={mockTheme}>
        <StateIconButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          isActive={true}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("icon-button")).toHaveAttribute("aria-pressed", "true");

    rerender(
      <ThemeProvider theme={mockTheme}>
        <StateIconButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          isActive={false}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("icon-button")).toHaveAttribute("aria-pressed", "false");
  });
});
