import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { ProviderCallFailed } from "@nodetool-ai/protocol";
import mockTheme from "../../../../__mocks__/themeMock";

const mockModels = [
  { type: "language_model", id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "gemini" },
  { type: "language_model", id: "openrouter/free", name: "OpenRouter Free", provider: "openrouter" }
];

jest.mock("../../../../hooks/useModelsByProvider", () => ({
  useLanguageModelsByProvider: () => ({ models: mockModels })
}));

jest.mock("../../../support/ProviderFailureReportButton", () => ({
  __esModule: true,
  default: () => <button type="button">Report</button>
}));

import ChatErrorBanner from "../ChatErrorBanner";
import { useProviderCallFailureStore } from "../../../../stores/ProviderCallFailureStore";

const failure = (overrides: Partial<ProviderCallFailed> = {}): ProviderCallFailed => ({
  type: "provider_call_failed",
  provider: "gemini",
  model: "gemini-2.5-pro",
  operation: "generateMessages",
  kind: "quota",
  status: 429,
  message: "Quota exceeded, limit: 0",
  timestamp: "2026-11-13T10:00:00.000Z",
  ...overrides
});

const renderBanner = (props: Partial<React.ComponentProps<typeof ChatErrorBanner>> = {}) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ChatErrorBanner
        error="429 Quota exceeded, limit: 0 — gemini/gemini-2.5-pro has no quota left on this key (429)."
        onDismiss={jest.fn()}
        onRetry={jest.fn()}
        onModelChange={jest.fn()}
        {...props}
      />
    </ThemeProvider>
  );

describe("ChatErrorBanner", () => {
  beforeEach(() => {
    act(() => useProviderCallFailureStore.getState().clear());
  });

  it("names a quota failure and offers a model from another provider", async () => {
    const onModelChange = jest.fn();
    const onDismiss = jest.fn();
    act(() => useProviderCallFailureStore.getState().record(failure()));
    renderBanner({ onModelChange, onDismiss });

    expect(
      screen.getByText("gemini/gemini-2.5-pro can't run: this key has no quota left for it.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enable billing" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Use OpenRouter Free" }));
    expect(onModelChange).toHaveBeenCalledWith(mockModels[1]);
    expect(onDismiss).toHaveBeenCalled();
  });

  it("drops Retry when the same failure comes back", () => {
    act(() => {
      useProviderCallFailureStore.getState().record(failure());
      useProviderCallFailureStore.getState().record(failure());
    });
    renderBanner();

    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(
      screen.getByText(/failed the same way again, so retrying won't help/)
    ).toBeInTheDocument();
  });

  it("ignores a recent failure from another call", () => {
    act(() =>
      useProviderCallFailureStore
        .getState()
        .record(failure({ model: "veo-3.1-generate-preview", message: "video quota" }))
    );
    renderBanner({ error: "401 Incorrect API key provided" });
    expect(screen.getByText("The provider refused your API key.")).toBeInTheDocument();
  });

  it("reads the error text when no failure frame arrived", () => {
    renderBanner({ error: "401 Incorrect API key provided" });
    expect(screen.getByText("The provider refused your API key.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open API keys" })).toBeInTheDocument();
  });

  it("keeps the plain banner for a failure that is not about the provider account", () => {
    renderBanner({ error: "The connection closed" });
    expect(screen.getByText("The connection closed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Use / })).not.toBeInTheDocument();
  });
});
