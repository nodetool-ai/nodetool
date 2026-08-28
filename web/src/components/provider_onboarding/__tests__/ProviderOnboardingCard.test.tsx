import React from "react";
import { asMock } from "../../../test-utils/doubles";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

import ProviderOnboardingCard from "../ProviderOnboardingCard";
import { ONBOARDING_PROVIDERS } from "../providerOnboardingCatalog";
import {
  useOAuthConnection,
  type OAuthConnection
} from "../../../hooks/useOAuthConnection";
import useSecretsStore from "../../../stores/SecretsStore";
import { useNotificationStore } from "../../../stores/NotificationStore";

jest.mock("../../../hooks/useOAuthConnection");
jest.mock("../../../stores/SecretsStore");
jest.mock("../../../stores/NotificationStore");

const mockUseOAuthConnection = useOAuthConnection as jest.MockedFunction<
  typeof useOAuthConnection
>;
const mockUseSecretsStore = asMock(useSecretsStore);
const mockUseNotificationStore = asMock(useNotificationStore);

const updateSecret = jest.fn().mockResolvedValue(undefined);
const validateSecret = jest.fn();
const addNotification = jest.fn();

const oauthState = (overrides: Partial<OAuthConnection>): OAuthConnection => ({
  label: "",
  isConnected: false,
  isConnecting: false,
  canDisconnect: false,
  connect: jest.fn(),
  disconnect: jest.fn(),
  manualPrompt: null,
  isSubmittingManual: false,
  submitManualCode: jest.fn(),
  cancelManual: jest.fn(),
  ...overrides
});

const openai = ONBOARDING_PROVIDERS.find((p) => p.id === "openai")!;
const anthropic = ONBOARDING_PROVIDERS.find((p) => p.id === "anthropic")!;

const renderCard = (
  provider = anthropic,
  props: Partial<React.ComponentProps<typeof ProviderOnboardingCard>> = {}
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ProviderOnboardingCard
        provider={provider}
        configured={false}
        {...props}
      />
    </ThemeProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockUseOAuthConnection.mockReturnValue(oauthState({}));
  validateSecret.mockResolvedValue({
    status: "valid",
    valid: true,
    message: "Anthropic accepted the key."
  });
  mockUseSecretsStore.mockImplementation(
    <T,>(selector: (s: { updateSecret: jest.Mock; validateSecret: jest.Mock }) => T) =>
      selector({ updateSecret, validateSecret })
  );
  mockUseNotificationStore.mockImplementation(
    <T,>(selector: (s: { addNotification: jest.Mock }) => T) =>
      selector({ addNotification })
  );
});

describe("ProviderOnboardingCard", () => {
  it("shows a one-click sign-in for an OAuth provider", () => {
    renderCard(openai);
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByText(/1-click sign-in/i)).toBeInTheDocument();
  });

  it("starts an OAuth flow when sign-in is clicked", async () => {
    const connect = jest.fn();
    mockUseOAuthConnection.mockReturnValue(oauthState({ connect }));
    renderCard(openai);
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("validates a pasted API key before saving it", async () => {
    renderCard(anthropic);
    await userEvent.click(
      screen.getByRole("button", { name: /add api key/i })
    );
    const input = screen.getByPlaceholderText(/paste your anthropic api key/i);
    await userEvent.type(input, "sk-test-123");
    await userEvent.click(screen.getByRole("button", { name: /^connect$/i }));

    await waitFor(() =>
      expect(updateSecret).toHaveBeenCalledWith(
        "ANTHROPIC_API_KEY",
        "sk-test-123"
      )
    );
    expect(validateSecret).toHaveBeenCalledWith(
      "ANTHROPIC_API_KEY",
      "sk-test-123"
    );
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success" })
    );
  });

  it("refuses to save a key the provider rejected, and offers to save it anyway", async () => {
    validateSecret.mockResolvedValue({
      status: "invalid",
      valid: false,
      message: "Anthropic rejected the key (401)."
    });
    renderCard(anthropic);
    await userEvent.click(
      screen.getByRole("button", { name: /add api key/i })
    );
    const input = screen.getByPlaceholderText(/paste your anthropic api key/i);
    await userEvent.type(input, "sk-bad");
    await userEvent.click(screen.getByRole("button", { name: /^connect$/i }));

    await waitFor(() =>
      expect(screen.getByText(/rejected the key/i)).toBeInTheDocument()
    );
    expect(updateSecret).not.toHaveBeenCalled();
    expect(input).toHaveValue("sk-bad");

    await userEvent.click(
      screen.getByRole("button", { name: /save anyway/i })
    );
    await waitFor(() =>
      expect(updateSecret).toHaveBeenCalledWith("ANTHROPIC_API_KEY", "sk-bad")
    );
  });

  it("saves a key nothing could verify, and says so", async () => {
    validateSecret.mockResolvedValue({
      status: "unverifiable",
      valid: false,
      message: "NodeTool has no quick check for ANTHROPIC_API_KEY."
    });
    renderCard(anthropic);
    await userEvent.click(
      screen.getByRole("button", { name: /add api key/i })
    );
    await userEvent.type(
      screen.getByPlaceholderText(/paste your anthropic api key/i),
      "sk-unknown"
    );
    await userEvent.click(screen.getByRole("button", { name: /^connect$/i }));

    await waitFor(() =>
      expect(updateSecret).toHaveBeenCalledWith(
        "ANTHROPIC_API_KEY",
        "sk-unknown"
      )
    );
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "warning" })
    );
  });

  it("expands the key field by default when highlighted", () => {
    renderCard(anthropic, { defaultExpanded: true });
    expect(
      screen.getByPlaceholderText(/paste your anthropic api key/i)
    ).toBeInTheDocument();
  });

  it("shows a connected state and no actions when configured", () => {
    renderCard(anthropic, { configured: true });
    expect(screen.getByText(/^connected$/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add api key/i })
    ).not.toBeInTheDocument();
  });
});
