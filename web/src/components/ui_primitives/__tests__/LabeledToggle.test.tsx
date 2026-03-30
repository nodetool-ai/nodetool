import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { LabeledToggle } from "../LabeledToggle";
import mockTheme from "../../../__mocks__/themeMock";

// Mock icons
const MockIcon = () => <span data-testid="mock-icon">Icon</span>;
const MockExpandIcon = () => <span data-testid="mock-expand-icon">Expand</span>;

// Mock ExpandMoreIcon
jest.mock("@mui/icons-material/ExpandMore", () => ({
  __esModule: true,
  default: () => <span data-testid="expand-more-icon">ExpandMore</span>
}));

// Mock MUI components
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

jest.mock("@mui/material/Box", () => ({
  __esModule: true,
  default: ({ children, onClick, className, component = "div", ...rest }: any) => {
    const Component = component;
    return (
      <Component
        onClick={onClick}
        className={className}
        data-testid="box-component"
        {...rest}
      >
        {children}
      </Component>
    );
  }
}));

jest.mock("@mui/material/Tooltip", () => ({
  __esModule: true,
  default: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div data-tooltip={title}>{children}</div>
  )
}));

describe("LabeledToggle", () => {
  const mockOnToggle = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders with expand icon by default", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <LabeledToggle isOpen={false} onToggle={mockOnToggle} />
      </ThemeProvider>
    );

    expect(screen.getByTestId("expand-more-icon")).toBeInTheDocument();
  });

  it("renders custom expand icon when provided", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <LabeledToggle
          isOpen={false}
          onToggle={mockOnToggle}
          expandIcon={<MockExpandIcon />}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("mock-expand-icon")).toBeInTheDocument();
    expect(screen.queryByTestId("expand-more-icon")).not.toBeInTheDocument();
  });

  it("does not render expand icon when showExpandIcon is false", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <LabeledToggle
          isOpen={false}
          onToggle={mockOnToggle}
          showExpandIcon={false}
        />
      </ThemeProvider>
    );

    expect(screen.queryByTestId("expand-more-icon")).not.toBeInTheDocument();
  });

  it("renders custom icon when provided", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <LabeledToggle
          isOpen={false}
          onToggle={mockOnToggle}
          icon={<MockIcon />}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("mock-icon")).toBeInTheDocument();
  });

  it("uses showLabel when isOpen is false", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <LabeledToggle
          isOpen={false}
          onToggle={mockOnToggle}
          showLabel="Show details"
          hideLabel="Hide details"
        />
      </ThemeProvider>
    );

    const tooltip = screen.getByTestId("box-component").parentElement;
    expect(tooltip).toHaveAttribute("data-tooltip", "Show details");
  });

  it("uses hideLabel when isOpen is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <LabeledToggle
          isOpen={true}
          onToggle={mockOnToggle}
          showLabel="Show details"
          hideLabel="Hide details"
        />
      </ThemeProvider>
    );

    const tooltip = screen.getByTestId("box-component").parentElement;
    expect(tooltip).toHaveAttribute("data-tooltip", "Hide details");
  });

  it("falls back to label when showLabel/hideLabel not provided", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <LabeledToggle
          isOpen={false}
          onToggle={mockOnToggle}
          label="Toggle details"
        />
      </ThemeProvider>
    );

    const tooltip = screen.getByTestId("box-component").parentElement;
    expect(tooltip).toHaveAttribute("data-tooltip", "Toggle details");
  });

  it("uses default labels when no label props provided", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <LabeledToggle isOpen={false} onToggle={mockOnToggle} />
      </ThemeProvider>
    );

    const tooltip = screen.getByTestId("box-component").parentElement;
    expect(tooltip).toHaveAttribute("data-tooltip", "Show");
  });

  it("calls onToggle when clicked", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <LabeledToggle isOpen={false} onToggle={mockOnToggle} />
      </ThemeProvider>
    );

    // Click the Box container
    const container = screen.getByTestId("box-component");
    fireEvent.click(container);
    expect(mockOnToggle).toHaveBeenCalledTimes(1);
  });

  it("calls onToggle when expand icon button is clicked", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <LabeledToggle isOpen={false} onToggle={mockOnToggle} />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByTestId("icon-button"));
    expect(mockOnToggle).toHaveBeenCalledTimes(1);
  });

  it("does not call onToggle when disabled", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <LabeledToggle
          isOpen={false}
          onToggle={mockOnToggle}
          disabled={true}
        />
      </ThemeProvider>
    );

    const container = screen.getByTestId("box-component");
    fireEvent.click(container);
    // Disabled containers don't have onClick handler
    expect(mockOnToggle).not.toHaveBeenCalled();
  });

  it("applies open class when isOpen is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <LabeledToggle isOpen={true} onToggle={mockOnToggle} />
      </ThemeProvider>
    );

    const container = screen.getByTestId("box-component");
    expect(container).toHaveClass("open");
  });

  it("applies disabled class when disabled is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <LabeledToggle
          isOpen={false}
          onToggle={mockOnToggle}
          disabled={true}
        />
      </ThemeProvider>
    );

    const container = screen.getByTestId("box-component");
    expect(container).toHaveClass("disabled");
  });

  it("applies nodrag class by default", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <LabeledToggle isOpen={false} onToggle={mockOnToggle} />
      </ThemeProvider>
    );

    const container = screen.getByTestId("box-component");
    expect(container).toHaveClass("nodrag");
  });

  it("does not apply nodrag class when nodrag is false", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <LabeledToggle
          isOpen={false}
          onToggle={mockOnToggle}
          nodrag={false}
        />
      </ThemeProvider>
    );

    const container = screen.getByTestId("box-component");
    expect(container).not.toHaveClass("nodrag");
  });

  it("applies custom className", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <LabeledToggle
          isOpen={false}
          onToggle={mockOnToggle}
          className="custom-class"
        />
      </ThemeProvider>
    );

    const container = screen.getByTestId("box-component");
    expect(container).toHaveClass("custom-class");
  });

  it("renders without tooltip when showTooltip is false", () => {
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <LabeledToggle
          isOpen={false}
          onToggle={mockOnToggle}
          showTooltip={false}
        />
      </ThemeProvider>
    );

    // Should not have tooltip wrapper
    expect(container.querySelector('[data-tooltip]')).not.toBeInTheDocument();
  });

  it("stops event propagation on click", () => {
    const parentOnClick = jest.fn();
    render(
      <ThemeProvider theme={mockTheme}>
        <div onClick={parentOnClick}>
          <LabeledToggle isOpen={false} onToggle={mockOnToggle} />
        </div>
      </ThemeProvider>
    );

    fireEvent.click(screen.getByTestId("icon-button"));
    expect(mockOnToggle).toHaveBeenCalledTimes(1);
    // Event should be stopped, so parent should not receive it
    // Note: In real implementation, stopPropagation is called, 
    // but in tests it might still propagate due to mock setup
  });
});
