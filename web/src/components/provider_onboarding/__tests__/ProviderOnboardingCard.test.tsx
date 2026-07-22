import React from "react";
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
const mockUseSecretsStore = useSecretsStore as unknown as jest.Mock;
const mockUseNotificationStore = useNotificationStore as unknown as jest.Mock;

const updateSecret = jest.fn().mockResolvedValue(undefined);
const addNotification = jest.fn();

const oauthState = (overrides: Partial<OAuthConnection>): OAuthConnection => ({
  label: "",
  isConnected: false,
  isConnecting: false,
  canDisconnect: false,
  connect: jest.fn(),
  disconnect: jest.fn(),
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
  mockUseSecretsStore.mockImplementation((selector: (s: unknown) => unknown) =>
    selector({ updateSecret })
  );
  mockUseNotificationStore.mockImplementation(
    (selector: (s: unknown) => unknown) => selector({ addNotification })
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

  it("saves a pasted API key for a key-based provider", async () => {
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
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success" })
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
