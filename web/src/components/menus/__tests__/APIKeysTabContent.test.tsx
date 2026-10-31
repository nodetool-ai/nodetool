import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../../__mocks__/themeMock";

import { useOAuthConnection } from "../../../hooks/useOAuthConnection";

// Hosted deployment: neither the browser nor the server is local.
jest.mock("../../../lib/env", () => ({
  isLocalhost: false,
  isElectron: false
}));
jest.mock("../../../hooks/useOAuthConnection");
jest.mock("../../../hooks/useProviders", () => ({
  useProviders: () => ({
    providers: [],
    isLoading: true,
    isFetching: true,
    error: null
  })
}));
jest.mock("../GoogleWorkspaceCard", () => () => null);
// The custom-provider section lists the user's endpoints over tRPC; this suite
// has no server, and an empty catalog is the state it renders here.
jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    customProviders: {
      list: { query: jest.fn().mockResolvedValue([]) },
      save: { mutate: jest.fn() },
      delete: { mutate: jest.fn() },
      test: { mutate: jest.fn() }
    }
  }
}));
// The server lists every known key; unconfigured ones are placeholders.
const mockSecrets = [
  { key: "DATA_FOR_SEO_LOGIN", is_configured: false },
  { key: "DATA_FOR_SEO_PASSWORD", is_configured: false },
  { key: "HIGGSFIELD_API_KEY_ID", is_configured: false },
  { key: "HIGGSFIELD_API_KEY_SECRET", is_configured: false },
  { key: "OPENROUTER_API_KEY", is_configured: false }
];
const mockUpdateSecret = jest.fn();
const mockValidateSecret = jest.fn();
const mockDeleteSecret = jest.fn();
jest.mock("../../../stores/SecretsStore", () => ({
  __esModule: true,
  default: <T,>(
    selector: (state: {
      secrets: unknown[];
      updateSecret: jest.Mock;
      validateSecret: jest.Mock;
      deleteSecret: jest.Mock;
    }) => T
  ) =>
    selector({
      secrets: mockSecrets,
      updateSecret: mockUpdateSecret,
      validateSecret: mockValidateSecret,
      deleteSecret: mockDeleteSecret
    })
}));
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: <T,>(
    selector: (state: { addNotification: jest.Mock }) => T
  ) => selector({ addNotification: jest.fn() })
}));

// Imported after the mocks so the module picks up the hosted-env values.
import { APIKeysTabContent } from "../APIKeysTab";

describe("APIKeysTabContent on a hosted deployment", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateSecret.mockResolvedValue(undefined);
    mockValidateSecret.mockResolvedValue({
      status: "valid",
      valid: true,
      message: "OpenRouter accepted the key."
    });
    (useOAuthConnection as jest.MockedFunction<typeof useOAuthConnection>)
      .mockReturnValue({
        label: "",
        isConnected: false,
        isConnecting: false,
        canDisconnect: false,
        connect: jest.fn(),
        disconnect: jest.fn(),
        manualPrompt: null,
        isSubmittingManual: false,
        submitManualCode: jest.fn(),
        cancelManual: jest.fn()
      });
  });

  it("lists one OpenAI card with the ChatGPT sign-in and hides local-only Claude Code", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={mockTheme}>
          <APIKeysTabContent />
        </ThemeProvider>
      </QueryClientProvider>
    );

    expect(
      screen.queryByRole("button", { name: /sign in with claude/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Codex")).not.toBeInTheDocument();
    expect(screen.queryByText("Antigravity")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /install antigravity/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.getAllByText("OpenAI")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: /sign in with openai/i })
    ).toBeInTheDocument();
    expect(screen.queryByText("Claude Code")).not.toBeInTheDocument();
  });

  it("does not mark placeholder secrets as connected", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={mockTheme}>
          <APIKeysTabContent />
        </ThemeProvider>
      </QueryClientProvider>
    );

    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
  });

  // A placeholder row and the catalog entry for the same provider both landed
  // in its section, so every unconnected provider with a placeholder showed
  // twice (and React warned about duplicate keys).
  it("lists an unconnected provider once", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={mockTheme}>
          <APIKeysTabContent />
        </ThemeProvider>
      </QueryClientProvider>
    );

    expect(screen.getAllByText("OpenRouter")).toHaveLength(1);
  });

  it("validates a pasted single-field API key before saving and blocks rejected keys unless confirmed", async () => {
    mockValidateSecret.mockResolvedValue({
      status: "invalid",
      valid: false,
      message: "OpenRouter rejected the key (401)."
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={mockTheme}>
          <APIKeysTabContent />
        </ThemeProvider>
      </QueryClientProvider>
    );

    const openRouterCard = screen.getByRole("article", { name: "OpenRouter" });
    await userEvent.click(
      within(openRouterCard).getByRole("button", { name: "Connect" })
    );

    const dialog = screen.getByRole("dialog");
    const input = within(dialog).getByLabelText("API key");
    await userEvent.type(input, "  k-or-v1-missing-leading-s  ");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Connect" })
    );

    await waitFor(() =>
      expect(mockValidateSecret).toHaveBeenCalledWith(
        "OPENROUTER_API_KEY",
        "k-or-v1-missing-leading-s"
      )
    );
    expect(mockUpdateSecret).not.toHaveBeenCalled();
    expect(
      within(dialog).getByText(/rejected the key/i)
    ).toBeInTheDocument();

    // Clicking "Save anyway" persists the trimmed key if the user insists.
    await userEvent.click(
      within(dialog).getByRole("button", { name: /save anyway/i })
    );
    await waitFor(() =>
      expect(mockUpdateSecret).toHaveBeenCalledWith(
        "OPENROUTER_API_KEY",
        "k-or-v1-missing-leading-s"
      )
    );
  });
});
