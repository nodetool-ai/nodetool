/** @jsxImportSource @emotion/react */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import FindReplaceBar from "../FindReplaceBar";
import mockTheme from "../../../__mocks__/themeMock";

// Mock icons
jest.mock("@mui/icons-material/KeyboardArrowUp", () => ({
  __esModule: true,
  default: () => <span data-testid="arrow-up-icon" />
}));

jest.mock("@mui/icons-material/KeyboardArrowDown", () => ({
  __esModule: true,
  default: () => <span data-testid="arrow-down-icon" />
}));

jest.mock("@mui/icons-material/FindReplace", () => ({
  __esModule: true,
  default: () => <span data-testid="replace-icon" />
}));

// Mock MUI components to simplify testing
jest.mock("@mui/material/Tooltip", () => ({
  __esModule: true,
  default: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div data-tooltip={title}>{children}</div>
  )
}));

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
  default: ({ children, className, css }: any) => (
    <div className={className} css={css}>
      {children}
    </div>
  )
}));

// Mock the ToolbarIconButton and NodeTextField components
jest.mock("../../ui_primitives", () => ({
  CloseButton: ({ onClick, buttonSize, tooltip, className }: any) => (
    <button
      onClick={onClick}
      data-size={buttonSize}
      data-tooltip={tooltip}
      className={className}
      data-testid="close-button"
    >
      ×
    </button>
  ),
  ToolbarIconButton: ({ icon, onClick, disabled, tooltip, className }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      data-tooltip={tooltip}
      className={className}
      data-testid="toolbar-icon-button"
    >
      {icon}
    </button>
  ),
  NodeTextField: ({ value, onChange, onKeyDown, className, placeholder, slotProps }: any) => (
    <input
      type="text"
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      className={className}
      placeholder={placeholder}
      aria-label={slotProps?.htmlInput?.["aria-label"]}
      maxLength={slotProps?.htmlInput?.maxLength}
    />
  )
}));

describe("FindReplaceBar", () => {
  const mockOnFind = jest.fn();
  const mockOnReplace = jest.fn();
  const mockOnClose = jest.fn();
  const mockOnNext = jest.fn();
  const mockOnPrevious = jest.fn();

  const defaultProps = {
    onFind: mockOnFind,
    onReplace: mockOnReplace,
    onClose: mockOnClose,
    onNext: mockOnNext,
    onPrevious: mockOnPrevious,
    currentMatch: 1,
    totalMatches: 5,
    isVisible: true
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  const renderWithTheme = (props: any = {}) => {
    return render(
      <ThemeProvider theme={mockTheme}>
        <FindReplaceBar {...defaultProps} {...props} />
      </ThemeProvider>
    );
  };

  it("renders search input and navigation buttons", () => {
    renderWithTheme();

    expect(screen.getByPlaceholderText("Find...")).toBeInTheDocument();
    expect(screen.getByTestId("arrow-up-icon")).toBeInTheDocument();
    expect(screen.getByTestId("arrow-down-icon")).toBeInTheDocument();
  });

  it("renders close button", () => {
    renderWithTheme();
    expect(screen.getByTestId("close-button")).toBeInTheDocument();
  });

  it("displays match count correctly", () => {
    renderWithTheme({ currentMatch: 2, totalMatches: 10 });
    expect(screen.getByText("2/10")).toBeInTheDocument();
  });

  it("displays 0/0 when no matches", () => {
    renderWithTheme({ currentMatch: 0, totalMatches: 0 });
    expect(screen.getByText("0/0")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    renderWithTheme();
    fireEvent.click(screen.getByTestId("close-button"));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("calls onPrevious when previous button is clicked", () => {
    renderWithTheme();
    const prevButton = screen.getAllByTestId("toolbar-icon-button")[0];
    fireEvent.click(prevButton);
    expect(mockOnPrevious).toHaveBeenCalledTimes(1);
  });

  it("calls onNext when next button is clicked", () => {
    renderWithTheme();
    const buttons = screen.getAllByTestId("toolbar-icon-button");
    const nextButton = buttons[1];
    fireEvent.click(nextButton);
    expect(mockOnNext).toHaveBeenCalledTimes(1);
  });

  it("shows replace section when toggle replace button is clicked", () => {
    renderWithTheme();
    expect(screen.queryByPlaceholderText("Replace with...")).not.toBeInTheDocument();

    const buttons = screen.getAllByTestId("toolbar-icon-button");
    const toggleButton = buttons[2];
    fireEvent.click(toggleButton);

    expect(screen.getByPlaceholderText("Replace with...")).toBeInTheDocument();
  });

  it("calls onFind when search input changes with debounce", () => {
    renderWithTheme();

    const searchInput = screen.getByPlaceholderText("Find...");
    fireEvent.change(searchInput, { target: { value: "test" } });

    // Should not call immediately
    expect(mockOnFind).not.toHaveBeenCalled();

    // Advance timer to trigger debounce
    jest.advanceTimersByTime(300);

    expect(mockOnFind).toHaveBeenCalledWith("test");
  });

  it("calls onNext when Enter key is pressed", () => {
    renderWithTheme();

    const searchInput = screen.getByPlaceholderText("Find...");
    fireEvent.keyDown(searchInput, { key: "Enter" });
    expect(mockOnNext).toHaveBeenCalledTimes(1);
  });

  it("calls onPrevious when Shift+Enter keys are pressed", () => {
    renderWithTheme();

    const searchInput = screen.getByPlaceholderText("Find...");
    fireEvent.keyDown(searchInput, { key: "Enter", shiftKey: true });
    expect(mockOnPrevious).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape key is pressed", () => {
    renderWithTheme();

    const searchInput = screen.getByPlaceholderText("Find...");
    fireEvent.keyDown(searchInput, { key: "Escape" });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("does not render when isVisible is false", () => {
    renderWithTheme({ isVisible: false });
    expect(screen.queryByPlaceholderText("Find...")).not.toBeInTheDocument();
  });

  it("disables navigation buttons when there are no matches", () => {
    renderWithTheme({ currentMatch: 0, totalMatches: 0 });

    const buttons = screen.getAllByTestId("toolbar-icon-button");
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).toBeDisabled();
  });

  it("enables navigation buttons when there are matches", () => {
    renderWithTheme({ currentMatch: 1, totalMatches: 5 });

    const buttons = screen.getAllByTestId("toolbar-icon-button");
    expect(buttons[0]).not.toBeDisabled();
    expect(buttons[1]).not.toBeDisabled();
  });

  it("has proper ARIA labels for accessibility", () => {
    renderWithTheme();

    expect(screen.getByLabelText("Search text")).toBeInTheDocument();

    const buttons = screen.getAllByTestId("toolbar-icon-button");
    const toggleButton = buttons[2];
    fireEvent.click(toggleButton);

    expect(screen.getByLabelText("Replace text")).toBeInTheDocument();
  });

  it("handles missing optional callbacks gracefully", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <FindReplaceBar isVisible={true} />
      </ThemeProvider>
    );

    const searchInput = screen.getByPlaceholderText("Find...");
    fireEvent.keyDown(searchInput, { key: "Enter" });
    fireEvent.keyDown(searchInput, { key: "Escape" });

    expect(screen.getByPlaceholderText("Find...")).toBeInTheDocument();
  });

  it("maintains replace visibility state correctly", () => {
    renderWithTheme();

    expect(screen.queryByPlaceholderText("Replace with...")).not.toBeInTheDocument();

    const buttons = screen.getAllByTestId("toolbar-icon-button");
    const toggleButton = buttons[2];
    fireEvent.click(toggleButton);

    expect(screen.getByPlaceholderText("Replace with...")).toBeInTheDocument();

    fireEvent.click(toggleButton);

    expect(screen.queryByPlaceholderText("Replace with...")).not.toBeInTheDocument();
  });
});
