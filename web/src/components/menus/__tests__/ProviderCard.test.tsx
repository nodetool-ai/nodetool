import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import { ProviderCard } from "../APIKeysTab";
import type { SecretResponse } from "../../../stores/ApiTypes";
import {
  useOAuthConnection,
  type OAuthConnection
} from "../../../hooks/useOAuthConnection";

jest.mock("../../../hooks/useOAuthConnection");

const mockUseOAuthConnection = useOAuthConnection as jest.MockedFunction<
  typeof useOAuthConnection
>;

const oauthState = (overrides: Partial<OAuthConnection>): OAuthConnection => ({
  label: "",
  isConnected: false,
  isConnecting: false,
  canDisconnect: false,
  connect: jest.fn(),
  disconnect: jest.fn(),
  ...overrides
});

const secret = (isConfigured: boolean): SecretResponse =>
  ({
    key: "OPENAI_API_KEY",
    is_configured: isConfigured,
    description: "",
    user_id: null,
    created_at: null,
    updated_at: null
  }) as unknown as SecretResponse;

const oauthMeta = {
  key: "OPENAI_API_KEY",
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

const renderCard = (meta: typeof oauthMeta | typeof plainMeta, isConfigured = false) =>
  render(
    <ThemeProvider theme={createTheme({ cssVariables: true })}>
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
});
