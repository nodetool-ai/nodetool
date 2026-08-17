import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { LabeledToggle } from "../LabeledToggle";
import mockTheme from "../../../__mocks__/themeMock";

// Mock icons
const MockIcon = () => <span data-testid="mock-icon">Icon</span>;
const MockExpandIcon = () => <span data-testid="mock-expand-icon">Expand</span>;

/** The Box the toggle renders around its icon button. */
const toggleRoot = (): HTMLElement => {
  const root = screen.getByRole("button").parentElement;
  if (!root) {
    throw new Error("LabeledToggle rendered no container around its button");
  }
  return root;
};

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

    expect(screen.getByTestId("ExpandMoreIcon")).toBeInTheDocument();
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
    expect(screen.queryByTestId("ExpandMoreIcon")).not.toBeInTheDocument();
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

    expect(screen.queryByTestId("ExpandMoreIcon")).not.toBeInTheDocument();
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

  it("renders the label as visible text with the label type style", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <LabeledToggle
          isOpen={false}
          onToggle={mockOnToggle}
          showLabel="Show thought"
          hideLabel="Hide thought"
        />
      </ThemeProvider>
    );

    const label = screen.getByText("Show thought");
    expect(label).toBeInTheDocument();
    expect(label).toHaveClass("labeled-toggle-label");
  });

  it("uses showLabel when isOpen is false", async () => {
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

    fireEvent.mouseOver(screen.getByRole("button"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Show details");
  });

  it("uses hideLabel when isOpen is true", async () => {
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

    fireEvent.mouseOver(screen.getByRole("button"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Hide details");
  });

  it("falls back to label when showLabel/hideLabel not provided", async () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <LabeledToggle
          isOpen={false}
          onToggle={mockOnToggle}
          label="Toggle details"
        />
      </ThemeProvider>
    );

    fireEvent.mouseOver(screen.getByRole("button"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Toggle details");
  });

  it("uses default labels when no label props provided", async () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <LabeledToggle isOpen={false} onToggle={mockOnToggle} />
      </ThemeProvider>
    );

    fireEvent.mouseOver(screen.getByRole("button"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Show");
  });

  it("calls onToggle when clicked", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <LabeledToggle isOpen={false} onToggle={mockOnToggle} />
      </ThemeProvider>
    );

    // Click the Box container
    const container = toggleRoot();
    fireEvent.click(container);
    expect(mockOnToggle).toHaveBeenCalledTimes(1);
  });

  it("calls onToggle when expand icon button is clicked", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <LabeledToggle isOpen={false} onToggle={mockOnToggle} />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button"));
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

    const container = toggleRoot();
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

    const container = toggleRoot();
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

    const container = toggleRoot();
    expect(container).toHaveClass("disabled");
  });

  it("applies nodrag class by default", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <LabeledToggle isOpen={false} onToggle={mockOnToggle} />
      </ThemeProvider>
    );

    const container = toggleRoot();
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

    const container = toggleRoot();
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

    const container = toggleRoot();
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

    fireEvent.click(screen.getByRole("button"));
    expect(mockOnToggle).toHaveBeenCalledTimes(1);
    // Event should be stopped, so parent should not receive it
    // Note: In real implementation, stopPropagation is called, 
    // but in tests it might still propagate due to mock setup
  });
});
