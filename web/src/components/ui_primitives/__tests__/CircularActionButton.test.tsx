import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { CircularActionButton } from "../CircularActionButton";
import mockTheme from "../../../__mocks__/themeMock";

// Mock icons
const MockIcon = () => <span data-testid="mock-icon">Icon</span>;

// Mock LoadingSpinner
jest.mock("../LoadingSpinner", () => ({
  __esModule: true,
  LoadingSpinner: ({ size }: { size?: number | string }) => <span data-testid="loading-spinner" data-size={size}>Loading</span>
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

    const button = screen.getByRole("button");
    expect(button).toHaveStyle({ width: "32px" });
    expect(button).toHaveStyle({ height: "32px" });
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

    const button = screen.getByRole("button");
    expect(button).toHaveStyle({ width: "48px" });
    expect(button).toHaveStyle({ height: "48px" });
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

    fireEvent.click(screen.getByRole("button"));
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

    fireEvent.click(screen.getByRole("button"));
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

    fireEvent.click(screen.getByRole("button"));
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

    expect(screen.getByRole("button")).toBeDisabled();
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

    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("applies nodrag class by default", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CircularActionButton icon={<MockIcon />} onClick={mockOnClick} />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toHaveClass("nodrag");
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

    expect(screen.getByRole("button")).not.toHaveClass("nodrag");
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

    expect(screen.getByRole("button")).toHaveClass("disabled");
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

    expect(screen.getByRole("button")).toHaveClass("disabled");
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

    expect(screen.getByRole("button")).toHaveClass("custom-class");
  });

  it("renders with tooltip when tooltip prop is provided", async () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CircularActionButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          tooltip="Test tooltip"
        />
      </ThemeProvider>
    );

    fireEvent.mouseOver(screen.getByRole("button"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Test tooltip");
  });

  it("sets aria-label from ariaLabel prop", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CircularActionButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          ariaLabel="Explicit Label"
        />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toHaveAttribute("aria-label", "Explicit Label");
  });

  it("renders without tooltip wrapper when tooltip is not provided", async () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CircularActionButton icon={<MockIcon />} onClick={mockOnClick} />
      </ThemeProvider>
    );

    fireEvent.mouseOver(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });
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

    const button = screen.getByRole("button");
    expect(button).toHaveStyle({ position: "fixed" });
    expect(button).toHaveStyle({ top: "20px" });
    expect(button).toHaveStyle({ left: "50%" });
    expect(button).toHaveStyle({ transform: "translateX(-50%)" });
    expect(button).toHaveStyle({ zIndex: "1000" });
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

    let button = screen.getByRole("button");
    expect(button).toHaveStyle({ opacity: "1" });
    expect(button).toHaveStyle({ pointerEvents: "auto" });

    rerender(
      <ThemeProvider theme={mockTheme}>
        <CircularActionButton
          icon={<MockIcon />}
          onClick={mockOnClick}
          isVisible={false}
        />
      </ThemeProvider>
    );

    button = screen.getByRole("button");
    expect(button).toHaveStyle({ opacity: "0" });
    expect(button).toHaveStyle({ pointerEvents: "none" });
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

    const button = screen.getByRole("button");
    expect(button).toHaveStyle({ opacity: "0.7" });
  });

  it("applies borderRadius of 50% for circular shape", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CircularActionButton icon={<MockIcon />} onClick={mockOnClick} />
      </ThemeProvider>
    );

    const button = screen.getByRole("button");
    expect(button).toHaveStyle({ borderRadius: "50%" });
  });
});
