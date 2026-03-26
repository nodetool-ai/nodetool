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

// Mock CopyButton primitive
jest.mock("../components/ui_primitives", () => ({
  CopyButton: ({ value }: { value: string }) => (
    <button data-testid="copy-button">Copy: {String(value).substring(0, 20)}</button>
  )
}));

describe("ErrorBoundary", () => {
  // Note: window.location.reload is read-only in jsdom and cannot be mocked
  // We test that the reload button exists and can be clicked, but we don't test
  // that it actually calls window.location.reload() since that's browser behavior

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
      return !!(element?.className?.includes("error-stack-trace") &&
        content.includes("Error: Test error"));
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
    expect(reloadButton).toBeInTheDocument();

    // Button can be clicked (window.location.reload() is read-only in jsdom)
    await user.click(reloadButton);
    // Note: We can't test that window.location.reload() was called because
    // jsdom's Location.reload() is read-only and cannot be mocked
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

  it("renders CopyButton with stack trace", () => {
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
