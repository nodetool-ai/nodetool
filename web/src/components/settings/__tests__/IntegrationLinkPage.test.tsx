import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import mockTheme from "../../../__mocks__/themeMock";

const describeLinkCode = jest.fn();
const confirmLink = jest.fn();

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    integrations: {
      describeLinkCode: {
        query: (...args: unknown[]) => describeLinkCode(...args)
      },
      confirmLink: { mutate: (...args: unknown[]) => confirmLink(...args) }
    }
  }
}));

import IntegrationLinkPage from "../IntegrationLinkPage";

function renderPage(search: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={mockTheme}>
        <MemoryRouter initialEntries={[`/integrations/link${search}`]}>
          <Routes>
            <Route path="/integrations/link" element={<IntegrationLinkPage />} />
            <Route path="/workspace" element={<div>workspace</div>} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => jest.clearAllMocks());

describe("IntegrationLinkPage", () => {
  it("names the external account and links it on confirm", async () => {
    describeLinkCode.mockResolvedValue({
      provider: "telegram",
      external_id: "12345"
    });
    confirmLink.mockResolvedValue({ linked: true, external_id: "12345" });

    renderPage("?code=abc123");

    expect(
      await screen.findByText(/link telegram account 12345\?/i)
    ).toBeInTheDocument();
    expect(describeLinkCode).toHaveBeenCalledWith({ code: "abc123" });

    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() =>
      expect(confirmLink).toHaveBeenCalledWith({
        provider: "telegram",
        code: "abc123"
      })
    );
    expect(await screen.findByText(/is linked/i)).toBeInTheDocument();
  });

  it("says so plainly when the code is expired or used", async () => {
    describeLinkCode.mockRejectedValue(new Error("gone"));

    renderPage("?code=stale");

    expect(
      await screen.findByText(/expired or was already used/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /confirm/i })
    ).not.toBeInTheDocument();
  });

  it("treats a missing code as an expired link rather than asking the server", async () => {
    renderPage("");

    expect(
      await screen.findByText(/expired or was already used/i)
    ).toBeInTheDocument();
    expect(describeLinkCode).not.toHaveBeenCalled();
  });
});
