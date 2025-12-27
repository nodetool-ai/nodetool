import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../__mocks__/themeMock";
import ErrorBoundary from "../ErrorBoundary";

// Mock react-router-dom
const mockUseRouteError = jest.fn();
jest.mock("react-router-dom", () => ({
  useRouteError: () => mockUseRouteError()
}));

// Mock MUI Button to avoid theme complexity
jest.mock("@mui/material", () => ({
  ...jest.requireActual("@mui/material"),
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  )
}));

// Mock CopyToClipboardButton
jest.mock("../components/common/CopyToClipboardButton", () => ({
  CopyToClipboardButton: ({ copyValue }: { copyValue: string }) => (
    <button data-testid="copy-button">Copy: {copyValue.substring(0, 20)}</button>
  )
}));

describe("ErrorBoundary", () => {
  const originalReload = window.location.reload;

  beforeEach(() => {
    // Mock window.location.reload
    Object.defineProperty(window, "location", {
      writable: true,
      value: { reload: jest.fn() }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    window.location.reload = originalReload;
  });

  it("renders error message when error is an Error instance", () => {
    const testError = new Error("Test error message");
    mockUseRouteError.mockReturnValue(testError);

    render(
      <ThemeProvider theme={mockTheme}>
        <ErrorBoundary />
      </ThemeProvider>
    );

    expect(screen.getByText("Test error message")).toBeInTheDocument();
  });

  it("renders stack trace when error is an Error instance", () => {
    const testError = new Error("Test error");
    testError.stack = "Error: Test error\n  at TestComponent";
    mockUseRouteError.mockReturnValue(testError);

    render(
      <ThemeProvider theme={mockTheme}>
        <ErrorBoundary />
      </ThemeProvider>
    );

    const stackTrace = screen.getByText((content, element) => {
      return element?.className?.includes("error-stack-trace") &&
        content.includes("Error: Test error");
    });
    expect(stackTrace).toBeInTheDocument();
  });

  it("renders unknown error message for non-Error objects", () => {
    mockUseRouteError.mockReturnValue({ code: 404 });

    render(
      <ThemeProvider theme={mockTheme}>
        <ErrorBoundary />
      </ThemeProvider>
    );

    expect(
      screen.getByText(/An unknown error occurred.*code.*404/i)
    ).toBeInTheDocument();
  });

  it("renders no stack trace message for non-Error objects", () => {
    mockUseRouteError.mockReturnValue("string error");

    render(
      <ThemeProvider theme={mockTheme}>
        <ErrorBoundary />
      </ThemeProvider>
    );

    expect(screen.getByText("No stack trace available")).toBeInTheDocument();
  });

  it("displays reload button", () => {
    const testError = new Error("Test error");
    mockUseRouteError.mockReturnValue(testError);

    render(
      <ThemeProvider theme={mockTheme}>
        <ErrorBoundary />
      </ThemeProvider>
    );

    expect(screen.getByRole("button", { name: /reload/i })).toBeInTheDocument();
  });

  it("reloads page when reload button is clicked", async () => {
    const user = userEvent.setup();
    const testError = new Error("Test error");
    mockUseRouteError.mockReturnValue(testError);

    render(
      <ThemeProvider theme={mockTheme}>
        <ErrorBoundary />
      </ThemeProvider>
    );

    const reloadButton = screen.getByRole("button", { name: /reload/i });
    await user.click(reloadButton);

    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it("displays forum link", () => {
    const testError = new Error("Test error");
    mockUseRouteError.mockReturnValue(testError);

    render(
      <ThemeProvider theme={mockTheme}>
        <ErrorBoundary />
      </ThemeProvider>
    );

    const forumLink = screen.getByRole("link", { name: /forum/i });
    expect(forumLink).toBeInTheDocument();
    expect(forumLink).toHaveAttribute("href", "https://forum.nodetool.ai");
    expect(forumLink).toHaveAttribute("target", "_blank");
  });

  it("displays logo", () => {
    const testError = new Error("Test error");
    mockUseRouteError.mockReturnValue(testError);

    render(
      <ThemeProvider theme={mockTheme}>
        <ErrorBoundary />
      </ThemeProvider>
    );

    const logo = screen.getByAltText("NodeTool Logo");
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute("src", "/logo192.png");
  });

  it("renders CopyToClipboardButton with stack trace", () => {
    const testError = new Error("Test error");
    testError.stack = "Error: Test error\n  at TestComponent\n  at line 42";
    mockUseRouteError.mockReturnValue(testError);

    render(
      <ThemeProvider theme={mockTheme}>
        <ErrorBoundary />
      </ThemeProvider>
    );

    expect(screen.getByTestId("copy-button")).toBeInTheDocument();
    expect(screen.getByTestId("copy-button")).toHaveTextContent(
      /Copy: Error: Test error/
    );
  });
});
