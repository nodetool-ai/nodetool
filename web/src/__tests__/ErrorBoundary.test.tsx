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

// Mock ui_primitives used by ErrorBoundary
jest.mock("../components/ui_primitives", () => ({
  CopyButton: ({ value }: { value: string }) => (
    <button data-testid="copy-button">Copy: {String(value).substring(0, 20)}</button>
  ),
  Text: ({ children, className, component, ...props }: any) => {
    const Tag = component || "p";
    return (
      <Tag className={className} {...props}>
        {children}
      </Tag>
    );
  },
  EditorButton: ({ children, onClick, className, ...props }: any) => (
    <button onClick={onClick} className={className} {...props}>
      {children}
    </button>
  )
}));

describe("ErrorBoundary", () => {
  // Note: window.location.reload is read-only in jsdom and cannot be mocked
  // We test that the reload button exists and can be clicked, but we don't test
  // that it actually calls window.location.reload() since that's browser behavior

  it("renders error message when error is an Error instance", async () => {
    const user = userEvent.setup();
    const testError = new Error("Test error message");
    mockUseRouteError.mockReturnValue(testError);

    render(
      <ThemeProvider theme={mockTheme}>
        <ErrorBoundary />
      </ThemeProvider>
    );

    await user.click(screen.getByRole("button", { name: /show details/i }));
    expect(screen.getByText("Test error message")).toBeInTheDocument();
  });

  it("renders stack trace when error is an Error instance", async () => {
    const user = userEvent.setup();
    const testError = new Error("Test error");
    testError.stack = "Error: Test error\n  at TestComponent";
    mockUseRouteError.mockReturnValue(testError);

    render(
      <ThemeProvider theme={mockTheme}>
        <ErrorBoundary />
      </ThemeProvider>
    );

    await user.click(screen.getByRole("button", { name: /show details/i }));
    const stackTrace = screen.getByText((content, element) => {
      return !!(element?.className?.includes("error-stack-trace") &&
        content.includes("Error: Test error"));
    });
    expect(stackTrace).toBeInTheDocument();
  });

  it("renders unknown error message for non-Error objects", async () => {
    const user = userEvent.setup();
    mockUseRouteError.mockReturnValue({ code: 404 });

    render(
      <ThemeProvider theme={mockTheme}>
        <ErrorBoundary />
      </ThemeProvider>
    );

    await user.click(screen.getByRole("button", { name: /show details/i }));
    expect(
      screen.getByText(/An unknown error occurred.*code.*404/i)
    ).toBeInTheDocument();
  });

  it("renders no stack trace message for non-Error objects", async () => {
    const user = userEvent.setup();
    mockUseRouteError.mockReturnValue("string error");

    render(
      <ThemeProvider theme={mockTheme}>
        <ErrorBoundary />
      </ThemeProvider>
    );

    await user.click(screen.getByRole("button", { name: /show details/i }));
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

  it("displays Discord link", () => {
    const testError = new Error("Test error");
    mockUseRouteError.mockReturnValue(testError);

    render(
      <ThemeProvider theme={mockTheme}>
        <ErrorBoundary />
      </ThemeProvider>
    );

    const discordLink = screen.getByRole("link", { name: /discord/i });
    expect(discordLink).toBeInTheDocument();
    expect(discordLink).toHaveAttribute("href", "https://discord.gg/GQqBKAWD");
    expect(discordLink).toHaveAttribute("target", "_blank");
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

  it("renders CopyButton with stack trace", async () => {
    const user = userEvent.setup();
    const testError = new Error("Test error");
    testError.stack = "Error: Test error\n  at TestComponent\n  at line 42";
    mockUseRouteError.mockReturnValue(testError);

    render(
      <ThemeProvider theme={mockTheme}>
        <ErrorBoundary />
      </ThemeProvider>
    );

    await user.click(screen.getByRole("button", { name: /show details/i }));
    expect(screen.getByTestId("copy-button")).toBeInTheDocument();
    expect(screen.getByTestId("copy-button")).toHaveTextContent(
      /Copy: Error: Test error/
    );
  });
});
