import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../../__mocks__/themeMock";

const listQuery = jest.fn();
const createLinkCode = jest.fn();
const unlink = jest.fn();

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    integrations: {
      list: { query: (...args: unknown[]) => listQuery(...args) },
      createLinkCode: { mutate: (...args: unknown[]) => createLinkCode(...args) },
      unlink: { mutate: (...args: unknown[]) => unlink(...args) }
    }
  }
}));

import ConnectedAccountsSettings from "../ConnectedAccountsSettings";

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={mockTheme}>
        <ConnectedAccountsSettings />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  listQuery.mockResolvedValue({ identities: [] });
});

describe("ConnectedAccountsSettings", () => {
  it("offers Connect Telegram when nothing is linked", async () => {
    renderCard();

    expect(
      await screen.findByRole("button", { name: /connect telegram/i })
    ).toBeInTheDocument();
    expect(screen.queryByText(/waiting for telegram/i)).not.toBeInTheDocument();
  });

  it("shows the deep link and the code while a link is pending", async () => {
    createLinkCode.mockResolvedValue({
      code: "abc123",
      deep_link: "https://t.me/NodeToolBot?start=abc123",
      expires_at: new Date(Date.now() + 600_000).toISOString()
    });
    renderCard();

    await userEvent.click(
      await screen.findByRole("button", { name: /connect telegram/i })
    );

    expect(createLinkCode).toHaveBeenCalledWith({ provider: "telegram" });
    const link = await screen.findByRole("link", {
      name: /open telegram and press start/i
    });
    expect(link).toHaveAttribute("href", "https://t.me/NodeToolBot?start=abc123");
    expect(screen.getByText("abc123")).toBeInTheDocument();
    expect(screen.getByText(/waiting for telegram/i)).toBeInTheDocument();
  });

  it("falls back to the bare code when the server has no bot username", async () => {
    createLinkCode.mockResolvedValue({
      code: "abc123",
      deep_link: null,
      expires_at: new Date(Date.now() + 600_000).toISOString()
    });
    renderCard();

    await userEvent.click(
      await screen.findByRole("button", { name: /connect telegram/i })
    );

    expect(
      await screen.findByText(/\/start abc123/i, { exact: false })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /open telegram/i })
    ).not.toBeInTheDocument();
  });

  it("shows the linked account, its date, and a confirmed disconnect", async () => {
    listQuery.mockResolvedValue({
      identities: [
        {
          provider: "telegram",
          external_id: "12345",
          linked_at: "2026-08-01T10:00:00.000Z"
        }
      ]
    });
    unlink.mockResolvedValue({ unlinked: true });
    renderCard();

    expect(await screen.findByText(/12345/)).toBeInTheDocument();
    expect(screen.getByText(/^Linked /)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /connect telegram/i })
    ).not.toBeInTheDocument();

    // The first press asks; only the second one unlinks.
    await userEvent.click(
      screen.getByRole("button", { name: /^disconnect$/i })
    );
    expect(unlink).not.toHaveBeenCalled();
    expect(screen.getByText(/disconnect this account\?/i)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /^disconnect$/i })
    );
    await waitFor(() =>
      expect(unlink).toHaveBeenCalledWith({
        provider: "telegram",
        external_id: "12345"
      })
    );
  });

  it("replaces the pending code with the account once the link lands", async () => {
    createLinkCode.mockResolvedValue({
      code: "abc123",
      deep_link: "https://t.me/NodeToolBot?start=abc123",
      expires_at: new Date(Date.now() + 600_000).toISOString()
    });
    renderCard();

    await userEvent.click(
      await screen.findByRole("button", { name: /connect telegram/i })
    );
    expect(await screen.findByText("abc123")).toBeInTheDocument();

    // The bridge completed the link server-side; the poll picks it up.
    listQuery.mockResolvedValue({
      identities: [
        {
          provider: "telegram",
          external_id: "12345",
          linked_at: "2026-08-01T10:00:00.000Z"
        }
      ]
    });

    await waitFor(
      () => expect(screen.getByText(/12345/)).toBeInTheDocument(),
      { timeout: 5000 }
    );
    expect(screen.queryByText("abc123")).not.toBeInTheDocument();
  });
});
