import { stub } from "../../../test-utils/doubles";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

import { ProviderCard } from "../APIKeysTab";
import type { ProviderMeta } from "../providerCatalog";
import type { SecretResponse } from "../../../stores/ApiTypes";
import {
  useOAuthConnection,
  type OAuthConnection
} from "../../../hooks/useOAuthConnection";

import { useProviders } from "../../../hooks/useProviders";

jest.mock("../../../hooks/useOAuthConnection");
jest.mock("../../../hooks/useProviders");

const mockUseOAuthConnection = useOAuthConnection as jest.MockedFunction<
  typeof useOAuthConnection
>;

const mockUseProviders = useProviders as jest.MockedFunction<typeof useProviders>;

const registryWith = (...ids: string[]) => ({
  providers: ids.map((provider) => ({
    provider,
    capabilities: ["generate_message"]
  })),
  isLoading: false,
  isFetching: false,
  error: null
});

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

const secret = (isConfigured: boolean): SecretResponse =>
  stub<SecretResponse>({
    key: "OPENAI_API_KEY",
    is_configured: isConfigured,
    description: "",
    user_id: null,
    created_at: null,
    updated_at: null
  });

const oauthMeta = {
  key: "OPENAI_API_KEY",
  providerId: "openai" as const,
  name: "OpenAI",
  description: "GPT models.",
  section: "popular" as const,
  docsUrl: "https://platform.openai.com/docs",
  oauth: "openai" as const
};

const plainMeta = {
  key: "GROQ_API_KEY",
  name: "Groq",
  description: "Fast inference.",
  section: "language" as const,
  docsUrl: "https://console.groq.com/docs"
};

const renderCard = (meta: ProviderMeta, isConfigured = false) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ProviderCard
        secret={secret(isConfigured)}
        meta={meta}
        onConnect={jest.fn()}
        onManage={jest.fn()}
        onDelete={jest.fn()}
      />
    </ThemeProvider>
  );

describe("ProviderCard OAuth variant", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseOAuthConnection.mockReturnValue(oauthState({}));
    mockUseProviders.mockReturnValue(registryWith("openai", "groq"));
  });

  it("shows a sign-in action for an OAuth provider that is not connected", () => {
    mockUseOAuthConnection.mockReturnValue(
      oauthState({ label: "OpenAI", canDisconnect: true })
    );

    renderCard(oauthMeta);

    expect(
      screen.getByRole("button", { name: /sign in with openai/i })
    ).toBeInTheDocument();
    expect(screen.queryByText(/connected via oauth/i)).not.toBeInTheDocument();
  });

  it("shows the OAuth pill and a disconnect action when connected", async () => {
    const disconnect = jest.fn();
    mockUseOAuthConnection.mockReturnValue(
      oauthState({
        label: "OpenAI",
        isConnected: true,
        canDisconnect: true,
        disconnect
      })
    );

    renderCard(oauthMeta);

    expect(screen.getByText(/connected via oauth/i)).toBeInTheDocument();
    const disconnectButton = screen.getByRole("button", {
      name: /disconnect/i
    });
    await userEvent.click(disconnectButton);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("hides disconnect for a connected provider that does not support it", () => {
    mockUseOAuthConnection.mockReturnValue(
      oauthState({ label: "HuggingFace", isConnected: true, canDisconnect: false })
    );

    renderCard(oauthMeta);

    expect(screen.getByText(/connected via oauth/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /disconnect/i })
    ).not.toBeInTheDocument();
  });

  it("renders no OAuth affordances for a non-OAuth provider", () => {
    renderCard(plainMeta);

    expect(
      screen.queryByRole("button", { name: /sign in with/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/connected via oauth/i)).not.toBeInTheDocument();
  });

  it("shows a disabled connecting state while an OAuth flow is in progress", () => {
    mockUseOAuthConnection.mockReturnValue(
      oauthState({ label: "OpenAI", isConnecting: true })
    );

    renderCard(oauthMeta);

    const button = screen.getByRole("button", { name: /connecting/i });
    expect(button).toBeDisabled();
    // The normal sign-in affordance is replaced while connecting.
    expect(
      screen.queryByRole("button", { name: /sign in with openai/i })
    ).not.toBeInTheDocument();
  });
});

describe("ProviderCard registry availability", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseOAuthConnection.mockReturnValue(oauthState({}));
    mockUseProviders.mockReturnValue(registryWith("openai", "groq"));
  });

  it("says Unavailable when the server does not offer the connected provider", () => {
    mockUseOAuthConnection.mockReturnValue(
      oauthState({ label: "OpenAI", isConnected: true })
    );
    mockUseProviders.mockReturnValue(registryWith("groq"));

    renderCard({ ...oauthMeta, oauthOnly: true });

    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByText(/does not offer OpenAI/i)).toBeInTheDocument();
    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
  });

  it("says Connected when the server offers the provider", () => {
    mockUseOAuthConnection.mockReturnValue(
      oauthState({ label: "OpenAI", isConnected: true })
    );

    renderCard({ ...oauthMeta, oauthOnly: true });

    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.queryByText("Unavailable")).not.toBeInTheDocument();
  });

  it("holds the connected state while the provider query is still loading", () => {
    mockUseProviders.mockReturnValue({
      providers: [],
      isLoading: true,
      isFetching: true,
      error: null
    });

    renderCard(plainMeta, true);

    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("stays quiet for a card with no registry provider behind it", () => {
    mockUseProviders.mockReturnValue(registryWith("openai"));

    renderCard({ ...plainMeta, providerId: undefined }, true);

    expect(screen.getByText("Connected")).toBeInTheDocument();
  });
});
