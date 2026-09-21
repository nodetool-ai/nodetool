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
    expect(screen.getByRole("button", { name: /use api key/i })).toHaveAttribute("aria-expanded", "false");
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
      message: "Anthropic rejected sk-bad (401)."
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
    expect(screen.getByRole("alert")).not.toHaveTextContent("sk-bad");
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
    expect(screen.getByText(/^unavailable$/i)).toBeInTheDocument();
  });

  it("expands the key field by default when highlighted", () => {
    renderCard(anthropic, { defaultExpanded: true });
    expect(
      screen.getByPlaceholderText(/paste your anthropic api key/i)
    ).toBeInTheDocument();
  });

  it("shows configured status with recheck and replace actions", () => {
    renderCard(anthropic, { configured: true });
    expect(screen.getByText(/^configured$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^recheck$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /replace key/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add api key/i })
    ).not.toBeInTheDocument();
  });

  it("marks a stored key verified after rechecking without reading a key value", async () => {
    validateSecret.mockResolvedValue({
      status: "valid",
      valid: true,
      message: "Anthropic accepted the stored key."
    });
    renderCard(anthropic, { configured: true });

    await userEvent.click(screen.getByRole("button", { name: /^recheck$/i }));

    await waitFor(() =>
      expect(validateSecret).toHaveBeenCalledWith("ANTHROPIC_API_KEY")
    );
    expect(screen.getByText(/^verified$/i)).toBeInTheDocument();
    expect(screen.queryByText(/accepted the stored key/i)).not.toBeInTheDocument();
  });

  it.each([
    ["unverifiable", "Unavailable", "The stored key could not be verified."],
    ["invalid", "Rejected", "The provider rejected the stored key."]
  ] as const)(
    "keeps a stored key marked %s after rechecking",
    async (validationStatus, statusLabel, detail) => {
      validateSecret.mockResolvedValue({
        status: validationStatus,
        valid: false,
        message: "Provider response containing sk-stored-secret should stay hidden."
      });
      renderCard(anthropic, { configured: true });

      await userEvent.click(screen.getByRole("button", { name: /^recheck$/i }));

      await waitFor(() =>
        expect(screen.getByText(new RegExp(`^${statusLabel}$`, "i"))).toBeInTheDocument()
      );
      expect(screen.getByText(detail)).toBeInTheDocument();
      expect(
        screen.queryByText(/sk-stored-secret/i)
      ).not.toBeInTheDocument();
    }
  );

  it("uses a safe error when saving fails with a credential in the error", async () => {
    validateSecret.mockRejectedValue(
      new Error("Provider request failed for sk-secret-error")
    );
    renderCard(anthropic);
    await userEvent.click(
      screen.getByRole("button", { name: /add api key/i })
    );
    await userEvent.type(
      screen.getByPlaceholderText(/paste your anthropic api key/i),
      "sk-secret-error"
    );
    await userEvent.click(screen.getByRole("button", { name: /^connect$/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Couldn't save the key"
      )
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("sk-secret-error");
  });

  it("returns a saved key to configured uncertainty after remounting", async () => {
    const rendered = renderCard(anthropic);
    await userEvent.click(
      screen.getByRole("button", { name: /add api key/i })
    );
    await userEvent.type(
      screen.getByPlaceholderText(/paste your anthropic api key/i),
      "sk-reload"
    );
    await userEvent.click(screen.getByRole("button", { name: /^connect$/i }));
    await waitFor(() =>
      expect(screen.getByText(/^verified$/i)).toBeInTheDocument()
    );

    rendered.unmount();
    renderCard(anthropic, { configured: true });
    expect(screen.getByText(/^configured$/i)).toBeInTheDocument();
    expect(screen.queryByText(/^verified$/i)).not.toBeInTheDocument();
  });

  it("opens a blank replacement field and verifies the replacement", async () => {
    renderCard(anthropic, { configured: true });

    await userEvent.click(screen.getByRole("button", { name: /replace key/i }));
    const input = screen.getByPlaceholderText(/paste your anthropic api key/i);
    expect(input).toHaveValue("");
    await userEvent.type(input, "sk-replacement");
    await userEvent.click(screen.getByRole("button", { name: /^replace$/i }));

    await waitFor(() =>
      expect(updateSecret).toHaveBeenCalledWith(
        "ANTHROPIC_API_KEY",
        "sk-replacement"
      )
    );
    expect(screen.getByText(/^verified$/i)).toBeInTheDocument();
  });
});
