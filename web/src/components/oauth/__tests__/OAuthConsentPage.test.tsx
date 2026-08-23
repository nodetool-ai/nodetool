import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import mockTheme from "../../../__mocks__/themeMock";

const getOauthRequest = jest.fn();
const approveOauthRequest = jest.fn();
const denyOauthRequest = jest.fn();

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    agentAccess: {
      getOauthRequest: {
        query: (...args: unknown[]) => getOauthRequest(...args)
      },
      approveOauthRequest: {
        mutate: (...args: unknown[]) => approveOauthRequest(...args)
      },
      denyOauthRequest: {
        mutate: (...args: unknown[]) => denyOauthRequest(...args)
      }
    }
  }
}));

const navigateToRedirect = jest.fn();
jest.mock("../navigate", () => ({
  navigateToRedirect: (...args: unknown[]) => navigateToRedirect(...args)
}));

import OAuthConsentPage from "../OAuthConsentPage";

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={mockTheme}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/oauth/consent" element={<OAuthConsentPage />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

const REQUEST = {
  client_name: "Claude Code",
  redirect_host: "127.0.0.1:54321",
  scope: "mcp",
  loopback_only: true
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("OAuthConsentPage", () => {
  it("shows the request has expired when there is no request_id", async () => {
    renderAt("/oauth/consent");
    expect(
      await screen.findByText(/no authorization request/i)
    ).toBeInTheDocument();
    expect(getOauthRequest).not.toHaveBeenCalled();
  });

  it("renders client name, redirect host, scope, and the loopback warning", async () => {
    getOauthRequest.mockResolvedValue(REQUEST);
    renderAt("/oauth/consent?request_id=req_1");

    expect(await screen.findByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("127.0.0.1:54321")).toBeInTheDocument();
    expect(screen.getByText("mcp")).toBeInTheDocument();
    expect(
      screen.getByText(/only redirects to localhost/i)
    ).toBeInTheDocument();
  });

  it("does not show the loopback warning when the client is not loopback-only", async () => {
    getOauthRequest.mockResolvedValue({ ...REQUEST, loopback_only: false });
    renderAt("/oauth/consent?request_id=req_1");

    await screen.findByText("Claude Code");
    expect(
      screen.queryByText(/only redirects to localhost/i)
    ).not.toBeInTheDocument();
  });

  it("shows the expired state when the request is null", async () => {
    getOauthRequest.mockResolvedValue(null);
    renderAt("/oauth/consent?request_id=req_1");

    expect(
      await screen.findByText(/expired or already handled/i)
    ).toBeInTheDocument();
  });

  it("navigates to the returned redirect_url on approve", async () => {
    getOauthRequest.mockResolvedValue(REQUEST);
    approveOauthRequest.mockResolvedValue({
      redirect_url: "http://127.0.0.1:54321/cb?code=abc&state=xyz"
    });
    const user = userEvent.setup();
    renderAt("/oauth/consent?request_id=req_1");

    await user.click(await screen.findByRole("button", { name: /approve/i }));

    await waitFor(() =>
      expect(approveOauthRequest).toHaveBeenCalledWith({
        request_id: "req_1"
      })
    );
    await waitFor(() =>
      expect(navigateToRedirect).toHaveBeenCalledWith(
        "http://127.0.0.1:54321/cb?code=abc&state=xyz"
      )
    );
  });

  it("navigates to the returned redirect_url on deny", async () => {
    getOauthRequest.mockResolvedValue(REQUEST);
    denyOauthRequest.mockResolvedValue({
      redirect_url: "http://127.0.0.1:54321/cb?error=access_denied"
    });
    const user = userEvent.setup();
    renderAt("/oauth/consent?request_id=req_1");

    await user.click(await screen.findByRole("button", { name: /deny/i }));

    await waitFor(() =>
      expect(denyOauthRequest).toHaveBeenCalledWith({ request_id: "req_1" })
    );
    await waitFor(() =>
      expect(navigateToRedirect).toHaveBeenCalledWith(
        "http://127.0.0.1:54321/cb?error=access_denied"
      )
    );
  });

  it("renders a visible error when the approve mutation fails", async () => {
    getOauthRequest.mockResolvedValue(REQUEST);
    approveOauthRequest.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    renderAt("/oauth/consent?request_id=req_1");

    await user.click(await screen.findByRole("button", { name: /approve/i }));

    expect(await screen.findByText(/network down/i)).toBeInTheDocument();
    expect(navigateToRedirect).not.toHaveBeenCalled();
  });
});
