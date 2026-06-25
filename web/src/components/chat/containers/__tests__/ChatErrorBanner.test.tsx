import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";
import mockTheme from "../../../../__mocks__/themeMock";
import ChatErrorBanner, { isClaudeCodeMissingError } from "../ChatErrorBanner";

jest.mock("../../../../utils/browser", () => ({
  getIsElectronDetails: () => ({ isElectron: true })
}));

const CLAUDE_MISSING_ERROR =
  'claude CLI not found (looked for "claude"). Install ' +
  "@anthropic-ai/claude-code or set CLAUDE_CODE_EXECUTABLE.";

const renderBanner = (props: Partial<React.ComponentProps<typeof ChatErrorBanner>> = {}) =>
  render(
    <MemoryRouter>
      <ThemeProvider theme={mockTheme}>
        <ChatErrorBanner error={CLAUDE_MISSING_ERROR} {...props} />
      </ThemeProvider>
    </MemoryRouter>
  );

describe("isClaudeCodeMissingError", () => {
  it("detects the provider's not-installed error", () => {
    expect(isClaudeCodeMissingError(CLAUDE_MISSING_ERROR)).toBe(true);
    expect(
      isClaudeCodeMissingError("claude CLI not found (looked for ...)")
    ).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isClaudeCodeMissingError("Connection refused")).toBe(false);
    expect(isClaudeCodeMissingError("rate limit exceeded")).toBe(false);
  });
});

describe("ChatErrorBanner", () => {
  afterEach(() => {
    delete (window as unknown as { api?: unknown }).api;
    jest.clearAllMocks();
  });

  it("offers a one-click install when Claude Code is missing", async () => {
    const installRuntime = jest
      .fn()
      .mockResolvedValue({ success: true, message: "ok" });
    (window as unknown as { api?: unknown }).api = {
      packages: { installRuntime }
    };
    const onRetry = jest.fn();

    renderBanner({ onRetry });

    const button = screen.getByRole("button", { name: /Install Claude Code/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(installRuntime).toHaveBeenCalledWith("claude");
    });
    await waitFor(() => {
      expect(onRetry).toHaveBeenCalled();
    });
    expect(
      screen.getByText(/Claude Code installed/i)
    ).toBeInTheDocument();
  });

  it("renders the raw error with a retry action for generic errors", () => {
    const onRetry = jest.fn();
    render(
      <ThemeProvider theme={mockTheme}>
        <ChatErrorBanner
          error="Connection refused"
          onRetry={onRetry}
          retryLabel="Retry"
        />
      </ThemeProvider>
    );

    expect(screen.getByText("Connection refused")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });
});
