import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { CircularActionButton } from "../CircularActionButton";
import mockTheme from "../../../__mocks__/themeMock";

// Mock icons
const MockIcon = () => <span data-testid="mock-icon">Icon</span>;

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
  default: ({ children, disabled, onClick, className, sx, ...rest }: any) => {
    // Filter out non-DOM props
    const { disableRipple, ...domProps } = rest;
    return (
      <button
        disabled={disabled}
        onClick={onClick}
        className={className}
        data-testid="icon-button"
        style={sx}
        {...domProps}
      >
        {children}
      </button>
    );
  }
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

describe("CircularActionButton", () => {
  const mockOnClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders with icon by default", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CircularActionButton icon={<MockIcon />} onClick={mockOnClick} />
      </ThemeProvider>
    );

    expect(screen.getByTestId("mock-icon")).toBeInTheDocument();
  });

  it("shows loading spinner when isLoading is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CircularActionButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          isLoading={true}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-icon")).not.toBeInTheDocument();
  });

  it("uses default size of 32px", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CircularActionButton icon={<MockIcon />} onClick={mockOnClick} />
      </ThemeProvider>
    );

    const button = screen.getByTestId("icon-button");
    expect(button.style.width).toBe("32px");
    expect(button.style.height).toBe("32px");
  });

  it("uses custom size when provided", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CircularActionButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          size={48}
        />
      </ThemeProvider>
    );

    const button = screen.getByTestId("icon-button");
    expect(button.style.width).toBe("48px");
    expect(button.style.height).toBe("48px");
  });

  it("calculates loading size correctly based on button size", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CircularActionButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          isLoading={true}
          size={32}
        />
      </ThemeProvider>
    );

    // Loading size should be size - 16 = 16
    expect(screen.getByTestId("loading-spinner")).toHaveAttribute("data-size", "16");
  });

  it("uses custom loading size when provided", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CircularActionButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          isLoading={true}
          loadingSize={24}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("loading-spinner")).toHaveAttribute("data-size", "24");
  });

  it("calls onClick when clicked", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CircularActionButton icon={<MockIcon />} onClick={mockOnClick} />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByTestId("icon-button"));
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CircularActionButton
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
        <CircularActionButton
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
        <CircularActionButton
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
        <CircularActionButton
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
        <CircularActionButton icon={<MockIcon />} onClick={mockOnClick} />
      </ThemeProvider>
    );

    expect(screen.getByTestId("icon-button")).toHaveClass("nodrag");
  });

  it("does not apply nodrag class when nodrag is false", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CircularActionButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          nodrag={false}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("icon-button")).not.toHaveClass("nodrag");
  });

  it("applies disabled class when disabled", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CircularActionButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          disabled={true}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("icon-button")).toHaveClass("disabled");
  });

  it("applies disabled class when isLoading", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CircularActionButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          isLoading={true}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("icon-button")).toHaveClass("disabled");
  });

  it("applies custom className", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CircularActionButton
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
        <CircularActionButton
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
        <CircularActionButton icon={<MockIcon />} onClick={mockOnClick} />
      </ThemeProvider>
    );

    expect(screen.getByTestId("icon-button")).toBeInTheDocument();
    // Should not have tooltip attribute anywhere in the tree
    expect(container.querySelector('[data-tooltip]')).not.toBeInTheDocument();
  });

  it("applies position styles", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CircularActionButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          position="fixed"
          top="20px"
          left="50%"
          transform="translateX(-50%)"
          zIndex={1000}
        />
      </ThemeProvider>
    );

    const button = screen.getByTestId("icon-button");
    expect(button.style.position).toBe("fixed");
    expect(button.style.top).toBe("20px");
    expect(button.style.left).toBe("50%");
    expect(button.style.transform).toBe("translateX(-50%)");
    expect(button.style.zIndex).toBe("1000");
  });

  it("controls visibility with isVisible prop", () => {
    const { rerender } = render(
      <ThemeProvider theme={mockTheme}>
        <CircularActionButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          isVisible={true}
        />
      </ThemeProvider>
    );

    let button = screen.getByTestId("icon-button");
    expect(button.style.opacity).toBe("1");
    expect(button.style.pointerEvents).toBe("auto");

    rerender(
      <ThemeProvider theme={mockTheme}>
        <CircularActionButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          isVisible={false}
        />
      </ThemeProvider>
    );

    button = screen.getByTestId("icon-button");
    expect(button.style.opacity).toBe("0");
    expect(button.style.pointerEvents).toBe("none");
  });

  it("uses custom opacity when provided", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CircularActionButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          opacity={0.7}
        />
      </ThemeProvider>
    );

    const button = screen.getByTestId("icon-button");
    expect(button.style.opacity).toBe("0.7");
  });

  it("applies borderRadius of 50% for circular shape", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CircularActionButton icon={<MockIcon />} onClick={mockOnClick} />
      </ThemeProvider>
    );

    const button = screen.getByTestId("icon-button");
    expect(button.style.borderRadius).toBe("50%");
  });
});
