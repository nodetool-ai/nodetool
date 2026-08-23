import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../../__mocks__/themeMock";

const mcpConnection = jest.fn();
const listTokens = jest.fn();
const createToken = jest.fn();
const revokeToken = jest.fn();
const listOauthGrants = jest.fn();
const revokeOauthGrant = jest.fn();

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    agentAccess: {
      mcpConnection: { query: (...args: unknown[]) => mcpConnection(...args) },
      listTokens: { query: (...args: unknown[]) => listTokens(...args) },
      createToken: { mutate: (...args: unknown[]) => createToken(...args) },
      revokeToken: { mutate: (...args: unknown[]) => revokeToken(...args) },
      listOauthGrants: {
        query: (...args: unknown[]) => listOauthGrants(...args)
      },
      revokeOauthGrant: {
        mutate: (...args: unknown[]) => revokeOauthGrant(...args)
      }
    }
  }
}));
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: <T,>(
    selector: (state: { addNotification: jest.Mock }) => T
  ) => selector({ addNotification: jest.fn() })
}));

import AgentAccessSection from "../AgentAccessSection";

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={mockTheme}>
        <AgentAccessSection />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

const ENABLED = {
  enabled: true,
  url: null,
  auth_mode: "token" as const,
  enable_flag: null
};

beforeEach(() => {
  jest.clearAllMocks();
  mcpConnection.mockResolvedValue(ENABLED);
  listTokens.mockResolvedValue({ tokens: [] });
  listOauthGrants.mockResolvedValue({ grants: [] });
});

describe("AgentAccessSection", () => {
  it("falls back to this page's origin when the server names no public URL", async () => {
    renderSection();
    expect(
      await screen.findByText(`${window.location.origin}/mcp`)
    ).toBeInTheDocument();
  });

  it("prefers the server's configured public URL over the page origin", async () => {
    mcpConnection.mockResolvedValue({
      ...ENABLED,
      url: "https://nodetool.example.com/mcp"
    });
    renderSection();
    expect(
      await screen.findByText("https://nodetool.example.com/mcp")
    ).toBeInTheDocument();
  });

  it("names the env var to set when the server does not serve /mcp", async () => {
    mcpConnection.mockResolvedValue({
      enabled: false,
      url: null,
      auth_mode: "token" as const,
      enable_flag: "NODETOOL_ENABLE_MCP"
    });
    renderSection();
    expect(await screen.findByText(/NODETOOL_ENABLE_MCP/)).toBeInTheDocument();
  });

  it("shows a minted token once, with a config block carrying it", async () => {
    createToken.mockResolvedValue({
      token: "ntk_abc123_secret-half",
      record: {
        id: "abc123",
        name: "Claude Code",
        created_at: "2026-08-22T00:00:00.000Z",
        expires_at: null,
        last_used_at: null
      }
    });
    const user = userEvent.setup();
    renderSection();

    await user.type(
      await screen.findByLabelText(/token name/i),
      "Claude Code"
    );
    await user.click(screen.getByRole("button", { name: /create token/i }));

    await waitFor(() =>
      expect(createToken).toHaveBeenCalledWith({
        name: "Claude Code",
        expires_in_days: null
      })
    );
    expect(await screen.findByText("ntk_abc123_secret-half")).toBeInTheDocument();
    expect(
      screen.getByText(/shown once and cannot be retrieved again/i)
    ).toBeInTheDocument();
    // Both pasteable forms carry the token, not just the URL.
    expect(
      screen.getByText(
        /claude mcp add .*Authorization: Bearer ntk_abc123_secret-half/s
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(/"mcpServers".*Bearer ntk_abc123_secret-half/s)
    ).toBeInTheDocument();
  });

  it("will not create a token without a name", async () => {
    renderSection();
    await waitFor(() => expect(listTokens).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /create token/i })).toBeDisabled();
    expect(createToken).not.toHaveBeenCalled();
  });

  it("lists existing tokens and revokes one", async () => {
    listTokens.mockResolvedValue({
      tokens: [
        {
          id: "abc123",
          name: "Claude Code",
          created_at: "2026-08-01T00:00:00.000Z",
          expires_at: null,
          last_used_at: null
        }
      ]
    });
    revokeToken.mockResolvedValue({ revoked: true });
    const user = userEvent.setup();
    renderSection();

    expect(await screen.findByText("Claude Code")).toBeInTheDocument();
    expect(
      screen.getByText(/Created .* Last used never .* No expiry/)
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /revoke/i }));
    await waitFor(() =>
      expect(revokeToken).toHaveBeenCalledWith({ id: "abc123" })
    );
  });

  it("says so when the server checks no credential", async () => {
    mcpConnection.mockResolvedValue({ ...ENABLED, auth_mode: "none" });
    renderSection();
    expect(
      await screen.findByText(/checks no credential/i)
    ).toBeInTheDocument();
  });

  it("shows an empty state when no MCP client is connected", async () => {
    renderSection();
    expect(
      await screen.findByText(/no mcp client has connected yet/i)
    ).toBeInTheDocument();
  });

  it("lists connected MCP clients and revokes one after confirming", async () => {
    listOauthGrants.mockResolvedValue({
      grants: [
        {
          id: "grant_1",
          client_name: "Claude Code",
          client_id: "ntc_abc123",
          created_at: "2026-08-01T00:00:00.000Z",
          scope: "mcp"
        }
      ]
    });
    revokeOauthGrant.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderSection();

    expect(await screen.findByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText(/ntc_abc123/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /revoke/i }));
    // Revoking is confirmed via a dialog, not fired straight from the list.
    expect(revokeOauthGrant).not.toHaveBeenCalled();

    await user.click(
      await screen.findByRole("button", { name: /disconnect/i })
    );
    await waitFor(() =>
      expect(revokeOauthGrant).toHaveBeenCalledWith({ grant_id: "grant_1" })
    );
  });
});
